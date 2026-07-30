/**
 * TODO-068 (part A): the executive summary that opens the PAID org-scoped
 * weekly report.
 *
 * Everything a reader trusts in this section — the risk level, the drivers
 * that justify it, the key events — is DERIVED, not written. The only thing an
 * LLM is allowed to do here is rephrase an already-verified fact object into a
 * paragraph, and even that is gated by `proseIsSafe`, which throws the model's
 * output away and keeps the deterministic text whenever the output contains a
 * number the facts do not.
 *
 * Why the risk level is not an LLM judgement: it is the single most
 * consequential sentence in the document (a DAO ops team decides whether to
 * read the rest of it from that word), it must be reproducible from the same
 * data a week later, and it must agree with the alerts, quorum and whale
 * sections printed underneath it. A model cannot guarantee any of the three.
 *
 * VOCABULARY WARNING — this module's scale is `low` / `elevated` / `high`,
 * deliberately NOT `low` / `medium` / `high`. `proposals.aiRiskLevel` (see
 * ai-summary.ts) already uses low/medium/high for a per-proposal, model-written
 * rating, and both can appear in one document. Distinct middle words make it
 * impossible to mistake a report-level governance risk for a proposal-level AI
 * rating.
 *
 * Same house discipline as the rest of org-report/: no DB access, no
 * `Date.now()`, everything pure and unit-testable except the one `chat()` call.
 */

import { chat } from '../../ai/openrouter';
import { formatNumber, formatPct, shortenAddress } from '@/lib/utils';
import { alertTypeCount, type AttentionAlert } from './attention-alerts';
import type { ScoreAttribution } from './score-attribution';
import type { UpcomingProposalItem } from './upcoming-quorum';
import type { WhaleContextItem } from './whale-context';
import { OWNER_LABEL, type Recommendation } from './recommendations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Report-level governance risk. See the VOCABULARY WARNING above: the middle
 * value is `elevated`, never `medium`.
 */
export type ReportRiskLevel = 'low' | 'elevated' | 'high';

/** Every condition the ladder can fire on, in canonical (display) order. */
export const RISK_DRIVER_CODES = [
  'decisive_whale_open_vote',
  'last_minute_swing',
  'multiple_quorum_at_risk',
  'severe_score_drop',
  'critical_alert',
  'quorum_at_risk',
  'coordinated_voting',
  'material_score_drop',
] as const;

export type RiskDriverCode = (typeof RISK_DRIVER_CODES)[number];

/**
 * One condition that fired, and the level it implies on its own.
 *
 * `detail` is mandatory and always carries the specific proposal / address /
 * number that triggered it. A bare "risk: high" with no reasons is not a
 * sellable artifact — it is an unsourced claim about a customer's governance.
 */
export interface RiskDriver {
  code: RiskDriverCode;
  level: Exclude<ReportRiskLevel, 'low'>;
  detail: string;
}

/** One thing that actually happened, with the weight that earned it a slot. */
export interface KeyEvent {
  /** Higher wins when trimming to `KEY_EVENT_LIMIT`. */
  weight: number;
  /**
   * Dedupe key. Two sources describing one fact (a `quorum_risk` alert and the
   * at-risk open vote it was raised for) share a key, so the report cannot
   * report the same event twice under two different phrasings.
   */
  key: string;
  text: string;
}

export interface ExecutiveSummaryCounts {
  openVotes: number;
  quorumAtRisk: number;
  actionableAlerts: number;
  criticalAlerts: number;
  whaleVotes: number;
  decisiveWhaleVotes: number;
  highPriorityActions: number;
}

/** The two Democracy Score endpoints, when the attribution could be stood behind. */
export interface ExecutiveSummaryScore {
  previous: number;
  current: number;
  delta: number;
}

/** Batch-1/2 outputs plus who the report is for. All sections optional. */
export interface ExecutiveSummaryInput {
  organizationName: string;
  daoName: string;
  weekOf: Date;
  upcoming?: readonly UpcomingProposalItem[];
  whales?: readonly WhaleContextItem[];
  alerts?: readonly AttentionAlert[];
  attribution?: ScoreAttribution | null;
  recommendations?: readonly Recommendation[];
}

