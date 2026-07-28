import { Resend } from 'resend';
import { renderWeeklyDigest } from '../email/render';
import { chat } from '../ai/openrouter';
import { eq, desc, sql, gt, and, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
  proposals,
  daos,
  alerts,
  scoreHistory,
  digests,
  newsletterSubscribers,
  organizationMembers,
  orgNotes,
  users,
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

/**
 * TODO-055: pure decision logic for the optional `daoSlug` filter added to
 * `gatherDigestData`. Extracted (same spirit as `resolveSyncTargets` for
 * TODO-056's `daoIds` filter) so the additive contract — omitted -> today's
 * exact unfiltered behavior, provided -> narrowed to exactly that one DAO —
 * is unit-testable without a live DB.
 */
export function digestScope(daoSlug?: string): { scoped: false } | { scoped: true; daoSlug: string } {
  if (!daoSlug) return { scoped: false };
  return { scoped: true, daoSlug };
}

/**
 * `daoSlug` (TODO-055, org-scoped weekly report) is an OPTIONAL filter. When
 * omitted (every existing caller today — the public digest path), behavior
 * is byte-for-byte identical to before this parameter existed: the exact
 * same unfiltered queries run. When provided, every section is narrowed to
 * just that one DAO via `daos.slug`.
 */
export async function gatherDigestData(weekOf = new Date(), daoSlug?: string): Promise<DigestPayload> {
  const weekAgo = new Date(weekOf.getTime() - 7 * 86400_000);
  const scope = digestScope(daoSlug);

  const top = await db
    .select({ proposal: proposals, dao: daos })
    .from(proposals)
    .innerJoin(daos, eq(daos.id, proposals.daoId))
    .where(
      scope.scoped
        ? and(gt(proposals.createdAt, weekAgo), eq(daos.slug, scope.daoSlug))
        : gt(proposals.createdAt, weekAgo),
    )
    .orderBy(desc(proposals.votesCount))
    .limit(8);

  const whales = await db
    .select({ alert: alerts, dao: daos })
    .from(alerts)
    .innerJoin(daos, eq(daos.id, alerts.daoId))
    .where(
      scope.scoped
        ? and(eq(alerts.type, 'whale_vote'), gt(alerts.createdAt, weekAgo), eq(daos.slug, scope.daoSlug))
        : and(eq(alerts.type, 'whale_vote'), gt(alerts.createdAt, weekAgo)),
    )
    .orderBy(desc(alerts.createdAt))
    .limit(8);

  // Score movers: compare latest score vs ~7d-ago.
  const moversRaw = scope.scoped
    ? await db.execute(sql`
        SELECT d.name AS dao, d.democracy_score::numeric AS current,
               (SELECT score::numeric FROM score_history sh
                  WHERE sh.dao_id = d.id AND sh.computed_at <= ${weekAgo.toISOString()}
                  ORDER BY computed_at DESC LIMIT 1) AS prev
        FROM daos d
        WHERE d.democracy_score IS NOT NULL AND d.slug = ${scope.daoSlug}
        ORDER BY abs(d.democracy_score::numeric - COALESCE(
          (SELECT score::numeric FROM score_history sh
            WHERE sh.dao_id = d.id AND sh.computed_at <= ${weekAgo.toISOString()}
            ORDER BY computed_at DESC LIMIT 1), d.democracy_score::numeric)) DESC
        LIMIT 6
      `)
    : await db.execute(sql`
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
    .where(
      scope.scoped
        ? and(
            eq(proposals.state, 'active'),
            gt(proposals.endTimestamp, weekOf),
            eq(daos.slug, scope.daoSlug),
          )
        : and(eq(proposals.state, 'active'), gt(proposals.endTimestamp, weekOf)),
    )
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

// =============================================
// TODO-055: Org-scoped private weekly report
// =============================================
// Reuses gatherDigestData/formatFallback/renderWeeklyDigest unchanged in
// shape (per acceptance criteria), just filtered to one DAO and delivered to
// an organization's member emails instead of the public newsletterSubscribers
// list. Deliberately does NOT run the AI-authored path (generateDigest's
// `chat()` call) — the org report is a concierge product built on curated,
// deterministic output, not an AI-generated newsletter, so formatFallback is
// the whole body (plus the curated-notes section below), not a fallback.
//
// Deliberately does NOT insert a row into `digests` — that table has no
// per-organization scoping and adding one would require a schema migration,
// which is explicitly out of scope for this task (see TODO.md TODO-055 /
// AGENTS.md migration-approval rule).

const ORG_DIGEST_NOTES_LIMIT = 10;

export interface CuratedDigestNote {
  subjectType: string;
  subjectId: string;
  note: string;
  subjectTitle?: string;
}

/**
 * Pure formatter for the curated-context section sourced from `org_notes`.
 * Exported for unit testing, same discipline as `formatFallback` — a pure
 * function of already-fetched note data, no DB access.
 */
export function formatCuratedNotesSection(notes: CuratedDigestNote[]): string {
  if (notes.length === 0) return '';
  const lines = notes
    .map((n) => `- **[${n.subjectType}]** ${n.subjectTitle ?? n.subjectId} — ${n.note}`)
    .join('\n');
  return `\n\n## 🗒️ Concierge notes\n${lines}`;
}

/**
 * Fetches the most recent `org_notes` for an organization, best-effort
 * resolving each note's subject (proposal/alert) title — mirrors the
 * resolution pattern already used by the org dashboard page
 * (src/app/(app)/org/[orgId]/[daoSlug]/page.tsx).
 */
async function fetchOrgDigestNotes(
  organizationId: string,
  limit = ORG_DIGEST_NOTES_LIMIT,
): Promise<CuratedDigestNote[]> {
  const noteRows = await db
    .select({
      subjectType: orgNotes.subjectType,
      subjectId: orgNotes.subjectId,
      note: orgNotes.note,
    })
    .from(orgNotes)
    .where(eq(orgNotes.organizationId, organizationId))
    .orderBy(desc(orgNotes.createdAt))
    .limit(limit);

  const proposalIds = noteRows.filter((n) => n.subjectType === 'proposal').map((n) => n.subjectId);
  const alertIds = noteRows.filter((n) => n.subjectType === 'alert').map((n) => n.subjectId);

  const [subjectProposals, subjectAlerts] = await Promise.all([
    proposalIds.length
      ? db.select({ id: proposals.id, title: proposals.title }).from(proposals).where(inArray(proposals.id, proposalIds))
      : Promise.resolve([]),
    alertIds.length
      ? db.select({ id: alerts.id, title: alerts.title }).from(alerts).where(inArray(alerts.id, alertIds))
      : Promise.resolve([]),
  ]);
  const proposalTitleById = new Map(subjectProposals.map((p) => [p.id, p.title]));
  const alertTitleById = new Map(subjectAlerts.map((a) => [a.id, a.title]));

  return noteRows.map((n) => ({
    ...n,
    subjectTitle:
      n.subjectType === 'proposal'
        ? proposalTitleById.get(n.subjectId)
        : n.subjectType === 'alert'
          ? alertTitleById.get(n.subjectId)
          : undefined,
  }));
}

/** Org member emails — the recipient list for the org-scoped report, NOT `newsletterSubscribers`. */
export async function fetchOrgMemberEmails(organizationId: string): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, organizationId));
  return rows.map((r) => r.email);
}

