/**
 * TODO-065: whale / delegate context for the org-scoped weekly report.
 *
 * Today the paid report only restates the raw whale alert ("🐳 A single
 * address cast 10.5% of total voting power"). That leaves the customer with
 * the two questions they actually care about unanswered:
 *
 *   1. WHO is this — a known delegate they can call, or an anonymous wallet?
 *   2. Did it MATTER — would the outcome have differed without them?
 *
 * (1) is a join that has never been made anywhere in the codebase but is
 * trivial: `alerts.data->>'voter'` (written lowercased by whale-detector.ts)
 * and `delegates.address` (written lowercased by delegate-tracker.ts) are the
 * same key space. (2) is a counterfactual recompute over `proposals.scores`
 * — and it is computed, never asserted: `assessDecisiveness` below is pure
 * and unit-tested, and returns an explicit "cannot determine" state rather
 * than guessing when the data can't support the arithmetic.
 *
 * Structure follows the precedent set by `computeLeadingChoice`
 * (whale-detector.ts), `scoreDelegate` (delegate-recommendations.ts) and
 * `formatOrgReportCsv` (src/lib/org-report-csv.ts): DB access confined to the
 * `fetch*` function, all logic and formatting pure and testable without a
 * live database.
 *
 * Wiring into the report body happens separately — this module only produces
 * the data and the markdown section.
 */

import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { db } from '@/server/db';
import { alerts, delegateDaoActivity, delegates, proposals } from '@/server/db/schema';
import { formatNumber, shortenAddress } from '@/lib/utils';

/** Matches the 8-row cap `gatherDigestData` already uses for the whale section. */
const WHALE_CONTEXT_LIMIT = 8;

/** How many alerts to pull before thinning — see `thinPerVoter`. */
const WHALE_CONTEXT_FETCH_LIMIT = 60;

/**
 * Distinct voters matter more than distinct votes: hearing that one address is
 * heavy on four clones of the same proposal is one fact, not four.
 */
export const WHALE_CONTEXT_MAX_PER_VOTER = 2;

/**
 * Keeps at most `WHALE_CONTEXT_MAX_PER_VOTER` entries per voter address
 * (newest first, since the input is already ordered by `createdAt` desc), then
 * caps the result at `WHALE_CONTEXT_LIMIT`. Exported for unit testing.
 */
export function thinPerVoter<T extends { data: { voter: string | null } }>(items: T[]): T[] {
  const perVoter = new Map<string, number>();
  const kept: T[] = [];

  for (const item of items) {
    if (kept.length >= WHALE_CONTEXT_LIMIT) break;
    // An unparseable voter can't be grouped; keep it rather than drop a signal.
    const key = item.data.voter;
    if (key === null) {
      kept.push(item);
      continue;
    }
    const seen = perVoter.get(key) ?? 0;
    if (seen >= WHALE_CONTEXT_MAX_PER_VOTER) continue;
    perVoter.set(key, seen + 1);
    kept.push(item);
  }

  return kept;
}

/**
 * Voting types where subtracting one voter's power from one choice index is
 * a meaningful counterfactual. Under approval / ranked-choice / weighted /
 * quadratic, `votes.choice` is a *collapsed* representative index (see
 * `normaliseChoice` in snapshot-sync.ts, which flattens arrays and objects
 * down to one number), so the subtraction would be arithmetic on a value
 * that doesn't mean what it looks like. `null` covers rows synced before the
 * column existed; tally-sync.ts writes 'single-choice' for everything.
 */
const SUBTRACTABLE_VOTING_TYPES = new Set(['single-choice', 'basic']);

// =============================================
// Types
// =============================================

/**
 * A delegate we actually have a row for. Deliberately omits
 * `delegates.consistencyScore` and `delegateDaoActivity.delegatorsCount`:
 * both are declared in the schema but never written by any service, so they
 * are always null and would render as blanks that imply "unknown reputation"
 * when they in fact mean "column unused".
 */