export interface ExecutiveSummary {
  organizationName: string;
  daoName: string;
  /** `YYYY-MM-DD`. */
  weekOf: string;
  riskLevel: ReportRiskLevel;
  /** Every condition that fired, highest level first. Empty iff `riskLevel` is `low`. */
  drivers: RiskDriver[];
  /** 0–`KEY_EVENT_LIMIT` real events. Never padded to reach a target count. */
  keyEvents: KeyEvent[];
  counts: ExecutiveSummaryCounts;
  score: ExecutiveSummaryScore | null;
}

/**
 * The JSON handed to the model — and the ONLY thing `proseIsSafe` will accept
 * numbers from. Derived from `ExecutiveSummary` rather than being it, so the
 * guard checks against exactly the bytes the model was shown.
 */
export interface ExecutiveSummaryFacts {
  organization: string;
  dao: string;
  weekOf: string;
  riskLevel: ReportRiskLevel;
  riskDrivers: string[];
  /**
   * Serialised explicitly even though it is `riskDrivers.length`: an array
   * length is not a numeric token in the JSON, so without this a model that
   * wrote "two conditions fired" — true, and the deterministic prose says the
   * same thing — would be rejected by `proseIsSafe` for citing a number the
   * facts "don't contain".
   */
  riskDriverCount: number;
  keyEvents: string[];
  keyEventCount: number;
  counts: ExecutiveSummaryCounts;
  democracyScore: ExecutiveSummaryScore | null;
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Score move (points) at or below which the week is `high` on its own. Matches `SCORE_DROP_ALERT`. */
export const SEVERE_SCORE_DROP = -5;

/** Score move (points) at or below which the week is at least `elevated`. */
export const MATERIAL_SCORE_DROP = -2;

/** How many open votes short of quorum in their final stretch make the week `high`. */
export const MULTI_QUORUM_AT_RISK_MIN = 2;

/**
 * How many key events the MODEL is shown. Lower than `KEY_EVENT_LIMIT` on
 * purpose — see `summaryFacts`.
 */
export const PROSE_KEY_EVENT_LIMIT = 2;

/** Ceiling on key events. There is no floor — an empty week emits an empty list. */
export const KEY_EVENT_LIMIT = 5;

/** The count the selector aims for when enough real events exist. Never padded up to. */
export const KEY_EVENT_TARGET = 3;

/**
 * Longest model paragraph we will publish. The prompt asks for ~150 words;
 * 1200 characters is roughly 200, so anything past it is the model ignoring
 * the brief rather than a slightly wordy answer.
 */
export const MAX_PROSE_CHARS = 1200;

/** Shortest publishable paragraph. Below this it is a fragment, not a summary. */
export const MIN_PROSE_CHARS = 40;

const DECISIVE_WHALE_OPEN_WEIGHT = 110;
const CRITICAL_ALERT_WEIGHT = 100;
const QUORUM_AT_RISK_WEIGHT = 85;
const SWING_ALERT_WEIGHT = 80;
const COORDINATION_ALERT_WEIGHT = 75;
const DECISIVE_WHALE_CLOSED_WEIGHT = 70;
const SCORE_MOVE_WEIGHT = 65;
const OTHER_ALERT_WEIGHT = 50;
const LARGEST_WHALE_WEIGHT = 35;

/** Smallest Democracy Score move worth a key-event slot. Below this it is noise. */
const NOTABLE_SCORE_MOVE = 1;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function signed(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Same fallback as `choiceLabelAt` in whale-context.ts / upcoming-quorum.ts. */
function choiceLabelAt(choices: readonly string[], index: number): string {
  const raw = choices[index];
  return typeof raw === 'string' && raw.trim() !== '' ? raw : `choice ${index + 1}`;
}

/** Who the customer would actually name — same rule as `whaleName` in recommendations.ts. */
function whaleName(item: WhaleContextItem): string {
  if (item.delegate) return item.delegate.displayName;
  return item.voter ? shortenAddress(item.voter) : 'an unidentified address';
}

function openItems(
  items: readonly UpcomingProposalItem[],
): Extract<UpcomingProposalItem, { phase: 'open' }>[] {
  return items.filter(
    (i): i is Extract<UpcomingProposalItem, { phase: 'open' }> => i.phase === 'open',
  );
}

/** Open votes flagged `at_risk`, one entry per distinct proposal id. */
function atRiskOpenVotes(
  items: readonly UpcomingProposalItem[],
): { id: string; title: string; pct: number; timeLeft: string }[] {
  const out: { id: string; title: string; pct: number; timeLeft: string }[] = [];
  const seen = new Set<string>();
  for (const item of openItems(items)) {
    if (item.quorum.status !== 'at_risk') continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push({ id: item.id, title: item.title, pct: item.quorum.pct, timeLeft: item.timeLeft });
  }
  return out;
}

/**
 * A whale whose power is currently deciding a vote. `decisive` is
 * `assessDecisiveness`'s counterfactual verdict — never re-derived here.
 */
type DecisiveWhale = WhaleContextItem & {
  decisiveness: Extract<WhaleContextItem['decisiveness'], { status: 'decisive' | 'not_decisive' }>;
};

function decisiveWhales(items: readonly WhaleContextItem[]): DecisiveWhale[] {
  return items.filter((i): i is DecisiveWhale => i.decisiveness.status === 'decisive');
}

/** The score move, but only when the attribution reconciled and can be published. */
function scoreOf(attribution: ScoreAttribution | null | undefined): ExecutiveSummaryScore | null {
  if (!attribution || attribution.status !== 'attributed') return null;
  return {
    previous: attribution.previousScore,
    current: attribution.currentScore,
    delta: attribution.scoreDelta,
  };
}

// ---------------------------------------------------------------------------
// The risk ladder (deterministic)
// ---------------------------------------------------------------------------

/**
 * The whole ladder, in one place:
 *
 *   high     — a decisive whale on a still-open proposal
 *            | any last_minute_swing alert
 *            | MULTI_QUORUM_AT_RISK_MIN+ open votes at quorum_at_risk
 *            | Democracy Score move <= SEVERE_SCORE_DROP
 *   elevated — any critical alert
 *            | exactly one open vote at quorum_at_risk
 *            | any coordinated_voting alert
 *            | Democracy Score move <= MATERIAL_SCORE_DROP
 *   low      — none of the above fired
 *
 * EVERY condition that fired is returned, not just the winning one, and each
 * carries the specific proposal / address / figure that made it fire. The
 * risk level is then simply the highest level present.
 *
 * Two pairs are mutually exclusive by construction so the list never says the
 * same thing twice: the quorum drivers (`multiple_` above the threshold,
 * `quorum_at_risk` at exactly one) and the score drivers (`severe_` below
 * `SEVERE_SCORE_DROP`, `material_` otherwise).
 */
export function buildRiskDrivers(input: ExecutiveSummaryInput): RiskDriver[] {
  const alerts = input.alerts ?? [];
  const whales = input.whales ?? [];
  const upcoming = input.upcoming ?? [];
  const drivers: RiskDriver[] = [];

  // --- high -----------------------------------------------------------------

  const decisiveOnOpen = decisiveWhales(whales).filter((w) => w.proposalState === 'active');
  for (const w of decisiveOnOpen) {
    const v = w.decisiveness;
    const own = choiceLabelAt(w.choices, v.choiceIndex);
    const flipped = choiceLabelAt(w.choices, v.counterfactualLeaderIndex);
    drivers.push({
      code: 'decisive_whale_open_vote',
      level: 'high',
      detail: `${whaleName(w)} cast ${v.vpPct.toFixed(1)}% of votes cast (${formatNumber(v.vp)} VP) for "${own}" on the still-open "${w.proposalTitle ?? 'an active proposal'}" — removing that power flips the winner to "${flipped}".`,
    });
  }

  for (const alert of alerts.filter((a) => a.type === 'last_minute_swing')) {
    drivers.push({
      code: 'last_minute_swing',
      level: 'high',
      detail: `Late swing on "${alert.proposalTitle ?? alert.title}" — ${alert.participants}`,
    });
  }

  const atRisk = atRiskOpenVotes(upcoming);
  if (atRisk.length >= MULTI_QUORUM_AT_RISK_MIN) {
    drivers.push({
      code: 'multiple_quorum_at_risk',
      level: 'high',
      detail: `${plural(atRisk.length, 'open vote is', 'open votes are')} short of quorum in the final stretch: ${atRisk
        .map((i) => `"${i.title}" (${formatPct(i.pct, 0)} of quorum, ${i.timeLeft})`)
        .join(', ')}.`,
    });
  }

  const score = scoreOf(input.attribution);
  if (score && score.delta <= SEVERE_SCORE_DROP) {
    drivers.push({
      code: 'severe_score_drop',
      level: 'high',
      detail: `The Democracy Score moved ${signed(score.delta)} points (${score.previous.toFixed(2)} → ${score.current.toFixed(2)}), at or past the ${SEVERE_SCORE_DROP} severe-drop threshold.`,
    });
  }

  // --- elevated -------------------------------------------------------------

  const critical = alerts.filter((a) => a.severity === 'critical');
  if (critical.length > 0) {
    // Counts by type, NOT the titles. Listing every title here (as this did
    // until TODO-075) reprinted the alerts section verbatim inside the summary
    // — eight whale-vote headlines, then the same eight again a page later.
    // The alert titles are one scroll away and carry their own detail.
    const byType = new Map<string, number>();
    for (const a of critical) byType.set(a.type, (byType.get(a.type) ?? 0) + 1);
    const breakdown = [...byType.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([type, n]) => alertTypeCount(type, n))
      .join(', ');
    drivers.push({
      code: 'critical_alert',
      level: 'elevated',
      detail: `${plural(critical.length, 'critical alert', 'critical alerts')} fired this week (${breakdown}) — listed in full under "Alerts requiring attention".`,
    });
  }

  if (atRisk.length === 1) {
    const one = atRisk[0]!;
    drivers.push({
      code: 'quorum_at_risk',
      level: 'elevated',
      detail: `"${one.title}" is at ${formatPct(one.pct, 0)} of quorum with ${one.timeLeft} — short of quorum in the final stretch of its voting window.`,
    });
  }

  for (const alert of alerts.filter((a) => a.type === 'coordinated_voting')) {
    drivers.push({
      code: 'coordinated_voting',
      level: 'elevated',
      detail: `Coordinated voting on "${alert.proposalTitle ?? alert.title}" — ${alert.participants}`,
    });
  }

  if (score && score.delta <= MATERIAL_SCORE_DROP && score.delta > SEVERE_SCORE_DROP) {
    drivers.push({
      code: 'material_score_drop',
      level: 'elevated',
      detail: `The Democracy Score moved ${signed(score.delta)} points (${score.previous.toFixed(2)} → ${score.current.toFixed(2)}), past the ${MATERIAL_SCORE_DROP} material-drop threshold.`,
    });
  }

  // Canonical code order, which already puts every `high` condition first.
  return drivers.sort(
    (a, b) => RISK_DRIVER_CODES.indexOf(a.code) - RISK_DRIVER_CODES.indexOf(b.code),
  );
}

/** The highest level any driver implies. `low` exactly when nothing fired. */
export function riskLevelFromDrivers(drivers: readonly RiskDriver[]): ReportRiskLevel {
  if (drivers.some((d) => d.level === 'high')) return 'high';
  if (drivers.some((d) => d.level === 'elevated')) return 'elevated';
  return 'low';
}

// ---------------------------------------------------------------------------
// Key events (deterministic)
// ---------------------------------------------------------------------------

/**
 * The `KEY_EVENT_LIMIT` heaviest things that actually happened.
 *
 * Weights encode "what would a DAO ops team read first", and the dedupe key
 * makes two descriptions of one fact collapse to the richer one: a whale alert
 * and the whale-context item built from that same `alerts` row share the alert
 * id, and a `quorum_risk` alert shares its proposal title with the at-risk open
 * vote. Because dedupe runs after the sort, the surviving copy is always the
 * highest-weight (i.e. most specific) phrasing.
 *
 * Emits FEWER than `KEY_EVENT_TARGET` items when fewer than that happened.
 * Padding a quiet week with filler is how a report becomes unreadable, and in
 * a paid artifact it is also a small lie about how eventful the week was.
 */
export function buildKeyEvents(input: ExecutiveSummaryInput): KeyEvent[] {
  const alerts = input.alerts ?? [];
  const whales = input.whales ?? [];
  const upcoming = input.upcoming ?? [];
  const candidates: KeyEvent[] = [];

  for (const w of decisiveWhales(whales)) {
    const v = w.decisiveness;
    const open = w.proposalState === 'active';
    const own = choiceLabelAt(w.choices, v.choiceIndex);
    const leader = choiceLabelAt(w.choices, v.leaderIndex);
    const flipped = choiceLabelAt(w.choices, v.counterfactualLeaderIndex);
    candidates.push({
      weight: open ? DECISIVE_WHALE_OPEN_WEIGHT : DECISIVE_WHALE_CLOSED_WEIGHT,
      key: `whale:${w.alertId}`,
      text: `${whaleName(w)} cast ${v.vpPct.toFixed(1)}% of votes cast for "${own}" on ${
        open ? 'the still-open' : 'the closed'
      } "${w.proposalTitle ?? 'a proposal'}"; without that power the winner is "${flipped}" rather than "${leader}".`,
    });
  }

  for (const item of atRiskOpenVotes(upcoming)) {
    candidates.push({
      weight: QUORUM_AT_RISK_WEIGHT,
      key: `quorum:${item.title}`,
      // `timeLeft` already reads "3d left" — don't append another "left".
      text: `"${item.title}" is at ${formatPct(item.pct, 0)} of quorum with ${item.timeLeft} in its voting window.`,
    });
  }

  for (const alert of alerts) {
    // Keyed to line up with whichever richer item may describe the same fact.
    const key =
      alert.type === 'whale_vote'
        ? `whale:${alert.id}`
        : alert.type === 'quorum_risk' && alert.proposalTitle
          ? `quorum:${alert.proposalTitle}`
          : `alert:${alert.id}`;

    const weight =
      alert.severity === 'critical'
        ? CRITICAL_ALERT_WEIGHT
        : alert.type === 'last_minute_swing'
          ? SWING_ALERT_WEIGHT
          : alert.type === 'coordinated_voting'
            ? COORDINATION_ALERT_WEIGHT
            : OTHER_ALERT_WEIGHT;

    candidates.push({
      weight,
      key,
      text: `${alert.title}${alert.proposalTitle && !alert.title.includes(alert.proposalTitle) ? ` on "${alert.proposalTitle}"` : ''} — ${alert.participants}`,
    });
  }

  const score = scoreOf(input.attribution);
  if (score && Math.abs(score.delta) >= NOTABLE_SCORE_MOVE) {
    const top =
      input.attribution?.status === 'attributed' ? input.attribution.drivers[0] : undefined;
    candidates.push({
      weight: SCORE_MOVE_WEIGHT,
      key: 'score',
      text: `The Democracy Score moved ${signed(score.delta)} points, ${score.previous.toFixed(2)} → ${score.current.toFixed(2)}${
        top ? `, driven mostly by ${top.label} (${signed(top.contribution)})` : ''
      }.`,
    });
  }

  // The single largest whale vote that was NOT decisive — a real, reportable
  // event ("the biggest holder who voted this week") rather than filler, and
  // capped at one so a whale-heavy week can't crowd out everything else.
  const largest = whales
    .filter((w) => w.decisiveness.status !== 'decisive' && w.vpPctOfScores !== null)
    .sort((a, b) => (b.vpPctOfScores ?? 0) - (a.vpPctOfScores ?? 0))[0];
  if (largest && largest.vpPctOfScores !== null) {
    candidates.push({
      weight: LARGEST_WHALE_WEIGHT,
      key: `whale:${largest.alertId}`,
      text: `Largest single whale vote of the week: ${whaleName(largest)} cast ${largest.vpPctOfScores.toFixed(1)}% of votes cast on "${largest.proposalTitle ?? 'a proposal'}" — not decisive to the outcome.`,
    });
  }

  const ordered = candidates
    .map((event, index) => ({ event, index }))
    // Index tiebreak so identical weights order by construction, never by the
    // order Postgres happened to return rows in.
    .sort((a, b) => b.event.weight - a.event.weight || a.index - b.index)
    .map(({ event }) => event);

  const seen = new Set<string>();
  const deduped: KeyEvent[] = [];
  for (const event of ordered) {
    if (seen.has(event.key)) continue;
    seen.add(event.key);
    deduped.push(event);
  }

  return deduped.slice(0, KEY_EVENT_LIMIT);
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

function countAll(input: ExecutiveSummaryInput): ExecutiveSummaryCounts {
  const alerts = input.alerts ?? [];
  const whales = input.whales ?? [];
  return {
    openVotes: openItems(input.upcoming ?? []).length,
    quorumAtRisk: atRiskOpenVotes(input.upcoming ?? []).length,
    actionableAlerts: alerts.length,
    criticalAlerts: alerts.filter((a) => a.severity === 'critical').length,
    whaleVotes: whales.length,
    decisiveWhaleVotes: decisiveWhales(whales).length,
    highPriorityActions: (input.recommendations ?? []).filter((r) => r.priority === 'high').length,
  };
}

/** Pure. Identical input always yields an identical summary. */
export function buildExecutiveSummary(input: ExecutiveSummaryInput): ExecutiveSummary {
  const drivers = buildRiskDrivers(input);
  return {
    organizationName: input.organizationName,
    daoName: input.daoName,
    weekOf: isoDay(input.weekOf),
    riskLevel: riskLevelFromDrivers(drivers),
    drivers,
    keyEvents: buildKeyEvents(input),
    counts: countAll(input),
    score: scoreOf(input.attribution),
  };
}

/** The exact fact set the model is shown — and the only source of legal numbers. */
export function summaryFacts(summary: ExecutiveSummary): ExecutiveSummaryFacts {
  return {
    organization: summary.organizationName,
    dao: summary.daoName,
    weekOf: summary.weekOf,
    riskLevel: summary.riskLevel,
    riskDrivers: summary.drivers.map((d) => d.detail),
    riskDriverCount: summary.drivers.length,
    // Capped (TODO-075). The model is asked to summarise, but handed five
    // fully-formed event sentences it reliably enumerates them instead — and
    // every one of those sentences is printed again, in more detail, in the
    // alerts section below. Capping what it is SHOWN is the structural fix:
    // `proseIsSafe` rejects any prose citing a number the facts do not contain,
    // so the model cannot list events it was never given.
    keyEvents: summary.keyEvents.slice(0, PROSE_KEY_EVENT_LIMIT).map((e) => e.text),
    // The true count, not the truncated one — the model may legitimately say
    // how many events there were without listing them.
    keyEventCount: summary.keyEvents.length,
    counts: summary.counts,
    democracyScore: summary.score,
  };
}

// ---------------------------------------------------------------------------
// Deterministic prose — the thing we publish unless the model beats it safely
// ---------------------------------------------------------------------------

const RISK_SENTENCE: Record<ReportRiskLevel, string> = {
  high: 'Governance risk is HIGH this week',
  elevated: 'Governance risk is ELEVATED this week',
  low: 'Governance risk is LOW this week',
};

/**
 * The publishable fallback, and the baseline the model has to beat. Plain, a
 * little dry, and correct by construction — every figure is read straight off
 * the summary.
 */
export function renderDeterministicSummary(summary: ExecutiveSummary): string {
  const c = summary.counts;
  const sentences: string[] = [];

  const reason =
    summary.drivers.length > 0
      ? `: ${plural(summary.drivers.length, 'condition', 'conditions')} fired on ${summary.daoName}`
      : ` for ${summary.daoName} — no risk condition fired`;
  sentences.push(`${RISK_SENTENCE[summary.riskLevel]}${reason}.`);

  sentences.push(
    `We reviewed ${plural(c.openVotes, 'open vote', 'open votes')}, ${plural(
      c.actionableAlerts,
      'actionable alert',
      'actionable alerts',
    )} and ${plural(c.whaleVotes, 'whale vote', 'whale votes')} for the week ending ${summary.weekOf}.`,
  );

  if (c.quorumAtRisk > 0) {
    sentences.push(
      `${plural(c.quorumAtRisk, 'open vote is', 'open votes are')} short of quorum in the final stretch of the voting window.`,
    );
  }
  if (c.decisiveWhaleVotes > 0) {
    sentences.push(
      `${plural(c.decisiveWhaleVotes, 'whale vote', 'whale votes')} would have changed an outcome if removed.`,
    );
  }
  if (summary.score) {
    sentences.push(
      `The Democracy Score moved ${signed(summary.score.delta)} points to ${summary.score.current.toFixed(2)}.`,
    );
  }
  sentences.push(
    c.highPriorityActions > 0
      ? `${plural(c.highPriorityActions, 'recommended action is', 'recommended actions are')} high priority and time-boxed to a vote that is still open.`
      : 'No recommended action below is time-boxed to a vote that is still open.',
  );

  return sentences.join(' ');
}

// ---------------------------------------------------------------------------
// The guard — the entire reason an LLM is allowed near this section
// ---------------------------------------------------------------------------

/** Any run of digits, optionally with thousands separators / a decimal part. */
const NUMERIC_TOKEN_RE = /\d+(?:[.,]\d+)*/g;

/**
 * `1,234` and `1234` and `1234.00` all normalise to `1234`, so the guard is
 * about the VALUE the model asserted, not the way it typed it. Anything that
 * doesn't parse falls back to the raw token.
 */
function normaliseNumeric(token: string): string {
  const n = Number(token.replace(/,/g, ''));
  return Number.isFinite(n) ? String(n) : token;
}

function numericTokens(text: string): string[] {
  return (text.match(NUMERIC_TOKEN_RE) ?? []).map(normaliseNumeric);
}

/**
 * May this model output be published in place of the deterministic text?
 *
 * Pure and exported so the rules are unit-testable in isolation — this
 * function, not the prompt, is what makes an LLM acceptable in a paid
 * artifact. It rejects when the output is:
 *
 *   1. empty or whitespace only;
 *   2. shorter than `MIN_PROSE_CHARS` (a fragment, not a summary);
 *   3. longer than `MAX_PROSE_CHARS` (the model ignored the brief);
 *   4. structural markdown — a heading or a code fence, which would break out
 *      of the section the prose is embedded in;
 *   5. carrying ANY numeric token that does not appear in the serialised facts.
 *
 * Rule 5 is the important one. It cannot catch a hallucinated *name* or a
 * fabricated causal claim, and it is not sold as doing so — but every concrete
 * assertion in this domain (a percentage, a score, a count, a date) is a
 * number, and a number the model invented is exactly the failure mode that
 * would make this document unsafe to sell. On any rejection we ship the
 * deterministic prose, which is the correct failure mode: strictly less
 * elegant, never wrong.
 */
export function proseIsSafe(prose: string, facts: ExecutiveSummaryFacts | string): boolean {
  if (typeof prose !== 'string') return false;
  const trimmed = prose.trim();
  if (trimmed === '') return false;
  if (trimmed.length < MIN_PROSE_CHARS) return false;
  if (trimmed.length > MAX_PROSE_CHARS) return false;
  if (trimmed.includes('```')) return false;
  if (trimmed.split('\n').some((line) => line.trimStart().startsWith('#'))) return false;

  const serialised = typeof facts === 'string' ? facts : JSON.stringify(facts);
  const allowed = new Set(numericTokens(serialised));
  return numericTokens(trimmed).every((token) => allowed.has(token));
}

// ---------------------------------------------------------------------------
// The one AI call
// ---------------------------------------------------------------------------

export const EXECUTIVE_SUMMARY_SYSTEM_PROMPT = `You are writing the opening paragraph of a paid weekly DAO governance report.

You will be given a JSON object of facts that have ALREADY been verified and will already be printed, in full, elsewhere in the same report. Rewrite them as a short executive summary.

Rules:
- 3-5 sentences, under 150 words, one paragraph.
- You may NOT introduce any number, name, date, percentage or claim that is not present in the JSON. Every figure you write must appear in the JSON exactly.
- Do not speculate about how a vote will end, do not forecast, do not estimate a probability.
- Do not add advice; the report has its own recommendations section.
- No headings, no bullet points, no markdown formatting, no code fences.
- Plain, factual, unhurried. State the risk level and why, then what happened.
- Do NOT enumerate the events one by one. They are listed in full further down the report; your job is to characterise the week, not to repeat the list.`;

export interface ExecutiveSummaryProseOptions {
  /**
   * `false` forces the deterministic text and makes no network call. Exposed
   * so callers and tests can pin the report to a byte-reproducible output.
   */
  useAi?: boolean;
}

/**
 * Deterministic-first: the fallback is computed and held, the model is asked
 * for a nicer phrasing, and its answer is used ONLY if `proseIsSafe` clears it.
 *
 * `r?.text` is the truthiness check, not `!r` — `chat()` resolves to
 * `{ text: '' }` on a successful-but-empty completion (see
 * src/server/ai/openrouter.ts), and `!r` would happily publish that empty
 * string as the executive summary of a $750 report.
 */
export async function writeExecutiveSummaryProse(
  summary: ExecutiveSummary,
  opts: ExecutiveSummaryProseOptions = {},
): Promise<string> {
  const prose = renderDeterministicSummary(summary);
  if (opts.useAi === false) return prose;

  const facts = summaryFacts(summary);
  const r = await chat({
    maxTokens: 500,
    temperature: 0.2,
    messages: [
      { role: 'system', content: EXECUTIVE_SUMMARY_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(facts, null, 2) },
    ],
  });

  if (r?.text && proseIsSafe(r.text, facts)) return r.text.trim();
  return prose;
}

// ---------------------------------------------------------------------------
// Markdown (pure)
// ---------------------------------------------------------------------------

const RISK_MARKERS: Record<ReportRiskLevel, string> = {
  high: '🔴',
  elevated: '🟠',
  low: '🟢',
};

const SECTION_HEADER = '\n\n## 🧭 Executive summary';

/**
 * States what was checked, so `low` reads as a finding rather than as a
 * section that failed to render.
 */
const NO_DRIVERS = `No risk condition fired: no whale vote is currently deciding an open proposal, no leading choice flipped late in a voting window, no critical or coordinated-voting alert was raised, no open vote is short of quorum in its final stretch, and the Democracy Score did not fall ${Math.abs(MATERIAL_SCORE_DROP)} points or more.`;

/**
 * Pure markdown, in the `## ` emoji-header / `- **bold**` style of the other
 * sections and with the same leading `\n\n` so it concatenates onto a body.
 *
 * Unlike every other section this one NEVER returns `''`. A report whose
 * executive summary is missing is a report the customer cannot use at all, and
 * the quiet-week case is a real answer ("nothing fired, here is what we
 * checked"), not an absence.
 */
export function formatExecutiveSummarySection(summary: ExecutiveSummary, prose: string): string {
  const marker = RISK_MARKERS[summary.riskLevel];
  const level = summary.riskLevel.toUpperCase();

  const lines = [
    SECTION_HEADER,
    `**${marker} Governance risk: ${level}** — computed by a fixed rule from the sections below, not written by a model. This scale (low / elevated / high) is separate from the low / medium / high AI risk rating shown on individual proposals.`,
    '',
    prose.trim(),
    '',
    '**Why this level:**',
    summary.drivers.length > 0
      ? summary.drivers
          // The internal `RiskDriverCode` used to lead this line. It is our enum
          // member, not a word the customer knows, and the detail that follows
          // already says what fired — so the code is dropped from the rendered
          // text and kept on the object for the CSV and API surfaces.
          .map((d) => `- **${d.level[0].toUpperCase()}${d.level.slice(1)}** — ${d.detail}`)
          .join('\n')
      : `- ${NO_DRIVERS}`,
  ];

  // "Key events" used to be listed here. It was removed in TODO-075: every
  // entry was a restatement of an alert printed in full a page later, and the
  // at-a-glance table now carries the same job with an action attached.
  // `summary.keyEvents` is still computed — `buildAtAGlanceRows` ranks by it.
  return lines.join('\n');
}

/** Cap on the at-a-glance table. Three is what fits on one screen and in one head. */
export const AT_A_GLANCE_LIMIT = 3;

/** Escapes the one character that would break out of a markdown table cell. */
function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

/**
 * The table the report opens with (TODO-076): risk, what it is about, when it
 * expires, who should pick it up, and what to do.
 *
 * Rows come from the recommendations rather than from `keyEvents`, because a
 * row without an action is a headline, and the customer asked for something
 * they can work from. The recommendation list is already sorted by priority
 * then deadline, so taking the first N takes the most urgent N.
 *
 * Fewer than `AT_A_GLANCE_LIMIT` real rows means fewer rows. Nothing is padded
 * to fill the table — the entire report is built on not inventing content, and
 * a table is the most authoritative-looking place to break that rule.
 */
export function formatAtAGlanceSection(
  summary: ExecutiveSummary,
  recommendations: readonly Recommendation[],
): string {
  const marker = RISK_MARKERS[summary.riskLevel];
  // Leads with `\n\n` like every other section formatter, so
  // `composeOrgReportBody` can concatenate the sections with a bare join.
  const heading = `\n\n## ⚡ At a glance\n\n**${marker} Governance risk: ${summary.riskLevel.toUpperCase()}** · week of ${summary.weekOf}`;

  const rows = recommendations
    .filter((r) => r.ruleId !== 'no_action_needed')
    .slice(0, AT_A_GLANCE_LIMIT);

  if (rows.length === 0) {
    return `${heading}\n\n_No action items this week. What was reviewed is listed under "Recommended actions"._`;
  }

  const body = rows
    .map((r) =>
      `| ${cell(r.riskLabel)} | ${cell(r.subjectLabel)} | ${
        r.deadline ? r.deadline.toISOString().slice(0, 10) : '—'
      } | ${cell(OWNER_LABEL[r.owner])} | ${cell(r.action)} |`,
    )
    .join('\n');

  return `${heading}\n\n| Risk | Affected | Deadline | Owner | Action |\n| --- | --- | --- | --- | --- |\n${body}`;
}