/**
 * Assembles the org-scoped digest body: the same deterministic
 * `formatFallback` shape used as the public digest's fallback, filtered to
 * one DAO via `gatherDigestData(weekOf, daoSlug)`, with the curated
 * `org_notes` section appended before render.
 */
export async function generateOrgDigestBody(
  organizationId: string,
  daoSlug: string,
  weekOf = new Date(),
): Promise<{ title: string; body: string; payload: DigestPayload }> {
  const payload = await gatherDigestData(weekOf, daoSlug);
  const title = `DAO Sentinel Weekly — ${payload.weekOf.toISOString().slice(0, 10)}`;

  const notes = await fetchOrgDigestNotes(organizationId);
  const body = formatFallback(title, payload) + formatCuratedNotesSection(notes);

  return { title, body, payload };
}

/**
 * Sends the org-scoped weekly report to the organization's member emails.
 *
 * Follows the exact same guarded-Resend pattern as `sendDigestToSubscribers`:
 * when `RESEND_API_KEY` is unset, this is a safe dry run — the payload is
 * still fully assembled and rendered (proving the pipeline works end to end,
 * per the TODO-006 dry-run precedent) but no network call is made and
 * `dryRun: true` is returned instead of a real send.
 */
export async function sendOrgDigestToMembers(
  organizationId: string,
  daoSlug: string,
  weekOf = new Date(),
): Promise<{ sent: number; dryRun: boolean; title: string; recipientCount: number; html: string }> {
  const { title, body } = await generateOrgDigestBody(organizationId, daoSlug, weekOf);
  const recipients = await fetchOrgMemberEmails(organizationId);

  const html = await renderWeeklyDigest({
    title,
    markdownBody: body,
    weekOf: weekOf.toLocaleDateString(),
  });

  if (!resend) {
    console.warn(
      `[org-digest] RESEND_API_KEY missing — dry run only. org=${organizationId} dao=${daoSlug} recipients=${recipients.length}`,
    );
    console.log(`[org-digest] dry-run rendered body for ${title}:\n${body}`);
    return { sent: 0, dryRun: true, title, recipientCount: recipients.length, html };
  }

  const from = process.env.EMAIL_FROM ?? 'DAO Sentinel <noreply@daosentinel.xyz>';
  let sent = 0;
  for (let i = 0; i < recipients.length; i += 50) {
    const batch = recipients.slice(i, i + 50);
    try {
      await resend.batch.send(batch.map((to) => ({ from, to, subject: title, html, text: body })));
      sent += batch.length;
    } catch (err) {
      console.error('resend org-digest batch failed', err);
    }
  }
  return { sent, dryRun: false, title, recipientCount: recipients.length, html };
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