export interface WhaleDelegateProfile {
  address: string;
  /** `ensName ?? name ?? shortenAddress(address)` — never blank. */
  displayName: string;
  /**
   * True only when an ENS/display name or a Karma profile actually identifies
   * this address publicly. A row in `delegates` does NOT imply this:
   * `rebuildDelegateProfiles` materialises one for every frequent voter
   * straight out of `votes`. Needed because `displayName` falls back to the
   * shortened address and so is never null — checking it cannot distinguish
   * "known delegate" from "address we happen to have seen a lot".
   */
  isPubliclyIdentified: boolean;
  karmaScore: number | null;
  karmaRank: number | null;
  karmaUrl: string | null;
  /** Overall, cross-DAO participation as a 0-1 fraction. */
  participationRate: number | null;
  totalVotesCast: number | null;
  totalDaosActive: number | null;
  /** Voting power recorded for THIS dao (delegate_dao_activity), not global. */
  daoVotingPower: number | null;
}

/** Why a decisiveness verdict could not be reached. Codes, so the formatter owns the prose. */
export type DecisivenessReason =
  /** `scores` null, empty, or summing to zero. */
  | 'missing_scores'
  /** Fewer than two choices — there is no alternative outcome to flip to. */
  | 'insufficient_choices'
  /** The alert's recorded choice doesn't index into `scores`. */
  | 'choice_out_of_range'
  /** The alert never recorded the absolute voting power. */
  | 'missing_vp'
  /** approval / ranked-choice / weighted / quadratic — see SUBTRACTABLE_VOTING_TYPES. */
  | 'unsupported_voting_type';

export type Decisiveness =
  | {
      status: 'decisive' | 'not_decisive';
      /** Winner on the current scores (0-indexed, aligned with `proposals.choices`). */
      leaderIndex: number;
      /** Winner after the whale's VP is removed from their own choice. */
      counterfactualLeaderIndex: number;
      /** The whale's own choice, converted to 0-indexed. */
      choiceIndex: number;
      /** Runner-up on the current scores (0-indexed). */
      runnerUpIndex: number;
      /**
       * Top-1 vs top-2 gap as a % of sum(scores). Reported as CONTEXT only —
       * it is deliberately not the decision rule (see `assessDecisiveness`).
       */
      marginPct: number;
      /** The whale's share of sum(scores) (0-100), derived fresh — never the stale `data.vpPct`. */
      vpPct: number;
      /** Absolute voting power used in the counterfactual. */
      vp: number;
    }
  | { status: 'indeterminate'; reason: DecisivenessReason; votingType?: string };

/** One whale alert, enriched with delegate identity and computed vote impact. */
export interface WhaleContextItem {
  alertId: string;
  createdAt: Date;
  /** Lowercased voter address from `alerts.data->>'voter'`; null when the jsonb is malformed. */
  voter: string | null;
  /** Absolute voting power, same units as `proposals.scores`. */
  vp: number | null;
  /**
   * `data.vpPct` as stored — computed against `scoresTotal` AT ALERT TIME, so
   * it can disagree with the current scores. Only used as a labelled fallback
   * when a fresh percentage can't be derived.
   */
  vpPctAtAlert: number | null;
  /** The whale's share of the CURRENT sum(scores) (0-100). Null when scores are unusable. */
  vpPctOfScores: number | null;
  choiceLabel: string | null;
  proposalTitle: string | null;
  /** The real uuid from the `alerts.proposal_id` column — NOT `data.proposalId`, which is the external id. */
  proposalId: string | null;
  proposalState: string | null;
  votingType: string | null;
  /** `proposals.choices`, so the formatter can name the leading/runner-up choice. */
  choices: string[];
  /** null = no row in `delegates` (a first-time large holder, not a low-reputation delegate). */
  delegate: WhaleDelegateProfile | null;
  decisiveness: Decisiveness;
}

// =============================================
// Numeric coercion
// =============================================

/**
 * pg `numeric` columns (scoresTotal, votingPower, karmaScore,
 * participationRate) arrive as STRINGS, and string comparison is
 * lexicographic — `'9' > '10'` is true, which would silently invert
 * rankings. Everything numeric goes through here first. `proposals.scores`
 * is `jsonb number[]` so its entries are already real numbers, but they are
 * coerced too since jsonb carries no runtime guarantee.
 */
function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

// =============================================
// Defensive jsonb parsing
// =============================================

/** `alerts.data` is untyped `Record<string, unknown>` — nothing guarantees these fields exist. */
export interface ParsedWhaleAlertData {
  voter: string | null;
  vp: number | null;
  /** Stale by construction — see `WhaleContextItem.vpPctAtAlert`. */
  vpPct: number | null;
  /** 1-INDEXED, exactly as `whale-detector.ts` writes it. Convert with `choiceIndexFromAlert`. */
  choice: number | null;
  choiceLabel: string | null;
  proposalTitle: string | null;
}

