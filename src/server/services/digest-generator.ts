import { Resend } from 'resend';
import { renderWeeklyDigest } from '../email/render';
import { chat } from '../ai/openrouter';
import { eq, desc, sql, gt, and } from 'drizzle-orm';
import { db } from '../db';
import {
  proposals,
  daos,
  alerts,
  scoreHistory,
  digests,
  newsletterSubscribers,
} from '../db/schema';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export const DIGEST_SYSTEM_PROMPT = `You are the editor of DAO Sentinel Weekly, a newsletter for DAO governance observers.

Write a concise, scannable weekly digest in Markdown. Use this exact structure:

# DAO Sentinel Weekly — {date}

## 📰 Top stories
For each of the top 3-5 proposals: a one-line headline, one sentence on what's at stake, and the DAO name + result/state.

## 🐳 Whale activity
2-4 short bullets on the most notable whale votes and swings this week.

## 📊 Democracy Score movers
List the 3 biggest score drops and 3 biggest gains, one line each.

## 📅 Coming up
3-5 upcoming proposals to watch with deadlines.

Rules:
- Plain English, no DAO jargon without explanation.
- Tone: informed, neutral, slightly punchy. No hype.
- Under 600 words total.
- Markdown only, no code fences.`;

export interface DigestPayload {
  weekOf: Date;
  topProposals: Array<{ title: string; dao: string; state: string; votes: number }>;
  whaleAlerts: Array<{ title: string; dao: string; description: string }>;
  scoreMovers: Array<{ dao: string; prev: number; current: number; delta: number }>;
  upcoming: Array<{ title: string; dao: string; deadline: Date }>;
}

export async function gatherDigestData(weekOf = new Date()): Promise<DigestPayload> {
  const weekAgo = new Date(weekOf.getTime() - 7 * 86400_000);

  const top = await db
    .select({ proposal: proposals, dao: daos })
    .from(proposals)
    .innerJoin(daos, eq(daos.id, proposals.daoId))
    .where(gt(proposals.createdAt, weekAgo))
    .orderBy(desc(proposals.votesCount))
    .limit(8);

  const whales = await db
    .select({ alert: alerts, dao: daos })
    .from(alerts)
    .innerJoin(daos, eq(daos.id, alerts.daoId))
    .where(and(eq(alerts.type, 'whale_vote'), gt(alerts.createdAt, weekAgo)))
    .orderBy(desc(alerts.createdAt))
    .limit(8);

  // Score movers: compare latest score vs ~7d-ago.
  const moversRaw = await db.execute(sql`
    SELECT d.name AS dao, d.democracy_score::numeric AS current,
           (SELECT score::numeric FROM score_history sh
              WHERE sh.dao_id = d.id AND sh.computed_at <= ${weekAgo.toISOString()}
              ORDER BY computed_at DESC LIMIT 1) AS prev
    FROM daos d
    WHERE d.democracy_score IS NOT NULL
    ORDER BY abs(d.democracy_score::numeric - COALESCE(
      (SELECT score::numeric FROM score_history sh
        WHERE sh.dao_id = d.id AND sh.computed_at <= ${weekAgo.toISOString()}
        ORDER BY computed_at DESC LIMIT 1), d.democracy_score::numeric)) DESC
    LIMIT 6
  `);

  const scoreMovers = (
    moversRaw as unknown as Array<{ dao: string; current: number | null; prev: number | null }>
  )
    .filter((r) => r.prev != null && r.current != null)
    .map((r) => ({
      dao: r.dao,
      prev: Number(r.prev),
      current: Number(r.current),
      delta: Number(r.current) - Number(r.prev),
    }));

  const upcoming = await db
    .select({ proposal: proposals, dao: daos })
    .from(proposals)
    .innerJoin(daos, eq(daos.id, proposals.daoId))
    .where(eq(proposals.state, 'active'))
    .orderBy(proposals.endTimestamp)
    .limit(8);

  return {
    weekOf,
    topProposals: top.map((t) => ({
      title: t.proposal.title,
      dao: t.dao.name,
      state: t.proposal.state,
      votes: t.proposal.votesCount ?? 0,
    })),
    whaleAlerts: whales.map((w) => ({
      title: w.alert.title,
      dao: w.dao.name,
      description: w.alert.description,
    })),
    scoreMovers,
    upcoming: upcoming.map((u) => ({
      title: u.proposal.title,
      dao: u.dao.name,
      deadline: u.proposal.endTimestamp,
    })),
  };
}

