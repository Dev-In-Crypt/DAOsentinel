/**
 * TODO-067: "Recommended actions" for the PAID org-scoped weekly report.
 *
 * Batch 1 (TODO-063..066) told the customer what happened: which alerts fired,
 * which metric moved the Democracy Score, where quorum stands, and whether a
 * whale actually decided a vote. This module answers the question the $750/30d
 * subscription is actually sold on — *what should this team do next?*
 *
 * HARD PRODUCT CONSTRAINT — this is a RULE ENGINE, not a writer.
 * No LLM, no DB, no `Date.now()`: `buildRecommendations` is a pure function of
 * the four batch-1 outputs plus an injected `now`. Advice given to a DAO about
 * its own governance and treasury has to be traceable to a fact, so:
 *
 *   1. every recommendation carries `ruleId` (which rule fired) AND `evidence`
 *      (the specific proposal / address / metric and the actual numbers that
 *      made it fire). A recommendation a customer cannot trace back to a fact
 *      is worse than no recommendation — it is an unsourced claim about their
 *      governance, in a paid report.
 *   2. nothing is padded. When no rule fires the output is a single honest
 *      "nothing requires action this week" item, which itself states what was
 *      reviewed. Manufacturing urgency to fill a section is the fastest way to
 *      make the whole report ignorable.
 *
 * Every rule below is a re-reading of data another module already computed and
 * already stands behind; this file introduces no new claims about the DAO, it
 * only decides which of those facts implies an action and how urgent it is.
 *
 * Split follows the house pattern (formatOrgReportCsv, formatAttentionAlerts-
 * Section, formatScoreAttributionSection): logic and markdown pure and
 * unit-testable without a live database. Wiring the section into the report
 * body happens separately — this module deliberately does not touch
 * digest-generator.ts.
 */

import { METRIC_HINT, METRIC_LABEL } from '@/lib/constants';
import { formatNumber, formatPct, shortenAddress } from '@/lib/utils';
import type { AttentionAlert } from './attention-alerts';
import type { MetricContribution, ScoreAttribution, ScoreMetric } from './score-attribution';
import type { UpcomingProposalItem } from './upcoming-quorum';
import type { WhaleContextItem } from './whale-context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Every rule this engine can fire, in canonical order. The order is also the
 * final deterministic tie-break in `sortRecommendations`, so two rules that
 * agree on priority and deadline still order stably.
 *
 * `no_action_needed` is a rule like any other: it is the one that fires when
 * nothing else did, and it carries evidence too (what was reviewed).
 */
export const RECOMMENDATION_RULES = [
  'quorum_push',
  'contact_decisive_delegate',
  'identify_decisive_whale',
  'investigate_coordination',
  'prepare_swing_comms',
  'confirm_quorum_manually',
  'review_score_metric',
  'review_quorum_threshold',
  'no_action_needed',
] as const;

export type RecommendationRuleId = (typeof RECOMMENDATION_RULES)[number];

/**
 * high   — time-boxed and still changeable: acting before the deadline can
 *          change the outcome of a live vote.
 * medium — this week's work, but the outcome it concerns is already fixed
 *          (comms, investigation) or the deadline is not the binding constraint.
 * low    — structural / process follow-ups with no deadline at all.
 */
export type RecommendationPriority = 'high' | 'medium' | 'low';

export interface Recommendation {
  /** Which rule fired. Half of the traceability contract. */
  ruleId: RecommendationRuleId;
  /**
   * What the recommendation is *about* — a proposal id, an address, a metric
   * key. Together with `ruleId` this is the dedupe key, so two whale alerts on
   * one proposal cannot produce the same advice twice.
   */
  subject: string;
  priority: RecommendationPriority;
  /** The imperative: what to actually do. */
  action: string;
  /**
   * The concrete trigger — named proposal / address / metric plus the real
   * numbers. Guaranteed non-empty for every item this module emits.
   */
  evidence: string;
  /** The deadline that makes it urgent; null when the item is not time-boxed. */
  deadline: Date | null;
}

/**
 * The four batch-1 outputs. All optional so a caller that hasn't wired a
 * section yet (or a DAO with no data for it) degrades to fewer rules rather
 * than to an error — the engine simply has less to fire on.
 */