/**
 * Narrows the whale alert's jsonb payload. Exported for unit testing: rows
 * predating the current writer, or written by a future one, may be missing
 * fields or carry the wrong type, and a report generator must not throw on
 * one bad row.
 *
 * `voter` is lowercased here rather than trusted — it is the join key against
 * `delegates.address`, and a single stray uppercase character would silently
 * turn a known delegate into an "unknown wallet".
 */
export function parseWhaleAlertData(data: unknown): ParsedWhaleAlertData {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { voter: null, vp: null, vpPct: null, choice: null, choiceLabel: null, proposalTitle: null };
  }
  const d = data as Record<string, unknown>;
  const voter = asNonEmptyString(d.voter);
  return {
    voter: voter ? voter.toLowerCase() : null,
    vp: asFiniteNumber(d.vp),
    vpPct: asFiniteNumber(d.vpPct),
    choice: asFiniteNumber(d.choice),
    choiceLabel: asNonEmptyString(d.choiceLabel),
    proposalTitle: asNonEmptyString(d.proposalTitle),
  };
}

/**
 * `alerts.data.choice` is 1-INDEXED while `proposals.scores` / `.choices` are
 * 0-indexed — whale-detector.ts writes `choice: vote.choice` alongside
 * `choiceLabel: proposal.choices[vote.choice - 1]`, which pins the convention.
 * Getting this off by one attributes the whale's power to the *neighbouring*
 * option and produces plausible, completely wrong output, so the conversion
 * lives in one exported, tested place.
 */
export function choiceIndexFromAlert(choice: unknown): number | null {
  const n = asFiniteNumber(choice);
  if (n === null || !Number.isInteger(n) || n < 1) return null;
  return n - 1;
}

/** First max wins on ties — same convention as `computeLeadingChoice` in whale-detector.ts. */
function argmax(values: number[]): number {
  let bestIdx = 0;
  let max = -Infinity;
  values.forEach((v, i) => {
    if (v > max) {
      max = v;
      bestIdx = i;
    }
  });
  return bestIdx;
}

// =============================================
// Decisiveness (pure — the highest-integrity part of this module)
// =============================================

export interface DecisivenessInput {
  /** `proposals.scores` — 0-indexed, aligned with `proposals.choices`. */
  scores: number[] | null | undefined;
  /** `alerts.data.choice` — 1-INDEXED. */
  choice: number | null | undefined;
  /** `alerts.data.vp` — ABSOLUTE voting power, not a percentage. */
  vp: number | null | undefined;
  /** `proposals.votingType`. */
  votingType: string | null | undefined;
}

/**
 * Did this whale's voting power actually decide the outcome?
 *
 * The rule is a counterfactual recompute, not a margin comparison:
 *
 *     without = scores.slice(); without[choiceIndex] -= vp
 *     decisive = argmax(without) !== argmax(scores)
 *
 * i.e. *remove this voter and see who wins*. A margin test (`vpPct > top-2
 * gap`) is equivalent only when the whale backed the leading choice, and is
 * flatly wrong otherwise: pulling voting power off a LOSING option can only
 * widen the leader's lead, so such a whale can never have flipped anything —
 * yet a margin test would happily report them as decisive. It also
 * generalises past two choices, where "the margin" is ill-defined. The
 * top-two margin is still reported, purely as context for the reader.
 *
 * Absolute `vp` is used rather than the stored `data.vpPct`, which was
 * computed against `scoresTotal` at alert time while `scores` is current —
 * mixing the two would be silently inconsistent. Any displayed percentage is
 * re-derived from sum(scores) so the whole section agrees with itself.
 *
 * Returns `indeterminate` — never a default verdict in either direction —
 * whenever the inputs can't support the arithmetic. Checks run most
 * fundamental first: voting type, scores, choice count, choice index, vp.
 */