export async function generateDigest(payload?: DigestPayload): Promise<{
  id: string;
  body: string;
  title: string;
} | null> {
  const data = payload ?? (await gatherDigestData());
  const title = `DAO Sentinel Weekly — ${data.weekOf.toISOString().slice(0, 10)}`;

  let body = formatFallback(title, data);
  const response = await chat({
    maxTokens: 2000,
    messages: [
      { role: 'system', content: DIGEST_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Generate the digest for week of ${data.weekOf.toDateString()}.

Top proposals: ${JSON.stringify(data.topProposals, null, 2)}

Whale alerts: ${JSON.stringify(data.whaleAlerts, null, 2)}

Score movers: ${JSON.stringify(data.scoreMovers, null, 2)}

Upcoming: ${JSON.stringify(data.upcoming, null, 2)}`,
      },
    ],
  });
  if (response?.text) body = response.text;

  const [row] = await db
    .insert(digests)
    .values({
      weekOf: data.weekOf,
      title,
      body,
      payload: data as unknown as Record<string, unknown>,
    })
    .returning();

  return row ? { id: row.id, title, body } : null;
}

// Exported for unit testing. Deterministic markdown used when the AI call
// fails or returns nothing — must stay a pure function of the payload.
export function formatFallback(title: string, d: DigestPayload): string {
  const top = d.topProposals
    .slice(0, 5)
    .map((p) => `- **${p.title}** (${p.dao}) — ${p.votes} votes, ${p.state}`)
    .join('\n');
  const whales = d.whaleAlerts
    .slice(0, 4)
    .map((w) => `- ${w.title}`)
    .join('\n');
  const movers = d.scoreMovers
    .map(
      (m) =>
        `- ${m.dao}: ${m.prev.toFixed(0)} → ${m.current.toFixed(0)} (${m.delta >= 0 ? '+' : ''}${m.delta.toFixed(0)})`,
    )
    .join('\n');
  const upcoming = d.upcoming
    .slice(0, 5)
    .map((u) => `- **${u.title}** (${u.dao}) — ends ${u.deadline.toISOString().slice(0, 10)}`)
    .join('\n');
  return `# ${title}

## 📰 Top stories
${top || '_No standout proposals this week._'}

## 🐳 Whale activity
${whales || '_No whale votes this week._'}

## 📊 Democracy Score movers
${movers || '_No significant moves._'}

## 📅 Coming up
${upcoming || '_No active proposals._'}`;
}

export async function sendDigestToSubscribers(digestId: string): Promise<number> {
  if (!resend) {
    console.warn('RESEND_API_KEY missing — skipping digest send');
    return 0;
  }
  const [d] = await db.select().from(digests).where(eq(digests.id, digestId)).limit(1);
  if (!d) return 0;

  const subs = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.isActive, true));

  const from = process.env.EMAIL_FROM ?? 'DAO Sentinel <noreply@daosentinel.xyz>';
  const html = await renderWeeklyDigest({
    title: d.title,
    markdownBody: d.body,
    weekOf: new Date(d.weekOf).toLocaleDateString(),
  });
  let sent = 0;

  for (let i = 0; i < subs.length; i += 50) {
    const batch = subs.slice(i, i + 50).map((s) => s.email);
    try {
      await resend.batch.send(
        batch.map((to) => ({ from, to, subject: d.title, html, text: d.body })),
      );
      sent += batch.length;
    } catch (err) {
      console.error('resend batch failed', err);
    }
  }

  await db.update(digests).set({ sentAt: new Date() }).where(eq(digests.id, digestId));
  return sent;
}