export interface RecommendationInput {
  upcoming?: readonly UpcomingProposalItem[];
  whales?: readonly WhaleContextItem[];
  alerts?: readonly AttentionAlert[];
  attribution?: ScoreAttribution | null;
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/**
 * How many recommendations the section carries. A list nobody finishes reading
 * is a list nobody acts on. HIGH-priority items are exempt (see
 * `applyCap`): silently dropping "this vote fails in 2 days unless you act"
 * to honour a display cap would be the single worst bug this module could have.
 */
export const RECOMMENDATION_LIMIT = 6;

/**
 * Minimum negative share of the Democracy Score move before a metric is worth
 * telling a customer to act on. Contributions are `delta * weight` rounded to
 * 2dp by `attributeScoreChange`, and a weekly recompute jitters by a few
 * hundredths on its own; half a point is the smallest move that is visibly
 * more than that noise.
 */
export const MATERIAL_NEGATIVE_CONTRIBUTION = 0.5;

/**
 * How close a proposal's deadline must be before an unpublished quorum figure
 * becomes an action rather than a note. Set to the report cadence: a vote
 * closing inside seven days closes BEFORE the next weekly report, so if the
 * Governor's quorum isn't confirmed now there is no later.
 */
export const CONFIRM_QUORUM_WITHIN_DAYS = 7;

/** How many at-risk proposals in one week make it a threshold problem, not an incident. */
export const THRESHOLD_REVIEW_MIN_AT_RISK = 2;

const DAY_MS = 86400_000;

// ---------------------------------------------------------------------------
// Per-metric actions
// ---------------------------------------------------------------------------

/**
 * What to actually DO about each Democracy Score axis. Written per metric
 * rather than as one generic "look into the score drop", because the five axes
 * have nothing in common operationally — a participation slide is a comms
 * problem, a power-distribution slide is a delegation problem. The customer's
 * own methodology text (`METRIC_HINT`) is attached to the evidence so the
 * action and the definition it follows from stay side by side.
 */
const METRIC_ACTION: Record<ScoreMetric, string> = {
  participation:
    'Run a turnout push before the next vote — remind delegates directly and check that proposals are being announced where holders actually read.',
  powerDistribution:
    'Review delegation concentration — recruiting or promoting delegates outside the current largest holders is the only lever that moves this axis.',
  proposalDiversity:
    'Widen the author pool — solicit proposals from contributors outside the core team, since a narrow set of authors sets the whole agenda.',
  delegateAccountability:
    'Chase the inactive delegates in the top 20 by voting power — ask them to vote or to redelegate.',
  manipulationResistance:
    'Review this period’s whale votes and late swings — this axis falls when proposals are decided by one large holder or flip near the deadline.',
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * `proposals.choices` is jsonb and `scores` is a separate jsonb array, so an
 * index valid in one is not guaranteed to be valid in the other. Same fallback
 * as `choiceLabelAt` in whale-context.ts / upcoming-quorum.ts.
 */
function choiceLabelAt(choices: readonly string[], index: number): string {
  const raw = choices[index];
  return typeof raw === 'string' && raw.trim() !== '' ? raw : `choice ${index + 1}`;
}

/** Who the customer would actually contact, or the address if we have no name. */
function whaleName(item: WhaleContextItem): string {
  if (item.delegate) return item.delegate.displayName;
  return item.voter ? shortenAddress(item.voter) : 'an unidentified address';
}

/**
 * Open votes only, and only ones that have not already closed at `now`.
 * `fetchUpcomingWithQuorum` already filters on the deadline, but this module
 * is pure and may be handed anything — advising a customer to push turnout on
 * a vote that closed yesterday is exactly the sort of confidently-wrong output
 * the traceability rule exists to prevent.
 */
function openItems(
  items: readonly UpcomingProposalItem[],
  now: Date,
): Extract<UpcomingProposalItem, { phase: 'open' }>[] {
  return items.filter(
    (i): i is Extract<UpcomingProposalItem, { phase: 'open' }> =>
      i.phase === 'open' && i.endTimestamp.getTime() > now.getTime(),
  );
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/**
 * RULE `quorum_push` — an open vote flagged `at_risk`.
 *
 * `at_risk` is not a judgement made here: it is the flag `computeQuorumProgress`
 * sets under exactly the condition that raises a `quorum_risk` alert (short of
 * quorum AND past `QUORUM_RISK_WINDOW_ELAPSED` of the window). The action is
 * turnout, not persuasion — below quorum the proposal fails however the votes
 * split — so the evidence names the shortfall in votes, not the leading choice.
 */
function ruleQuorumPush(open: readonly Extract<UpcomingProposalItem, { phase: 'open' }>[]): Recommendation[] {
  const out: Recommendation[] = [];
  for (const item of open) {
    if (item.quorum.status !== 'at_risk') continue;
    const shortfall = Math.max(item.quorum.quorum - item.quorum.scoresTotal, 0);
    out.push({
      ruleId: 'quorum_push',
      subject: item.id,
      priority: 'high',
      action: `Push turnout on "${item.title}" before it closes — it needs about ${formatNumber(shortfall)} more votes to reach quorum.`,
      evidence: `"${item.title}" (${item.source}) is at ${formatPct(item.quorum.pct, 0)} of quorum (${formatNumber(item.quorum.scoresTotal)} of ${formatNumber(item.quorum.quorum)}) with ${item.timeLeft} — the same condition that raises a quorum-risk alert.`,
      deadline: item.endTimestamp,
    });
  }
  return out;
}

/**
 * RULE `confirm_quorum_manually` — an open vote whose source published no
 * quorum figure, closing before the next report.
 *
 * Every Tally-sourced proposal hits this: `tally-sync.ts` writes `quorum: null`
 * on purpose because on-chain Governor quorum semantics differ from Snapshot's.
 * We therefore cannot say whether this vote is at risk — and "we don't know" on
 * a vote that closes this week is itself an action item, not a footnote.
 */
function ruleConfirmQuorumManually(
  open: readonly Extract<UpcomingProposalItem, { phase: 'open' }>[],
  now: Date,
): Recommendation[] {
  const horizon = now.getTime() + CONFIRM_QUORUM_WITHIN_DAYS * DAY_MS;
  const out: Recommendation[] = [];
  for (const item of open) {
    if (item.quorum.status !== 'not_published') continue;
    if (item.endTimestamp.getTime() > horizon) continue;
    out.push({
      ruleId: 'confirm_quorum_manually',
      subject: item.id,
      priority: 'medium',
      action: `Confirm the quorum requirement for "${item.title}" directly from the Governor contract — this report cannot tell you whether it is on track.`,
      evidence: `"${item.title}" (${item.source}) reports ${item.quorum.reason}, so no quorum progress could be computed, and it closes ${isoDay(item.endTimestamp)} (${item.timeLeft}).`,
      deadline: item.endTimestamp,
    });
  }
  return out;
}

/**
 * RULE `review_quorum_threshold` — two or more at-risk votes in one week.
 *
 * One vote missing quorum is an incident and the fix is outreach. Several in a
 * single week is a parameter problem, and no amount of outreach fixes a quorum
 * set above what the electorate can turn out. Low priority by construction:
 * it is a governance discussion, not something to do before Friday.
 */
function ruleQuorumThresholdReview(
  open: readonly Extract<UpcomingProposalItem, { phase: 'open' }>[],
): Recommendation[] {
  // Collect title + pct while the union is still narrowed — `quorum.pct` does
  // not exist on the `not_published` variant, so it can't be read after a
  // filter that TypeScript cannot follow into the nested discriminant.
  //
  // Counted per DISTINCT proposal id: this rule's whole claim is "this happened
  // to N different votes", so one proposal appearing twice (a duplicated row, a
  // caller concatenating two overlapping fetches) must not manufacture a
  // pattern out of a single incident. The generic (ruleId, subject) dedupe
  // cannot catch this one — the duplicates are inside a single item's evidence.
  const atRisk: { title: string; pct: number }[] = [];
  const counted = new Set<string>();
  for (const item of open) {
    if (item.quorum.status !== 'at_risk') continue;
    if (counted.has(item.id)) continue;
    counted.add(item.id);
    atRisk.push({ title: item.title, pct: item.quorum.pct });
  }
  if (atRisk.length < THRESHOLD_REVIEW_MIN_AT_RISK) return [];

  return [
    {
      ruleId: 'review_quorum_threshold',
      subject: 'quorum_threshold',
      priority: 'low',
      action:
        'Open a governance discussion on the quorum threshold — repeated near-misses are a parameter problem, not an outreach problem.',
      evidence: `${plural(atRisk.length, 'open proposal is', 'open proposals are')} short of quorum in the final stretch this week: ${atRisk
        .map((i) => `"${i.title}" (${formatPct(i.pct, 0)} of quorum)`)
        .join(', ')}.`,
      deadline: null,
    },
  ];
}

/**
 * RULES `contact_decisive_delegate` / `identify_decisive_whale` — a voter whose
 * power is currently deciding a still-open proposal.
 *
 * "Decisive" is `assessDecisiveness`'s counterfactual recompute (remove this
 * voter's power from their own choice and the winner changes), never a margin
 * comparison, and never a verdict invented here. Two rules rather than one
 * because the actions differ: a known delegate has a name and a channel and can
 * be contacted today; an unknown address has to be identified first, which is
 * research, not outreach — hence medium rather than high.
 *
 * `deadlineByProposal` comes from the upcoming section, so an item only gets a
 * deadline when the same report also lists that vote as genuinely still open.
 */
function ruleDecisiveWhales(
  whales: readonly WhaleContextItem[],
  deadlineByProposal: ReadonlyMap<string, Date>,
): Recommendation[] {
  const out: Recommendation[] = [];

  for (const item of whales) {
    const v = item.decisiveness;
    if (v.status !== 'decisive') continue;
    // Only a still-open vote can be influenced; on a closed one the same fact
    // belongs in the whale section as history, not in an action list.
    if (item.proposalState !== 'active') continue;

    const who = whaleName(item);
    const proposal = item.proposalTitle ?? 'an active proposal';
    const own = choiceLabelAt(item.choices, v.choiceIndex);
    const leader = choiceLabelAt(item.choices, v.leaderIndex);
    const flipped = choiceLabelAt(item.choices, v.counterfactualLeaderIndex);
    const deadline = item.proposalId ? deadlineByProposal.get(item.proposalId) ?? null : null;
    const by = deadline ? ` before it closes ${isoDay(deadline)}` : ' before voting closes';

    const counterfactual = `${who} cast ${v.vpPct.toFixed(1)}% of votes cast (${formatNumber(v.vp)} VP) for "${own}" on "${proposal}"; removing that power flips the winner from "${leader}" to "${flipped}".`;

    if (item.delegate) {
      out.push({
        ruleId: 'contact_decisive_delegate',
        subject: `${item.proposalId ?? proposal}:${item.delegate.address}`,
        priority: 'high',
        action: `Contact ${who} about "${proposal}"${by} — their vote alone is currently deciding the outcome.`,
        evidence: `${counterfactual} They have a delegate profile, so they are reachable by name.`,
        deadline,
      });
    } else {
      out.push({
        ruleId: 'identify_decisive_whale',
        subject: `${item.proposalId ?? proposal}:${item.voter ?? 'unknown'}`,
        priority: 'medium',
        action: `Identify ${who} on "${proposal}"${by} — you cannot engage a counterparty you cannot name.`,
        evidence: `${counterfactual} No delegate profile exists for this address in this DAO's delegate set.`,
        deadline,
      });
    }
  }

  return out;
}

/**
 * RULES `prepare_swing_comms` / `investigate_coordination` — driven off the
 * alert section rather than off raw rows, so the action list and the alert list
 * in the same report can never disagree about what fired.
 *
 * Both concern votes that have usually already closed, so neither is `high`:
 * the outcome is fixed and the work is explaining or checking it. Coordination
 * escalates to `high` on a `critical` alert, where the question is whether the
 * apparent breadth of support was real at all.
 */
function ruleAlertDriven(alerts: readonly AttentionAlert[]): Recommendation[] {
  const out: Recommendation[] = [];

  for (const alert of alerts) {
    const on = alert.proposalTitle ? `"${alert.proposalTitle}"` : 'the flagged proposal';

    if (alert.type === 'last_minute_swing') {
      out.push({
        ruleId: 'prepare_swing_comms',
        subject: alert.proposalTitle ?? alert.id,
        priority: 'medium',
        action: `Prepare a short note on ${on} — the outcome changed late in the voting window, and people who stopped watching will ask why.`,
        evidence: `Alert "${alert.title}" (${alert.severity}): ${alert.participants}`,
        deadline: alert.deadline,
      });
      continue;
    }

    if (alert.type === 'coordinated_voting') {
      out.push({
        ruleId: 'investigate_coordination',
        subject: alert.proposalTitle ?? alert.id,
        priority: alert.severity === 'critical' ? 'high' : 'medium',
        action: `Review the co-funded addresses on ${on} before treating their votes as independent support.`,
        evidence: `Alert "${alert.title}" (${alert.severity}): ${alert.participants}`,
        deadline: alert.deadline,
      });
    }
  }

  return out;
}

/**
 * RULE `review_score_metric` — a Democracy Score axis that took a materially
 * negative share of this period's move.
 *
 * Only fires on an `attributed` result: every `unavailable` reason means the
 * decomposition could not be stood behind, and advice derived from numbers we
 * refuse to publish would be worse than the numbers themselves. `contribution`
 * (`delta * weight`) is the right trigger rather than `delta`, since a large
 * move on a 0.15-weight axis can matter less than a small one on a 0.25 axis.
 */
function ruleScoreMetrics(attribution: ScoreAttribution | null | undefined): Recommendation[] {
  if (!attribution || attribution.status !== 'attributed') return [];

  const drivers: MetricContribution[] = attribution.drivers.filter(
    (d) => d.contribution <= -MATERIAL_NEGATIVE_CONTRIBUTION,
  );

  return drivers.map((d) => {
    // The driver carries label/hint already, but both fall back to '' when a
    // metric key is missing from the shared maps — re-resolve so the customer
    // never sees a bare `powerDistribution` in a paid report.
    const label = d.label || METRIC_LABEL[d.metric] || d.metric;
    const hint = d.hint || METRIC_HINT[d.metric] || '';
    const direction = d.delta < 0 ? 'fell' : 'rose';
    const period = `between ${isoDay(attribution.period.baselineComputedAt)} and ${isoDay(attribution.period.currentComputedAt)}`;

    return {
      ruleId: 'review_score_metric' as const,
      subject: d.metric,
      priority: 'medium' as const,
      action: METRIC_ACTION[d.metric],
      evidence: `${label} ${direction} ${Math.abs(d.delta).toFixed(2)} points (${d.previous.toFixed(0)} → ${d.current.toFixed(0)}) ${period}, taking ${d.contribution.toFixed(2)} off the ${attribution.scoreDelta.toFixed(2)} Democracy Score move.${hint ? ` ${hint}` : ''}`,
      deadline: null,
    };
  });
}

/**
 * The honest empty case. Not a placeholder: it states what was actually
 * examined, so "nothing to do" is itself a traceable result rather than a
 * section that failed to render.
 */
function noActionNeeded(input: RecommendationInput, now: Date): Recommendation {
  const open = (input.upcoming ?? []).filter((i) => i.phase === 'open').length;
  const alerts = (input.alerts ?? []).length;
  const whales = (input.whales ?? []).length;
  const drivers =
    input.attribution?.status === 'attributed' ? input.attribution.drivers.length : 0;

  return {
    ruleId: 'no_action_needed',
    subject: 'week',
    priority: 'low',
    action:
      'No action required from this report — governance is proceeding normally on every signal we track.',
    evidence: `Reviewed ${plural(open, 'open vote', 'open votes')}, ${plural(alerts, 'actionable alert', 'actionable alerts')}, ${plural(whales, 'whale vote', 'whale votes')} and ${plural(drivers, 'score driver', 'score drivers')} for the week ending ${isoDay(now)}; none met the trigger for any recommendation rule.`,
    deadline: null,
  };
}

// ---------------------------------------------------------------------------
// Ordering, dedupe, cap
// ---------------------------------------------------------------------------

const PRIORITY_RANK: Record<RecommendationPriority, number> = { high: 0, medium: 1, low: 2 };

/** Undated items sort after every dated one — a deadline is what creates urgency. */
function deadlineRank(d: Date | null): number {
  return d ? d.getTime() : Number.POSITIVE_INFINITY;
}

/**
 * Priority, then soonest deadline, then rule order, then subject. The last two
 * legs exist purely so the sort is total: with them, running the engine twice
 * on identical input cannot produce two different orderings (`Array.sort` is
 * stable in modern V8, but relying on input order would make the output depend
 * on the order rows happened to come back from Postgres).
 */
function compareRecommendations(a: Recommendation, b: Recommendation): number {
  const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (byPriority !== 0) return byPriority;

  const byDeadline = deadlineRank(a.deadline) - deadlineRank(b.deadline);
  if (byDeadline !== 0) return byDeadline;

  const byRule = RECOMMENDATION_RULES.indexOf(a.ruleId) - RECOMMENDATION_RULES.indexOf(b.ruleId);
  if (byRule !== 0) return byRule;

  // Plain codepoint comparison, not localeCompare: locale-sensitive collation
  // would make the output depend on the server's ICU data.
  return a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0;
}

/**
 * One item per (rule, subject). Runs AFTER the sort so the survivor is chosen
 * deterministically — the highest-priority, soonest-deadline instance wins
 * rather than whichever row the query returned first.
 */
function dedupe(items: readonly Recommendation[]): Recommendation[] {
  const seen = new Set<string>();
  const out: Recommendation[] = [];
  for (const item of items) {
    const key = `${item.ruleId}::${item.subject}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Trims to `RECOMMENDATION_LIMIT` — but never at the cost of a `high`. A high
 * item is a live vote whose outcome the customer can still change; a display
 * cap is a readability preference. When the two conflict, readability loses.
 */
function applyCap(sorted: readonly Recommendation[], limit = RECOMMENDATION_LIMIT): Recommendation[] {
  const high = sorted.filter((r) => r.priority === 'high');
  const rest = sorted.filter((r) => r.priority !== 'high');
  const room = Math.max(limit - high.length, 0);
  // `sorted` already places every high first, so concatenating preserves order.
  return [...high, ...rest.slice(0, room)];
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * The whole engine: batch-1 outputs in, ordered and traceable actions out.
 *
 * `now` is an injected parameter, never `Date.now()`. Two rules depend on the
 * clock (has this vote already closed; does this one close before the next
 * report) and a hidden clock read would make both the report and its tests
 * irreproducible.
 *
 * Guarantees, all covered by tests:
 *   - every item has a non-empty `evidence` naming the fact that triggered it;
 *   - identical input yields identical output, element for element;
 *   - at most one item per (ruleId, subject);
 *   - no `high` item is ever dropped to honour `RECOMMENDATION_LIMIT`;
 *   - an empty week returns exactly one `no_action_needed` item.
 */
export function buildRecommendations(input: RecommendationInput, now: Date): Recommendation[] {
  const upcoming = input.upcoming ?? [];
  const open = openItems(upcoming, now);

  // Deadlines for the whale rules. Only genuinely-open votes are in here, so a
  // whale on a closed proposal cannot pick up a deadline by accident.
  const deadlineByProposal = new Map<string, Date>(open.map((i) => [i.id, i.endTimestamp]));

  const generated: Recommendation[] = [
    ...ruleQuorumPush(open),
    ...ruleConfirmQuorumManually(open, now),
    ...ruleQuorumThresholdReview(open),
    ...ruleDecisiveWhales(input.whales ?? [], deadlineByProposal),
    ...ruleAlertDriven(input.alerts ?? []),
    ...ruleScoreMetrics(input.attribution),
  ];

  if (generated.length === 0) return [noActionNeeded(input, now)];

  return applyCap(dedupe([...generated].sort(compareRecommendations)));
}

// ---------------------------------------------------------------------------
// Markdown (pure)
// ---------------------------------------------------------------------------

/** Same marker vocabulary as `formatAttentionAlertsSection`'s severities. */
const PRIORITY_MARKERS: Record<RecommendationPriority, string> = {
  high: '🔴',
  medium: '🟠',
  low: '⚪',
};

const SECTION_HEADER = '\n\n## 🎯 Recommended actions';

/**
 * Pure markdown for the section, in the `## ` emoji-header / `- **bold**`
 * bullet style of `formatFallback` and `formatCuratedNotesSection` in
 * digest-generator.ts, with the same leading blank-line gap so it concatenates
 * onto an existing report body.
 *
 * Returns `''` only for an empty array — which `buildRecommendations` never
 * produces, and which therefore means the caller never ran the engine. The
 * genuinely-quiet week is NOT silence: it is the `no_action_needed` item, and
 * it renders as a real reassuring line. A paying customer who reads "nothing
 * needs your attention this week, here is what we checked" got an answer; one
 * who finds the section missing got a bug they now have to ask about.
 *
 * Every bullet prints its rule id next to its evidence. That is deliberate:
 * it lets a customer (or support) ask "why did I get this?" and get an exact
 * answer instead of an opinion.
 */
export function formatRecommendationsSection(items: readonly Recommendation[]): string {
  if (items.length === 0) return '';

  const blocks = items.map((r) => {
    const lines = [
      `- ${PRIORITY_MARKERS[r.priority]} **${r.action}**`,
      `  - **Trigger:** \`${r.ruleId}\` — ${r.evidence}`,
    ];
    // Omitted rather than blank when the item isn't time-boxed: an empty
    // "By:" reads as missing data instead of "there is no deadline".
    if (r.deadline) lines.push(`  - **By:** ${isoDay(r.deadline)}`);
    return lines.join('\n');
  });

  return `${SECTION_HEADER}\n_Each action below is produced by a named rule from data shown elsewhere in this report — nothing here is inferred or generated._\n${blocks.join('\n')}`;
}