export function assessDecisiveness(input: DecisivenessInput): Decisiveness {
  const votingType = asNonEmptyString(input.votingType);
  if (votingType !== null && !SUBTRACTABLE_VOTING_TYPES.has(votingType)) {
    return { status: 'indeterminate', reason: 'unsupported_voting_type', votingType };
  }

  if (!Array.isArray(input.scores) || input.scores.length === 0) {
    return { status: 'indeterminate', reason: 'missing_scores' };
  }

  const scores = input.scores.map((s) => asFiniteNumber(s) ?? 0);
  const total = scores.reduce((sum, s) => sum + s, 0);
  if (total <= 0) {
    return { status: 'indeterminate', reason: 'missing_scores' };
  }

  if (scores.length < 2) {
    return { status: 'indeterminate', reason: 'insufficient_choices' };
  }

  const choiceIndex = choiceIndexFromAlert(input.choice);
  if (choiceIndex === null || choiceIndex >= scores.length) {
    return { status: 'indeterminate', reason: 'choice_out_of_range' };
  }

  const vp = asFiniteNumber(input.vp);
  if (vp === null || vp <= 0) {
    return { status: 'indeterminate', reason: 'missing_vp' };
  }

  const leaderIndex = argmax(scores);

  const without = scores.slice();
  // May go negative if `scores` was resynced downward after the alert — that
  // only makes the counterfactual more conservative, never less.
  without[choiceIndex] = (without[choiceIndex] ?? 0) - vp;
  const counterfactualLeaderIndex = argmax(without);

  // Context only. Second-largest by value, keeping its original index.
  const ranked = scores
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value || a.index - b.index);
  const leader = ranked[0]!;
  const runnerUp = ranked[1]!;
  const marginPct = Math.min(100, Math.max(0, ((leader.value - runnerUp.value) / total) * 100));

  return {
    status: counterfactualLeaderIndex !== leaderIndex ? 'decisive' : 'not_decisive',
    leaderIndex,
    counterfactualLeaderIndex,
    choiceIndex,
    runnerUpIndex: runnerUp.index,
    marginPct,
    vpPct: Math.min(100, (vp / total) * 100),
    vp,
  };
}

/**
 * The whale's share of the CURRENT per-choice totals. Separate from
 * `assessDecisiveness` so the headline can show a consistent percentage even
 * when the verdict itself is indeterminate (e.g. an approval-voting
 * proposal, where the scores are fine but the subtraction isn't meaningful).
 */
export function deriveVpPct(
  scores: number[] | null | undefined,
  vp: number | null | undefined,
): number | null {
  if (!Array.isArray(scores) || scores.length === 0) return null;
  const power = asFiniteNumber(vp);
  if (power === null || power <= 0) return null;
  const total = scores.reduce<number>((sum, s) => sum + (asFiniteNumber(s) ?? 0), 0);
  if (total <= 0) return null;
  return Math.min(100, (power / total) * 100);
}

// =============================================
// Fetch (the only DB-touching function here)
// =============================================

function displayNameFor(row: { address: string; name: string | null; ensName: string | null }): string {
  return asNonEmptyString(row.ensName) ?? asNonEmptyString(row.name) ?? shortenAddress(row.address);
}

/**
 * The week's whale alerts for one DAO, each enriched with the voter's
 * delegate profile (when we have one), that delegate's activity in THIS DAO,
 * and a computed decisiveness verdict from the proposal's scores.
 *
 * Window matches `gatherDigestData`: everything created after `weekOf - 7d`,
 * newest first, so this section lines up row-for-row with the report's
 * existing whale section.
 */
