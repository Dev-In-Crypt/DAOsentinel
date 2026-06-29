import { eq, and, arrayContains, isNotNull } from 'drizzle-orm';
import { Resend } from 'resend';
import { db } from '../db';
import { users, alerts, daos } from '../db/schema';
import { shortenAddress } from '@/lib/utils';
import type { Alert, Dao } from '../db/schema';
import { notifyAlert } from '../db/notify';
import { renderWhaleAlert } from '../email/render';
import { sendTelegramMessage } from '@/lib/telegram';
import { sendDiscordAlert } from '@/lib/discord';
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'DAO Sentinel <noreply@daosentinel.xyz>';
const APP_BASE = process.env.NEXTAUTH_URL || 'https://www.daosentinel.xyz';

export async function publishAlert(alertId: string): Promise<void> {
  const [row] = await db
    .select({ alert: alerts, dao: daos })
    .from(alerts)
    .innerJoin(daos, eq(daos.id, alerts.daoId))
    .where(eq(alerts.id, alertId))
    .limit(1);
  if (!row) return;

  const { alert, dao } = row;

  // 0. Postgres NOTIFY → drives SSE clients watching /alerts in real-time.
  await notifyAlert({
    id: alert.id,
    type: alert.type,
    severity: alert.severity,
    title: alert.title,
    description: alert.description,
    daoSlug: dao.slug,
    daoName: dao.name,
    proposalId: alert.proposalId,
    createdAt: alert.createdAt.toISOString(),
  });

  // 1. Telegram broadcast for subscribers watching this DAO
  if (process.env.TELEGRAM_BOT_TOKEN) {
    try {
      const subs = await db
        .select()
        .from(users)
        .where(
          and(eq(users.alertTelegram, true), arrayContains(users.watchedDaos, [dao.slug])),
        );
      for (const u of subs) {
        if (!u.telegramChatId) continue;
        await sendTelegramMessage(u.telegramChatId, formatAlertForTelegram(alert, dao));
      }
      await db
        .update(alerts)
        .set({ publishedToTelegram: true })
        .where(eq(alerts.id, alert.id));
    } catch (err) {
      console.error('telegram publish failed', err);
    }
  }

  // 2. Discord delivery (warning/critical only).
  if (alert.severity !== 'info') {
    const link = alert.proposalId
      ? `${APP_BASE}/proposals/${alert.proposalId}`
      : `${APP_BASE}/daos/${dao.slug}`;
    const payload = {
      title: alert.title,
      description: alert.description,
      url: link,
      severity: alert.severity as 'warning' | 'critical',
    };

    // 2a. Global server-wide webhook (optional).
    if (process.env.DISCORD_WEBHOOK_URL) {
      try {
        await sendDiscordAlert(process.env.DISCORD_WEBHOOK_URL, payload);
      } catch (err) {
        console.error('global discord publish failed', err);
      }
    }

    // 2b. Per-user webhooks for watchers who configured one.
    try {
      const subs = await db
        .select({ url: users.discordWebhookUrl })
        .from(users)
        .where(
          and(
            isNotNull(users.discordWebhookUrl),
            arrayContains(users.watchedDaos, [dao.slug]),
          ),
        );
      for (const s of subs) {
        if (s.url) await sendDiscordAlert(s.url, payload);
      }
    } catch (err) {
      console.error('per-user discord publish failed', err);
    }
  }

  // 3. Email broadcast for watchers who opted into email alerts.
  // Only warning/critical severities email — info-level whale votes would
  // be too noisy. Idempotent at the call site (publishAlert runs once per
  // freshly-inserted alert), guarded again by the publishedToEmail flag.
  if (resend && alert.severity !== 'info' && !alert.publishedToEmail) {
    try {
      const subs = await db
        .select({ email: users.email })
        .from(users)
        .where(and(eq(users.alertEmail, true), arrayContains(users.watchedDaos, [dao.slug])));

      const recipients = subs.map((s) => s.email).filter((e): e is string => Boolean(e));
      if (recipients.length) {
        const { subject, html } = await buildAlertEmail(alert, dao);
        // Resend allows batching but caps `to` at 50 — chunk defensively.
        for (const batch of chunk(recipients, 45)) {
          await resend.emails.send({ from: EMAIL_FROM, to: batch, subject, html });
        }
      }
      await db
        .update(alerts)
        .set({ publishedToEmail: true })
        .where(eq(alerts.id, alert.id));
    } catch (err) {
      console.error('email publish failed', err);
    }
  }
}

/** Build the subject + HTML body for an alert email, by alert type. */
async function buildAlertEmail(alert: Alert, dao: Dao): Promise<{ subject: string; html: string }> {
  const data = (alert.data ?? {}) as Record<string, unknown>;

  if (alert.type === 'whale_vote') {
    const html = await renderWhaleAlert({
      daoName: dao.name,
      daoSlug: dao.slug,
      proposalTitle: typeof data.proposalTitle === 'string' ? data.proposalTitle : alert.title,
      proposalId: alert.proposalId ?? '',
      voter: typeof data.voter === 'string' ? data.voter : '',
      vp: typeof data.vp === 'number' ? data.vp : 0,
      vpPct: typeof data.vpPct === 'number' ? data.vpPct : 0,
      choice: typeof data.choiceLabel === 'string' ? data.choiceLabel : 'their choice',
    });
    return { subject: `🐳 Whale vote on ${dao.name}`, html };
  }

  // Generic fallback for swing / quorum-risk / score-drop / anything else.
  const link = alert.proposalId
    ? `${APP_BASE}/proposals/${alert.proposalId}`
    : `${APP_BASE}/daos/${dao.slug}`;
  return { subject: alert.title, html: genericAlertHtml(alert, dao, link) };
}

function genericAlertHtml(alert: Alert, dao: Dao, link: string): string {
  const accent =
    alert.severity === 'critical' ? '#fb7185' : alert.severity === 'warning' ? '#f59e0b' : '#818cf8';
  return `<!doctype html><html><body style="margin:0;background:#0a0a0a;color:#fafafa;font-family:system-ui,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <h1 style="color:${accent};font-size:22px;margin:0 0 12px">${escapeHtml(alert.title)}</h1>
    <div style="background:#171717;border:1px solid #262626;border-radius:8px;padding:16px;margin:20px 0">
      <p style="color:#d4d4d4;font-size:14px;line-height:21px;margin:0 0 14px">${escapeHtml(alert.description)}</p>
      <a href="${link}" style="color:#818cf8;font-weight:600;text-decoration:none">View on DAO Sentinel →</a>
    </div>
    <p style="color:#a3a3a3;font-size:12px;line-height:18px">
      You're getting this because <code>${escapeHtml(dao.slug)}</code> is on your watchlist.
      <a href="${APP_BASE}/settings" style="color:#818cf8">Manage alerts</a>
    </p>
  </div></body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function formatAlertForTelegram(alert: Alert, dao: Dao): string {
  const data = (alert.data ?? {}) as Record<string, unknown>;
  const voter = typeof data.voter === 'string' ? shortenAddress(data.voter) : '';
  return `*${alert.title}*\n${alert.description}${voter ? `\nVoter: \`${voter}\`` : ''}\n[Open ${dao.name} on DAO Sentinel](https://daosentinel.xyz/daos/${dao.slug})`;
}
