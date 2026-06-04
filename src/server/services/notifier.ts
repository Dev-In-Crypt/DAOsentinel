import { eq, and, arrayContains } from 'drizzle-orm';
import { db } from '../db';
import { users, alerts, daos } from '../db/schema';
import { shortenAddress } from '@/lib/utils';
import type { Alert, Dao } from '../db/schema';
import { notifyAlert } from '../db/notify';

const TG_API = 'https://api.telegram.org';

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
        await sendTelegram(u.telegramChatId, formatAlertForTelegram(alert, dao));
      }
      await db
        .update(alerts)
        .set({ publishedToTelegram: true })
        .where(eq(alerts.id, alert.id));
    } catch (err) {
      console.error('telegram publish failed', err);
    }
  }

  // 2. Discord webhook
  if (process.env.DISCORD_WEBHOOK_URL && alert.severity !== 'info') {
    try {
      await fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'DAO Sentinel',
          content: `**${alert.title}**\n${alert.description}`,
        }),
      });
    } catch (err) {
      console.error('discord publish failed', err);
    }
  }
}

async function sendTelegram(chatId: string, text: string) {
  await fetch(`${TG_API}/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

export function formatAlertForTelegram(alert: Alert, dao: Dao): string {
  const data = (alert.data ?? {}) as Record<string, unknown>;
  const voter = typeof data.voter === 'string' ? shortenAddress(data.voter) : '';
  return `*${alert.title}*\n${alert.description}${voter ? `\nVoter: \`${voter}\`` : ''}\n[Open ${dao.name} on DAO Sentinel](https://daosentinel.xyz/daos/${dao.slug})`;
}