export async function fetchWhaleContext(
  daoId: string,
  weekOf = new Date(),
): Promise<WhaleContextItem[]> {
  const weekAgo = new Date(weekOf.getTime() - 7 * 86400_000);

  // Left join: an alert whose proposal row was deleted still deserves a line
  // in the report, it just can't get a decisiveness verdict.
  const rows = await db
    .select({
      id: alerts.id,
      createdAt: alerts.createdAt,
      data: alerts.data,
      proposalId: alerts.proposalId,
      proposalTitle: proposals.title,
      proposalState: proposals.state,
      votingType: proposals.votingType,
      choices: proposals.choices,
      scores: proposals.scores,
    })
    .from(alerts)
    .leftJoin(proposals, eq(proposals.id, alerts.proposalId))
    .where(
      and(eq(alerts.daoId, daoId), eq(alerts.type, 'whale_vote'), gt(alerts.createdAt, weekAgo)),
    )
    .orderBy(desc(alerts.createdAt))
    // Over-fetch, then thin per voter below. Taking the newest N outright
    // reads badly on real data: DAOs that run near-duplicate proposals (e.g.
    // Aavegotchi's "[25-day-clone]"/"[32-day-clone]" pairs of one SIGPROP)
    // produced eight entries that were the same two whales repeated four
    // times each, crowding out every other voter.
    .limit(WHALE_CONTEXT_FETCH_LIMIT);

  const parsed = thinPerVoter(
    rows.map((row) => ({ row, data: parseWhaleAlertData(row.data) })),
  );

  // One batched lookup for every distinct voter, not one query per alert.
  const voterAddresses = [
    ...new Set(parsed.map((p) => p.data.voter).filter((v): v is string => v !== null)),
  ];

  const delegateRows = voterAddresses.length
    ? await db
        .select({
          address: delegates.address,
          name: delegates.name,
          ensName: delegates.ensName,
          karmaScore: delegates.karmaScore,
          karmaRank: delegates.karmaRank,
          karmaUrl: delegates.karmaUrl,
          participationRate: delegates.participationRate,
          totalVotesCast: delegates.totalVotesCast,
          totalDaosActive: delegates.totalDaosActive,
          daoVotingPower: delegateDaoActivity.votingPower,
        })
        .from(delegates)
        // Scoped to this DAO inside the ON clause, not the WHERE clause, so a
        // delegate with no activity row here still returns their profile.
        .leftJoin(
          delegateDaoActivity,
          and(
            eq(delegateDaoActivity.delegateId, delegates.id),
            eq(delegateDaoActivity.daoId, daoId),
          ),
        )
        .where(inArray(delegates.address, voterAddresses))
    : [];

  const profileByAddress = new Map<string, WhaleDelegateProfile>(
    delegateRows.map((d) => [
      d.address,
      {
        address: d.address,
        displayName: displayNameFor(d),
        isPubliclyIdentified:
          asNonEmptyString(d.ensName) !== null ||
          asNonEmptyString(d.name) !== null ||
          asFiniteNumber(d.karmaScore) !== null,
        karmaScore: asFiniteNumber(d.karmaScore),
        karmaRank: d.karmaRank ?? null,
        karmaUrl: asNonEmptyString(d.karmaUrl),
        participationRate: asFiniteNumber(d.participationRate),
        totalVotesCast: d.totalVotesCast ?? null,
        totalDaosActive: d.totalDaosActive ?? null,
        daoVotingPower: asFiniteNumber(d.daoVotingPower),
      },
    ]),
  );

  return parsed.map(({ row, data }) => ({
    alertId: row.id,
    createdAt: row.createdAt,
    voter: data.voter,
    vp: data.vp,
    vpPctAtAlert: data.vpPct,
    vpPctOfScores: deriveVpPct(row.scores, data.vp),
    choiceLabel: data.choiceLabel,
    // The joined proposal is authoritative; the jsonb copy is a snapshot.
    proposalTitle: asNonEmptyString(row.proposalTitle) ?? data.proposalTitle,
    proposalId: row.proposalId,
    proposalState: row.proposalState ?? null,
    votingType: row.votingType ?? null,
    choices: row.choices ?? [],
    delegate: data.voter ? profileByAddress.get(data.voter) ?? null : null,
    decisiveness: assessDecisiveness({
      scores: row.scores,
      choice: data.choice,
      vp: data.vp,
      votingType: row.votingType,
    }),
  }));
}

// =============================================
// Markdown (pure)
// =============================================

function choiceLabelAt(choices: string[], index: number): string {
  return asNonEmptyString(choices[index]) ?? `choice ${index + 1}`;
}

/** Identity line: who is this address, and what do we actually know about them? */
function formatIdentityLine(item: WhaleContextItem): string {
  const d = item.delegate;
  if (!d) {
    // Explicitly "not in the set" rather than blank/zero metrics, which would
    // read as a delegate with terrible stats instead of no profile at all.
    return "  - _No delegate profile — address not seen in this DAO's delegate set._";
  }

  const facts: string[] = [];
  if (d.karmaScore !== null) {
    facts.push(
      d.karmaRank !== null
        ? `Karma ${d.karmaScore.toFixed(1)} (rank #${d.karmaRank})`
        : `Karma ${d.karmaScore.toFixed(1)}`,
    );
  }
  if (d.participationRate !== null) facts.push(`${(d.participationRate * 100).toFixed(0)}% participation`);
  if (d.totalVotesCast !== null) facts.push(`${d.totalVotesCast} votes cast`);
  if (d.totalDaosActive !== null) facts.push(`active in ${d.totalDaosActive} DAOs`);
  if (d.daoVotingPower !== null) facts.push(`${formatNumber(d.daoVotingPower)} VP here`);

  const summary = facts.length ? facts.join(' · ') : 'no reputation metrics recorded';

  // "Known delegate" is only honest when something actually identifies them
  // publicly — an ENS/display name, or a Karma delegate profile. A bare row in
  // `delegates` proves nothing: rebuildDelegateProfiles materialises a row for
  // EVERY frequent voter straight out of the votes table. Calling such an
  // address a known delegate tells a paying customer they can go talk to
  // someone who may have no public identity at all.
  const label = d.isPubliclyIdentified
    ? 'Known delegate'
    : 'Recurring voter we track — no public delegate identity';
  return `  - ${label} — ${summary}.`;
}

