import { Resend } from 'resend';
import { renderOrgReport, renderWeeklyDigest } from '../email/render';
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
  organizationMembers,
  users,
} from '../db/schema';
import { getOrGenerateOrgReport, markOrgReportSent } from './org-report/store';

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
// TODO-055 / TODO-068: Org-scoped private weekly report
// =============================================
// The org path no longer shares a body with the public digest. Until TODO-068
// it was `formatFallback(...) + formatCuratedNotesSection(...)` — i.e. the free
// newsletter's fallback markdown, filtered to one DAO, under the free
// newsletter's own title. It is now the assembled report from
// ./org-report/index.ts: executive summary and recommended actions first, then
// alerts, open votes with quorum, whale/delegate context, Democracy Score
// attribution, DAO-scoped concierge notes, and a methodology footer.
//
// `fetchOrgDigestNotes` and `formatCuratedNotesSection` were removed with it:
// both read `org_notes` org-wide, which showed one DAO's report the notes
// written about another DAO (TODO-069). `fetchOrgNotesForDao`
// (src/server/api/org-notes.ts) is the DAO-scoped replacement and is what the
// report now uses.
//
// The PUBLIC digest path below and above — gatherDigestData, digestScope,
// formatFallback, generateDigest, sendDigestToSubscribers, renderWeeklyDigest,
// WeeklyDigestEmail — is deliberately untouched by all of this.
//
// Org reports ARE now persisted (TODO-072), but to their own `org_reports`
// table, never to `digests`: `digests` is the public newsletter archive served
// at /digest, and one customer's private report does not belong one missing
// WHERE clause away from it. See src/server/services/org-report/store.ts.

/** Org member emails — the recipient list for the org-scoped report, NOT `newsletterSubscribers`. */
export async function fetchOrgMemberEmails(organizationId: string): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, organizationId));
  return rows.map((r) => r.email);
}

export interface SendOrgReportOptions {
  /** The clock. Defaults to now. */
  now?: Date;
  /**
   * Re-send a week that has already been emailed. Off by default — see the
   * idempotency note on `sendOrgDigestToMembers`.
   */
  force?: boolean;
}

export interface SendOrgReportResult {
  sent: number;
  dryRun: boolean;
  /** True when this week's report was already emailed and `force` was not set. */
  skipped: boolean;
  title: string;
  recipientCount: number;
  reportId: string;
  weekStart: string;
  /** Present only when a send was actually attempted. */
  html?: string;
}

/**
 * Sends the org-scoped weekly report to the organization's member emails.
 *
 * IDEMPOTENT BY DEFAULT (TODO-073). The report is fetched through
 * `getOrGenerateOrgReport`, and a row whose `sentAt` is already set is skipped
 * unless `force` is passed. This is what makes the weekly schedule safe: a
 * GitHub Actions retry, an overlapping tick, or a manual re-trigger the same
 * week can no longer mail paying customers the same report twice. `markOrgReportSent`
 * closes the loop after a successful send.
 *
 * Going through the store also means the emailed document is byte-identical to
 * the one the customer can read in the dashboard — previously the send
 * regenerated from scratch and could differ from what the page showed.
 *
 * Renders with `renderOrgReport` (the paid `OrgReportEmail` template), NOT
 * `renderWeeklyDigest` — the public template heads the mail "DAO Sentinel
 * Weekly", links the public `/digest` archive this private report never
 * appears in, and offers a newsletter unsubscribe that org members are not
 * subscribed through.
 *
 * TITLE DEDUPE: `OrgReportEmail` prints "{org} — {dao} governance report" and
 * the week as its own header, so the HTML is given `bodyWithoutTitle`. The
 * plain-text alternative has no header of its own, so it gets `body`, which
 * opens with the `# ` title. Each channel shows the title exactly once.
 *
 * Follows the exact same guarded-Resend pattern as `sendDigestToSubscribers`:
 * when `RESEND_API_KEY` is unset, this is a safe dry run — the payload is
 * still fully assembled and rendered (proving the pipeline works end to end,
 * per the TODO-006 dry-run precedent) but no network call is made, `sentAt` is
 * left null, and `dryRun: true` is returned instead of a real send.
 */
export async function sendOrgDigestToMembers(
  organizationId: string,
  daoSlug: string,
  opts: SendOrgReportOptions = {},
): Promise<SendOrgReportResult> {
  const now = opts.now ?? new Date();
  const { report, organization, dao } = await getOrGenerateOrgReport(organizationId, daoSlug, {
    now,
  });

  const base = {
    title: report.title,
    reportId: report.id,
    weekStart: report.weekStart.toISOString().slice(0, 10),
  };

  if (report.sentAt && !opts.force) {
    console.log(
      `[org-digest] already sent org=${organizationId} dao=${daoSlug} week=${base.weekStart} at=${report.sentAt.toISOString()} — skipping`,
    );
    return { ...base, sent: 0, dryRun: false, skipped: true, recipientCount: 0 };
  }

  const recipients = await fetchOrgMemberEmails(organizationId);

  const html = await renderOrgReport({
    organizationId,
    organizationName: organization.name,
    brandingDisplayName: organization.brandingDisplayName,
    brandingLogoUrl: organization.brandingLogoUrl,
    brandingPrimaryColor: organization.brandingPrimaryColor,
    daoName: dao.name,
    daoSlug: dao.slug,
    // Fixed locale, not the server's: this string goes to the customer, and
    // the process locale is an accident of where it runs.
    weekOf: report.weekStart.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
    markdownBody: report.bodyWithoutTitle,
  });

  if (!resend) {
    console.warn(
      `[org-digest] RESEND_API_KEY missing — dry run only. org=${organizationId} dao=${daoSlug} recipients=${recipients.length}`,
    );
    return {
      ...base,
      sent: 0,
      dryRun: true,
      skipped: false,
      recipientCount: recipients.length,
      html,
    };
  }

  const from = process.env.EMAIL_FROM ?? 'DAO Sentinel <noreply@daosentinel.xyz>';
  let sent = 0;
  for (let i = 0; i < recipients.length; i += 50) {
    const batch = recipients.slice(i, i + 50);
    try {
      await resend.batch.send(
        batch.map((to) => ({ from, to, subject: report.title, html, text: report.body })),
      );
      sent += batch.length;
    } catch (err) {
      console.error('resend org-digest batch failed', err);
    }
  }

  // Only stamp `sentAt` when mail actually went out. A run where every batch
  // threw must stay retryable rather than being recorded as delivered.
  if (sent > 0 && report.id) {
    await markOrgReportSent(report.id, sent);
  }

  return { ...base, sent, dryRun: false, skipped: false, recipientCount: recipients.length, html };
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
