/**
 * TODO-066: "Coming up" for the PAID org-scoped weekly report — upcoming
 * proposals with their quorum state.
 *
 * The public digest's `## 📅 Coming up` section (formatFallback in
 * src/server/services/digest-generator.ts) lists title + deadline and nothing
 * else. A paying DAO team needs to know, for every open vote: how close is
 * quorum, which way is it leaning, how much time is left, and does it need
 * intervention this week.
 *
 * HARD PRODUCT CONSTRAINT — deliberately NO "probability of passing".
 * We have no historical outcome base to calibrate a forecast against, so any
 * percentage we printed would be a fabricated number sold to a paying
 * customer. This module reports only:
 *   - observable facts (quorum progress, leading choice + share, margin over
 *     the runner-up, time remaining), and
 *   - one explicitly-defined flag, `at_risk`, whose condition is a
 *     line-for-line copy of the one that fires a `quorum_risk` alert in
 *     scanQuorumRisks (src/server/services/whale-detector.ts): quorum under
 *     `QUORUM_RISK_THRESHOLD` AND at least `QUORUM_RISK_WINDOW_ELAPSED` of the
 *     voting window gone. BOTH conditions matter. Flagging on the quorum
 *     shortfall alone would cry wolf on a vote that opened two hours ago, and
 *     — worse — would contradict the alerts section of the same report, which
 *     would show no quorum-risk alert for that proposal. Two sections of one
 *     paid report disagreeing is worse than either being conservative.
 * Do not add a likelihood/forecast number here.
 *
 * Split follows the house pattern (formatOrgReportCsv, resolveSyncTargets,
 * computeLeadingChoice): DB access lives only in the `fetch*`/`count*`
 * functions, everything else is a pure function of already-fetched rows so it
 * is unit-testable without a live database.
 */