const INDETERMINATE_PROSE: Record<DecisivenessReason, string> = {
  missing_scores: 'no per-choice results recorded for this proposal',
  insufficient_choices: 'the proposal has fewer than two choices, so there was no alternative outcome to flip to',
  choice_out_of_range: "the alert's recorded choice doesn't line up with the proposal's choices",
  missing_vp: "this alert did not record the voter's absolute voting power",
  unsupported_voting_type: 'unsupported voting type',
};

/** Impact line: always the output of `assessDecisiveness`, never a claim we invented. */
function formatImpactLine(item: WhaleContextItem): string {
  const v = item.decisiveness;
  if (v.status === 'indeterminate') {
    const detail =
      v.reason === 'unsupported_voting_type'
        ? `voting type '${v.votingType}' — subtracting one voter's power from a single choice isn't meaningful here`
        : INDETERMINATE_PROSE[v.reason];
    return `  - ❔ **Impact undetermined** — ${detail}.`;
  }

  const own = choiceLabelAt(item.choices, v.choiceIndex);
  const leader = choiceLabelAt(item.choices, v.leaderIndex);
  const share = `${v.vpPct.toFixed(1)}% of votes cast (${formatNumber(v.vp)} VP)`;
  const margin = `Top-two margin: ${v.marginPct.toFixed(1)}% over "${choiceLabelAt(item.choices, v.runnerUpIndex)}".`;

  if (v.status === 'decisive') {
    const flipped = choiceLabelAt(item.choices, v.counterfactualLeaderIndex);
    return `  - ⚠️ **Decisive** — take their ${share} back off "${own}" and the winner flips from "${leader}" to "${flipped}". ${margin}`;
  }
  return `  - ✅ **Not decisive** — "${leader}" still wins without their ${share} on "${own}"; the outcome would not have changed. ${margin}`;
}

function formatHeadline(item: WhaleContextItem): string {
  const who = item.delegate?.displayName ?? (item.voter ? shortenAddress(item.voter) : 'Unknown address');
  // Prefer the freshly-derived share so every percentage in this section is
  // measured against the same denominator; the stored one is labelled as the
  // point-in-time figure it is.
  const share =
    item.vpPctOfScores !== null
      ? `${item.vpPctOfScores.toFixed(1)}% of votes cast`
      : item.vpPctAtAlert !== null
        ? `${item.vpPctAtAlert.toFixed(1)}% of total voting power (as recorded when the alert fired)`
        : 'an unrecorded share of voting power';
  const choice = item.choiceLabel ? ` for "${item.choiceLabel}"` : '';
  const on = item.proposalTitle ? ` on "${item.proposalTitle}"` : '';
  return `- **${who}** — cast ${share}${choice}${on}`;
}

/**
 * Pure formatter for the whale/delegate context section. Same discipline as
 * `formatFallback`/`formatCuratedNotesSection` in digest-generator.ts: a pure
 * function of already-fetched data, no DB access, and `''` when there is
 * nothing to say — so an empty week appends nothing rather than an empty
 * heading. Leading `\n\n` matches `formatCuratedNotesSection`, which is
 * concatenated onto an existing report body.
 */
export function formatWhaleContextSection(items: WhaleContextItem[]): string {
  if (items.length === 0) return '';

  const blocks = items
    .map((item) => [formatHeadline(item), formatIdentityLine(item), formatImpactLine(item)].join('\n'))
    .join('\n');

  return `\n\n## 🐳 Whale & delegate context\n${blocks}`;
}