import { and, eq, gt, lte, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import { proposals } from '../../db/schema';
import { QUORUM_RISK_THRESHOLD, QUORUM_RISK_WINDOW_ELAPSED } from '@/lib/constants';
import { formatNumber, formatPct } from '@/lib/utils';
import { escapeMarkdown } from '@/lib/pdf/digest-pdf';

/** Matches the digest's own upcoming limit (gatherDigestData uses 8). */
const UPCOMING_LIMIT = 8;

/** `QUORUM_RISK_THRESHOLD` rendered for humans, e.g. 80 for 0.8. */
const RISK_PCT = Math.round(QUORUM_RISK_THRESHOLD * 100);

/**
 * Share of the voting window that must have elapsed before a short quorum is
 * called "at risk" — the second half of the alert's condition, mirroring
 * `if (progress < 0.75) continue; // only alert in final 25%` in
 * scanQuorumRisks.
 *
 * Re-exported from src/lib/constants.ts, which both this module and
 * scanQuorumRisks now import — the two values disagreeing is exactly the
 * report/alert contradiction this flag exists to avoid. Re-exported (rather
 * than only imported) so tests can pin the boundary to it directly.
 */
export { QUORUM_RISK_WINDOW_ELAPSED };

/** `QUORUM_RISK_WINDOW_ELAPSED` as the remaining share, e.g. 25 for 0.75. */
const RISK_WINDOW_REMAINING_PCT = Math.round((1 - QUORUM_RISK_WINDOW_ELAPSED) * 100);

/**
 * The one string we are allowed to print when a proposal carries no usable
 * quorum figure. Exported so tests (and any future caller) assert against the
 * literal instead of re-typing it.
 *
 * This is not a rare corner: `tally-sync.ts` writes `quorum: null` for EVERY
 * Tally-sourced proposal on purpose, because on-chain Governor quorum
 * semantics differ from Snapshot's. Such a proposal must still appear in the
 * report — it just says the figure was never published. Never substitute 0,
 * never render a bogus 0% progress, never silently drop the row.
 */
export const QUORUM_NOT_PUBLISHED_REASON = 'quorum not published by this source';

/**
 * Quorum state as a discriminated union rather than `pct: number | null` plus
 * a pile of booleans. "No data" is a first-class state, so a caller physically
 * cannot read a percentage off a row that has none; and `too_early_to_call` is
 * its own status rather than a softened `at_risk`, so no caller can collapse
 * "behind on quorum but the vote just opened" into "this vote is in trouble".
 *
 * `quorumReached` is folded into `status: 'met'` and is deliberately absent
 * from the `not_published` variant. The column defaults to `false` and
 * `tally-sync.ts` writes `quorumReached: false` alongside `quorum: null`, so
 * on the Tally path it is a placeholder, not a fact. Rendering it there would
 * tell a customer "quorum not reached" when the truth is "we do not know what
 * the quorum is".
 */
export type QuorumProgress =
  | { status: 'not_published'; reason: typeof QUORUM_NOT_PUBLISHED_REASON }
  | {
      /**
       * met               — quorum satisfied (ratio >= 1, or the provider says so)
       * on_track          — ratio >= QUORUM_RISK_THRESHOLD but not yet met
       * at_risk           — short of quorum AND in the final stretch (fires an alert)
       * too_early_to_call — short of quorum but the window is young
       */
      status: 'met' | 'on_track' | 'at_risk' | 'too_early_to_call';
      /** scoresTotal / quorum as a percentage. May exceed 100 once quorum is passed. */
      pct: number;
      scoresTotal: number;
      quorum: number;
      /** 0–1 share of the voting window elapsed; null when timestamps are unusable. */
      windowElapsed: number | null;
    };

/** Where the open vote currently stands, computed from the stored aggregate. */
export interface VoteStanding {
  leadingChoice: string;
  leadingScore: number;
  /** Leading choice's share of the total votes cast, 0–100. */
  leadingSharePct: number;
  /** null when the proposal has a single choice (nothing to run second). */
  runnerUpChoice: string | null;
  runnerUpScore: number | null;
  /** Percentage points between leader and runner-up; null when unopposed. */
  marginPct: number | null;
}

/**
 * The proposal columns this module needs.
 *
 * `quorum` and `scoresTotal` are Postgres `numeric` columns: postgres-js hands
 * them back as STRINGS, not numbers. That is why the type says
 * `string | number | null` and why every read goes through `toFiniteNumber`
 * before any arithmetic OR comparison — string comparison is lexicographic
 * (`'9' > '10'` is `true`), so a threshold check on an un-coerced value would
 * emit a confidently wrong at-risk/on-track flag. Same coercion discipline as
 * `Number(p.scoresTotal ?? 0)` / `Number(p.quorum) > 0` in scanQuorumRisks.
 * `scores` is jsonb, so its elements are genuine numbers — coerced anyway
 * because jsonb carries no runtime guarantee.
 */
export interface UpcomingProposalRow {
  id: string;
  title: string;
  source: string;
  /** active | closed | pending — only 'active' and 'pending' reach here. */
  state: string;
  startTimestamp: Date;
  endTimestamp: Date;
  quorum: string | number | null;
  quorumReached: boolean | null;
  scoresTotal: string | number | null;
  /** jsonb string[] — untrusted at runtime, narrowed before use. */
  choices: unknown;
  /** jsonb number[], index-aligned with `choices`. */
  scores: unknown;
  votesCount: number | null;
}

/**
 * Discriminated on `phase` so a `not_yet_open` proposal structurally CANNOT
 * carry quorum progress, a leading choice, or a vote count — nobody has voted
 * on it yet, and zeroed-out turnout figures next to an open vote's real ones
 * would read as "this proposal is failing" rather than "voting has not
 * started".
 */
export type UpcomingProposalItem =
  | {
      phase: 'open';
      id: string;
      title: string;
      source: string;
      endTimestamp: Date;
      votesCount: number;
      quorum: QuorumProgress;
      /** null when nothing has been cast yet (missing/empty/all-zero scores). */
      standing: VoteStanding | null;
      /** e.g. `3d left` — same vocabulary as `timeRemaining` in src/lib/utils.ts. */
      timeLeft: string;
    }
  | {
      phase: 'not_yet_open';
      id: string;
      title: string;
      source: string;
      startTimestamp: Date;
      endTimestamp: Date;
      /** e.g. `opens in 2d`. */
      opensIn: string;
    };

// ---------------------------------------------------------------------------
// Coercion / jsonb narrowing helpers — `unknown` + checks, never `any`.
// ---------------------------------------------------------------------------

/**
 * The single coercion boundary. `numeric` columns arrive as strings and jsonb
 * elements are unverified, so nothing downstream is allowed to compare or do
 * arithmetic on a raw column value.
 */
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * `scores` and `choices` are stored as two independent jsonb arrays, so
 * nothing guarantees they are the same length (a truncated sync, a provider
 * changing the choice set mid-flight). Fall back to a positional label rather
 * than printing `undefined`.
 */
function choiceLabelAt(choices: unknown[], index: number): string {
  const raw = choices[index];
  return typeof raw === 'string' && raw.trim() !== '' ? raw : `Choice ${index + 1}`;
}

// ---------------------------------------------------------------------------
// Pure core
// ---------------------------------------------------------------------------

/**
 * Share of the voting window elapsed, 0–1. `now` is a parameter rather than an
 * internal `Date.now()` so every caller and test is deterministic.
 *
 * Returns null on unusable timestamps (`end <= start`, which would divide by
 * zero) — matching scanQuorumRisks' `if (dur <= 0) continue;`. Not clamped:
 * a value below 0 means voting has not opened yet, above 1 that the deadline
 * has passed, and both are meaningful to a caller.
 */
export function computeWindowElapsed(start: Date, end: Date, now: Date): number | null {
  const duration = end.getTime() - start.getTime();
  if (!(duration > 0)) return null;
  return (now.getTime() - start.getTime()) / duration;
}

export interface QuorumProgressInput {
  scoresTotal: string | number | null | undefined;
  quorum: string | number | null | undefined;
  /** From `computeWindowElapsed`; null when the timestamps are unusable. */
  windowElapsed: number | null;
  /** The provider's own flag. Ignored entirely when `quorum` is unusable. */
  quorumReached?: boolean | null;
}

/**
 * Quorum progress from the stored aggregate.
 *
 * Takes a single input object rather than four positional arguments: the
 * `at_risk` decision depends on the interaction of quorum, total AND window
 * position, and a bare `computeQuorumProgress(a, b, 0.8, false)` at a call
 * site gives the reader no way to tell 0.8-the-ratio from 0.8-the-window.
 *
 * `not_published` covers a NULL quorum (every Tally row) and a
 * non-positive/unparseable one — in all cases there is no denominator, so
 * there is no honest percentage to print. Mirrors the guard
 * `if (!p.quorum || Number(p.quorum) <= 0) continue;` in scanQuorumRisks.
 *
 * The `at_risk` condition is deliberately identical to the alert's, including
 * both boundaries: `ratio >= QUORUM_RISK_THRESHOLD` is safe (so exactly at
 * threshold is on track) and `progress < QUORUM_RISK_WINDOW_ELAPSED` is too
 * early (so exactly at 75% elapsed does flag). A null `windowElapsed` cannot
 * flag at risk, because the alert's `dur <= 0` guard skips those rows too.
 */
export function computeQuorumProgress(input: QuorumProgressInput): QuorumProgress {
  const { scoresTotal, quorum, windowElapsed, quorumReached = null } = input;

  const quorumValue = toFiniteNumber(quorum);
  if (quorumValue == null || quorumValue <= 0) {
    // NB: `quorumReached` is deliberately dropped here, not forwarded.
    return { status: 'not_published', reason: QUORUM_NOT_PUBLISHED_REASON };
  }

  const total = Math.max(toFiniteNumber(scoresTotal) ?? 0, 0);
  const ratio = total / quorumValue;
  const inFinalStretch = windowElapsed != null && windowElapsed >= QUORUM_RISK_WINDOW_ELAPSED;

  const status =
    quorumReached === true || ratio >= 1
      ? 'met'
      : ratio >= QUORUM_RISK_THRESHOLD
        ? 'on_track'
        : inFinalStretch
          ? 'at_risk'
          : 'too_early_to_call';

  return { status, pct: ratio * 100, scoresTotal: total, quorum: quorumValue, windowElapsed };
}

/**
 * Where the vote stands, computed straight from `proposals.scores` /
 * `proposals.scores_total`. Deliberately does NOT query the `votes` table:
 * the per-choice aggregate is already stored by the sync, and re-summing
 * every vote row per report would be pure waste.
 *
 * Returns null — not a zeroed record — when nothing has been cast yet
 * (missing, empty, or all-zero scores), so the formatter can say so instead
 * of announcing a leader with 0%.
 */
export function computeVoteStanding(
  choices: unknown,
  scores: unknown,
  scoresTotal: string | number | null | undefined,
): VoteStanding | null {
  const rawChoices = toUnknownArray(choices);
  const values = toUnknownArray(scores).map((s) => Math.max(toFiniteNumber(s) ?? 0, 0));
  if (values.length === 0) return null;

  const sum = values.reduce((acc, v) => acc + v, 0);
  if (sum <= 0) return null; // all-zero scores: voting is open, nothing cast

  // Prefer the stored aggregate as the denominator (it is what the provider
  // reports), but fall back to the sum when it is missing or contradicts
  // non-zero scores — a 0/NULL total with real scores would divide by zero.
  const storedTotal = toFiniteNumber(scoresTotal);
  const total = storedTotal != null && storedTotal > 0 ? storedTotal : sum;

  let leadIdx = 0;
  let runnerIdx = -1;
  values.forEach((v, i) => {
    if (v > values[leadIdx]) {
      runnerIdx = leadIdx;
      leadIdx = i;
    } else if (i !== leadIdx && (runnerIdx === -1 || v > values[runnerIdx])) {
      runnerIdx = i;
    }
  });

  const leadingScore = values[leadIdx];
  const runnerUpScore = runnerIdx >= 0 ? values[runnerIdx] : null;

  return {
    leadingChoice: choiceLabelAt(rawChoices, leadIdx),
    leadingScore,
    leadingSharePct: (leadingScore / total) * 100,
    runnerUpChoice: runnerIdx >= 0 ? choiceLabelAt(rawChoices, runnerIdx) : null,
    runnerUpScore,
    marginPct: runnerUpScore == null ? null : ((leadingScore - runnerUpScore) / total) * 100,
  };
}

/** `3d` / `5h` / `12m` — the bucket vocabulary of `timeRemaining` in src/lib/utils.ts. */
function humanizeSeconds(seconds: number): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

/**
 * Same buckets and wording as `timeRemaining` in src/lib/utils.ts, with `now`
 * injected. The shared helper hardcodes `Date.now()`, which would make every
 * assertion here clock-dependent; a unit test pins this function's output to
 * `timeRemaining`'s so the two cannot drift apart unnoticed.
 */
export function formatTimeRemaining(end: Date, now: Date = new Date()): string {
  const seconds = Math.floor((end.getTime() - now.getTime()) / 1000);
  if (seconds <= 0) return 'ended';
  return `${humanizeSeconds(seconds)} left`;
}

/** Lead time before voting opens, for `state = 'pending'` proposals. */
export function formatTimeUntilOpen(start: Date, now: Date = new Date()): string {
  const seconds = Math.floor((start.getTime() - now.getTime()) / 1000);
  if (seconds <= 0) return 'opening now';
  return `opens in ${humanizeSeconds(seconds)}`;
}

/**
 * Pure row → item mapping, so the whole pipeline is testable without a DB.
 * Open votes are listed before not-yet-open ones (stable within each group):
 * only the former can still be influenced this week, so they lead the section
 * regardless of how the rows happened to be ordered.
 */
export function buildUpcomingItems(
  rows: UpcomingProposalRow[],
  now: Date = new Date(),
): UpcomingProposalItem[] {
  const items = rows.map<UpcomingProposalItem>((row) => {
    if (row.state === 'pending') {
      return {
        phase: 'not_yet_open',
        id: row.id,
        title: row.title,
        source: row.source,
        startTimestamp: row.startTimestamp,
        endTimestamp: row.endTimestamp,
        opensIn: formatTimeUntilOpen(row.startTimestamp, now),
      };
    }
    return {
      phase: 'open',
      id: row.id,
      title: row.title,
      source: row.source,
      endTimestamp: row.endTimestamp,
      votesCount: row.votesCount ?? 0,
      quorum: computeQuorumProgress({
        scoresTotal: row.scoresTotal,
        quorum: row.quorum,
        quorumReached: row.quorumReached,
        windowElapsed: computeWindowElapsed(row.startTimestamp, row.endTimestamp, now),
      }),
      standing: computeVoteStanding(row.choices, row.scores, row.scoresTotal),
      timeLeft: formatTimeRemaining(row.endTimestamp, now),
    };
  });

  return [
    ...items.filter((i) => i.phase === 'open'),
    ...items.filter((i) => i.phase === 'not_yet_open'),
  ];
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

function formatQuorumLine(quorum: QuorumProgress): string {
  if (quorum.status === 'not_published') return `Quorum: ⚪ ${quorum.reason}`;

  const counts = `${formatNumber(quorum.scoresTotal)} / ${formatNumber(quorum.quorum)}`;
  let flag: string;
  switch (quorum.status) {
    case 'met':
      flag = '✅ quorum met';
      break;
    case 'on_track':
      flag = '✅ on track';
      break;
    case 'at_risk':
      // Both halves of the condition are stated, so the customer can see why
      // this proposal is flagged and the one below it is not.
      flag = `⚠️ quorum at risk (under ${RISK_PCT}% of quorum with under ${RISK_WINDOW_REMAINING_PCT}% of the voting window left)`;
      break;
    case 'too_early_to_call':
      flag = `⏳ too early to call (under ${RISK_PCT}% of quorum, but over ${RISK_WINDOW_REMAINING_PCT}% of the voting window remains)`;
      break;
  }
  return `Quorum: ${formatPct(quorum.pct, 0)} of quorum (${counts}) — ${flag}`;
}

function formatStandingLine(standing: VoteStanding | null): string {
  if (standing == null) return 'Standing: no votes recorded yet';

  const share = `${formatPct(standing.leadingSharePct, 1)} of votes cast`;
  const leadingChoice = escapeMarkdown(standing.leadingChoice);
  if (standing.runnerUpChoice == null || standing.marginPct == null) {
    return `Leading: **${leadingChoice}** — ${share} (single choice, unopposed)`;
  }
  return `Leading: **${leadingChoice}** — ${share}, +${standing.marginPct.toFixed(1)} pts over "${escapeMarkdown(standing.runnerUpChoice)}"`;
}

function formatItem(item: UpcomingProposalItem): string {
  const title = escapeMarkdown(item.title);
  if (item.phase === 'not_yet_open') {
    return [
      `- **${title}** (${item.source}) — ${item.opensIn}`,
      '  - Not yet open for voting — no quorum or standing data yet',
    ].join('\n');
  }
  return [
    `- **${title}** (${item.source}) — ${item.timeLeft}`,
    `  - ${formatQuorumLine(item.quorum)}`,
    `  - ${formatStandingLine(item.standing)}`,
  ].join('\n');
}

/**
 * Pure markdown for the paid report's upcoming section, in the `- **bold**`
 * bullet / emoji-header style of `formatFallback`. Returns '' when there is
 * nothing to say (mirrors `formatCuratedNotesSection`), and like it emits the
 * leading blank lines so it can be concatenated onto an existing body.
 *
 * The italic caveat under the header is not decoration: it states, in the
 * customer's own copy, that these are observed figures and not a forecast,
 * and spells out the exact at-risk condition — which is also the condition
 * that raised any quorum-risk alert shown elsewhere in the same report.
 *
 * `staleActiveCount` (from `countStaleActiveProposals`) surfaces rows the
 * deadline filter dropped, so an omission caused by a lagging sync is visible
 * signal rather than a silently shorter list.
 */
export function formatUpcomingSection(
  items: UpcomingProposalItem[],
  staleActiveCount = 0,
): string {
  if (items.length === 0) return '';

  const lines = items.map(formatItem).join('\n');
  const stale =
    staleActiveCount > 0
      ? `\n\n_${staleActiveCount} ${
          staleActiveCount === 1
            ? 'proposal still flagged active past its deadline was'
            : 'proposals still flagged active past their deadline were'
        } excluded — awaiting the next sync._`
      : '';

  return `\n\n## 🗳️ Open votes — quorum & standing
_Observed state at send time, not a forecast. "At risk" means under ${RISK_PCT}% of quorum with under ${RISK_WINDOW_REMAINING_PCT}% of the voting window left — the same condition that raises a quorum-risk alert._
${lines}${stale}`;
}

// ---------------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------------

/**
 * Open and not-yet-open votes for one DAO, soonest deadline first.
 *
 * `endTimestamp > now` is load-bearing (TODO-047): a stale row still marked
 * `active` because a sync missed its close would otherwise be reported as an
 * upcoming vote the customer can still influence. The `pending` leg is
 * filtered on `startTimestamp > now` for the same reason.
 */
export async function fetchUpcomingWithQuorum(
  daoId: string,
  now: Date = new Date(),
): Promise<UpcomingProposalItem[]> {
  const rows = await db
    .select({
      id: proposals.id,
      title: proposals.title,
      source: proposals.source,
      state: proposals.state,
      startTimestamp: proposals.startTimestamp,
      endTimestamp: proposals.endTimestamp,
      quorum: proposals.quorum,
      quorumReached: proposals.quorumReached,
      scoresTotal: proposals.scoresTotal,
      choices: proposals.choices,
      scores: proposals.scores,
      votesCount: proposals.votesCount,
    })
    .from(proposals)
    .where(
      and(
        eq(proposals.daoId, daoId),
        or(
          and(eq(proposals.state, 'active'), gt(proposals.endTimestamp, now)),
          and(eq(proposals.state, 'pending'), gt(proposals.startTimestamp, now)),
        ),
      ),
    )
    .orderBy(proposals.endTimestamp)
    .limit(UPCOMING_LIMIT);

  return buildUpcomingItems(rows, now);
}

/**
 * How many rows the deadline filter dropped: still `state = 'active'` but
 * already past `endTimestamp`. Non-zero means a sync is lagging, which is
 * worth one line in the report rather than a silently shorter list.
 */
export async function countStaleActiveProposals(
  daoId: string,
  now: Date = new Date(),
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(proposals)
    .where(
      and(
        eq(proposals.daoId, daoId),
        eq(proposals.state, 'active'),
        lte(proposals.endTimestamp, now),
      ),
    );
  return row?.count ?? 0;
}
