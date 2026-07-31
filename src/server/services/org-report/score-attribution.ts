import { and, asc, desc, eq, lt, lte } from 'drizzle-orm';
import { db } from '../../db';
import { daos, scoreHistory } from '../../db/schema';
import { METRIC_HINT, METRIC_LABEL, SCORE_WEIGHTS } from '@/lib/constants';

// =============================================
// TODO-063: Democracy Score attribution
// =============================================
// The org weekly report already says "Uniswap: 71 → 64 (-7)" (formatFallback's
// score-movers section). A $750/30d customer needs the next sentence: WHICH of
// the five axes moved. That answer has been sitting in the DB the whole time —
// `score_history.breakdown` stores the full 5-metric snapshot on every
// recompute (see `recomputeAllDaoScores`) and nothing has ever read it. So this
// is a pure read of existing columns: no schema change, no migration.
//
// The decomposition is exact in principle — the score IS a weighted sum of the
// five metrics, so each metric's share of the move is
//   (current[m] - previous[m]) * SCORE_WEIGHTS[m]
// — but NOT exact in the stored data: `computeScoreForDao` rounds each metric
// to 2dp and then rounds the final score to 2dp independently, so the shares
// reconcile to the stored score delta only up to a small rounding residual.
// This module therefore checks the residual instead of assuming it away, and
// refuses to print a decomposition that visibly doesn't add up. Likewise a
// metric present in only one of the two snapshots degrades the whole result:
// a missing metric silently treated as 0 would report a swing that never
// happened. For a paid product, "attribution unavailable for this period" is
// the correct output whenever the numbers can't be stood behind.

/** The five Democracy Score axes, keyed exactly as `ScoreBreakdown`. */
export type ScoreMetric = keyof typeof SCORE_WEIGHTS;

/** Canonical metric order — also the deterministic tie-break for ranking. */
export const SCORE_METRICS = Object.keys(SCORE_WEIGHTS) as ScoreMetric[];

/**
 * Slack allowed between the stored score delta and the sum of the per-metric
 * contributions. Both sides are independently rounded to 2dp by
 * `computeScoreForDao`, so a residual of a few hundredths is expected and
 * harmless. Anything larger means the two snapshots aren't the weighted-sum
 * pair we think they are (a weight change, a hand-edited row, a partial
 * write) and the decomposition must not be published.
 */
export const ATTRIBUTION_RESIDUAL_TOLERANCE = 0.1;

/** One scored point in time — a `score_history` row, or the `daos` fallback. */
export interface ScoreSnapshot {
  score: number;
  breakdown: Record<string, number> | null;
  computedAt: Date;
}

/** One metric's share of the score move between the two snapshots. */
export interface MetricContribution {
  metric: ScoreMetric;
  /** Display name, from the shared `METRIC_LABEL`. */
  label: string;
  /** "Why this metric matters" methodology line, from the shared `METRIC_HINT`. */
  hint: string;
  previous: number;
  current: number;
  /** Raw 0–100 metric move. */
  delta: number;
  /** `delta * SCORE_WEIGHTS[metric]` — this metric's share of the score move. */
  contribution: number;
}

/**
 * The two snapshots actually compared. Reported verbatim rather than described
 * as "last week": `recomputeAllDaoScores` runs on cron, and if cron slips the
 * nominal 7-day baseline is quietly 13 days old. The report states the real
 * date and the real gap.
 */
export interface AttributionPeriod {
  currentComputedAt: Date;
  baselineComputedAt: Date;
  /** Real gap between the two snapshots in days, 1dp. */
  ageDays: number;
  /** False when no snapshot was old enough and we fell back to the earliest one. */
  coversFullWeek: boolean;
}

export interface AttributedScoreChange {
  status: 'attributed';
  period: AttributionPeriod;
  previousScore: number;
  currentScore: number;
  /** The headline move: `currentScore - previousScore`. */
  scoreDelta: number;
  /** Σ `drivers[].contribution` — reconciles with `scoreDelta` up to `residual`. */
  attributedDelta: number;
  /** `scoreDelta - attributedDelta`; guaranteed ≤ `ATTRIBUTION_RESIDUAL_TOLERANCE`. */
  residual: number;
  /** All five metrics, ranked by |contribution| descending. */
  drivers: MetricContribution[];
}

export type AttributionUnavailableReason =
  /** The DAO has never been scored — no snapshot and no `daos.score_breakdown`. */
  | 'no_current_snapshot'
  /** A current score exists but carries no usable breakdown to decompose. */
  | 'no_current_breakdown'
  /** Only one snapshot exists (or no elapsed time between them). */
  | 'first_period'
  /** A metric is present in one snapshot but not the other — not attributable. */
  | 'metrics_missing'
  /** The contributions don't reconcile with the stored score delta. */
  | 'residual_exceeds_tolerance';

export interface AttributionUnavailable {
  status: 'unavailable';
  reason: AttributionUnavailableReason;
  /** Present whenever two snapshots were actually compared. */
  period?: AttributionPeriod;
  /** For `metrics_missing`: exactly which canonical keys couldn't be paired. */
  missingMetrics?: ScoreMetric[];
  /** For `residual_exceeds_tolerance`: the figures that failed to reconcile. */
  scoreDelta?: number;
  attributedDelta?: number;
  residual?: number;
}

export type ScoreAttribution = AttributedScoreChange | AttributionUnavailable;

/** 2-dp rounding, matching `democracy-score.ts`'s own `round`. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** jsonb is `Record<string, number>` by type only — validate before trusting. */
function readMetric(
  breakdown: Record<string, number> | null | undefined,
  metric: ScoreMetric,
): number | null {
  const raw = breakdown?.[metric];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/**
 * Pure attribution math over two comparable snapshots. No DB access —
 * `fetchScoreAttribution` supplies both sides.
 *
 * `previous === null` (only one snapshot exists) returns `first_period` rather
 * than differencing against zeros, which would invent a full-score swing out
 * of nothing.
 */
export function attributeScoreChange(
  current: ScoreSnapshot | null | undefined,
  previous: ScoreSnapshot | null | undefined,
): ScoreAttribution {
  if (!current) return { status: 'unavailable', reason: 'no_current_snapshot' };
  if (!current.breakdown || Object.keys(current.breakdown).length === 0) {
    return { status: 'unavailable', reason: 'no_current_breakdown' };
  }
  if (!previous) return { status: 'unavailable', reason: 'first_period' };

  const elapsedMs = current.computedAt.getTime() - previous.computedAt.getTime();
  // Same instant (or a clock/ordering anomaly) means there is no period to
  // attribute — treat it exactly like having a single snapshot.
  if (!(elapsedMs > 0)) return { status: 'unavailable', reason: 'first_period' };

  const period: AttributionPeriod = {
    currentComputedAt: current.computedAt,
    baselineComputedAt: previous.computedAt,
    ageDays: Math.round((elapsedMs / 86400_000) * 10) / 10,
    coversFullWeek: elapsedMs >= 7 * 86400_000,
  };

  // Pair up the metrics first, because the weight each one carries depends on
  // how many of them there are. `computeScoreForDao` omits an axis it could
  // not measure (TODO-090) and renormalises the rest, so the score is
  // Σ(value × weight) / Σ(weight over PRESENT metrics). The same divisor has
  // to be applied here or the contributions cannot reconcile with the delta
  // they are supposed to explain.
  const paired: Array<{ metric: ScoreMetric; cur: number; prev: number }> = [];
  const missingMetrics: ScoreMetric[] = [];

  for (const metric of SCORE_METRICS) {
    const cur = readMetric(current.breakdown, metric);
    const prev = readMetric(previous.breakdown, metric);
    if (cur !== null && prev !== null) {
      paired.push({ metric, cur, prev });
      continue;
    }
    // Absent from BOTH snapshots is not a hole — the axis simply did not
    // contribute to either score, so the remaining four still decompose the
    // move exactly. Only present-on-one-side breaks reconciliation, because
    // then the two scores were built from different axis sets.
    if (cur !== null || prev !== null) missingMetrics.push(metric);
  }

  const weightSum = paired.reduce((sum, p) => sum + SCORE_WEIGHTS[p.metric], 0);

  const drivers: MetricContribution[] = paired.map(({ metric, cur, prev }) => {
    const delta = round(cur - prev);
    return {
      metric,
      label: METRIC_LABEL[metric] ?? metric,
      hint: METRIC_HINT[metric] ?? '',
      previous: prev,
      current: cur,
      delta,
      // Round the contribution itself so the published bullets sum to the
      // published total instead of to a hidden higher-precision figure.
      contribution: round((delta * SCORE_WEIGHTS[metric]) / weightSum),
    };
  });

  // A partial decomposition can't be reconciled against the score delta, so it
  // can't be trusted — degrade, naming the keys, rather than quietly dropping
  // (or zeroing) an axis in a customer-facing explanation.
  if (missingMetrics.length > 0) {
    return { status: 'unavailable', reason: 'metrics_missing', period, missingMetrics };
  }

  // Every axis unmeasurable on both sides: there is no decomposition to give,
  // and dividing by zero below would produce NaN contributions.
  if (paired.length === 0) {
    return { status: 'unavailable', reason: 'no_current_breakdown', period };
  }

  const scoreDelta = round(current.score - previous.score);
  const attributedDelta = round(drivers.reduce((sum, d) => sum + d.contribution, 0));
  const residual = round(scoreDelta - attributedDelta);

  if (Math.abs(residual) > ATTRIBUTION_RESIDUAL_TOLERANCE) {
    return {
      status: 'unavailable',
      reason: 'residual_exceeds_tolerance',
      period,
      scoreDelta,
      attributedDelta,
      residual,
    };
  }

  // Biggest mover first; canonical order breaks ties so output is stable.
  drivers.sort((a, b) => {
    const byMagnitude = Math.abs(b.contribution) - Math.abs(a.contribution);
    if (byMagnitude !== 0) return byMagnitude;
    return SCORE_METRICS.indexOf(a.metric) - SCORE_METRICS.indexOf(b.metric);
  });

  return {
    status: 'attributed',
    period,
    previousScore: previous.score,
    currentScore: current.score,
    scoreDelta,
    attributedDelta,
    residual,
    drivers,
  };
}

const SNAPSHOT_COLUMNS = {
  score: scoreHistory.score,
  breakdown: scoreHistory.breakdown,
  computedAt: scoreHistory.computedAt,
};

/** `score` is `numeric(5,2)` — postgres-js hands it back as a string. */
function toSnapshot(row: {
  score: string;
  breakdown: Record<string, number>;
  computedAt: Date;
}): ScoreSnapshot {
  return { score: Number(row.score), breakdown: row.breakdown, computedAt: row.computedAt };
}

/**
 * Last-resort "current" side for a DAO that has been scored but has no
 * `score_history` row yet (e.g. seeded data). Only ever produces a
 * `first_period` result, since without history there is nothing to diff.
 */
async function fetchDaoSnapshot(daoId: string, at: Date): Promise<ScoreSnapshot | null> {
  const [dao] = await db
    .select({
      score: daos.democracyScore,
      breakdown: daos.scoreBreakdown,
      updatedAt: daos.scoreUpdatedAt,
    })
    .from(daos)
    .where(eq(daos.id, daoId))
    .limit(1);
  if (!dao || dao.score == null) return null;
  return {
    score: Number(dao.score),
    breakdown: dao.breakdown ?? null,
    computedAt: dao.updatedAt ?? at,
  };
}

/**
 * Loads two comparable Democracy Score snapshots for `daoId` and attributes
 * the move between them.
 *
 * BOTH sides come from `score_history` so the diff is between two rows written
 * by the same code path with the same rounding — `daos.score_breakdown` is a
 * fallback for the current side only, used when the DAO has no history row at
 * all. (`daos.score_breakdown` and the newest history row are written in the
 * same `recomputeAllDaoScores` pass, so this costs nothing in freshness.)
 *
 * The baseline predicate mirrors `gatherDigestData`'s `scoreMovers` subquery —
 * `computed_at <= weekAgo ORDER BY computed_at DESC LIMIT 1` — so the
 * attribution explains the same period the report's score-movers line prints.
 * Expressed as plain Drizzle rather than raw SQL since this is a single-DAO
 * lookup. When cron has slipped and nothing is that old, it falls back to the
 * EARLIEST available snapshot and flags `coversFullWeek: false`; the real
 * gap is always reported rather than assumed to be seven days.
 */
export async function fetchScoreAttribution(
  daoId: string,
  weekOf = new Date(),
): Promise<ScoreAttribution> {
  const weekAgo = new Date(weekOf.getTime() - 7 * 86400_000);

  const [latest] = await db
    .select(SNAPSHOT_COLUMNS)
    .from(scoreHistory)
    .where(eq(scoreHistory.daoId, daoId))
    .orderBy(desc(scoreHistory.computedAt))
    .limit(1);

  if (!latest) {
    // No history at all — best we can do is confirm the DAO is scored and say
    // deltas start next period.
    return attributeScoreChange(await fetchDaoSnapshot(daoId, weekOf), null);
  }
  const current = toSnapshot(latest);

  const [baseline] = await db
    .select(SNAPSHOT_COLUMNS)
    .from(scoreHistory)
    .where(
      and(
        eq(scoreHistory.daoId, daoId),
        lte(scoreHistory.computedAt, weekAgo),
        lt(scoreHistory.computedAt, current.computedAt),
      ),
    )
    .orderBy(desc(scoreHistory.computedAt))
    .limit(1);

  if (baseline) return attributeScoreChange(current, toSnapshot(baseline));

  const [earliest] = await db
    .select(SNAPSHOT_COLUMNS)
    .from(scoreHistory)
    .where(and(eq(scoreHistory.daoId, daoId), lt(scoreHistory.computedAt, current.computedAt)))
    .orderBy(asc(scoreHistory.computedAt))
    .limit(1);

  return attributeScoreChange(current, earliest ? toSnapshot(earliest) : null);
}

/**
 * Whether any metric moved by more than the rounding this module already
 * declares it tolerates.
 *
 * `ATTRIBUTION_RESIDUAL_TOLERANCE` exists because both sides of the arithmetic
 * are independently rounded to 2dp, so a discrepancy that small carries no
 * information. A CONTRIBUTION that small carries none either — reporting it as
 * a driver is presenting the rounding as a finding.
 *
 * Deliberately reuses that constant rather than introducing a second threshold:
 * two numbers that both mean "below this is noise" would eventually disagree.
 * Exactly at the tolerance still counts as rounding; only above it is a result.
 */
export function hasMaterialContribution(drivers: readonly MetricContribution[]): boolean {
  return drivers.some((d) => Math.abs(d.contribution) > ATTRIBUTION_RESIDUAL_TOLERANCE);
}

/** `+1.25` / `-3.50` — an explicit sign on every figure; deltas read better. */
function signed(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "7 days" / "13.5 days" / "1 day" — the real gap, never rounded to "a week". */
function formatGap(ageDays: number): string {
  const n = Number.isInteger(ageDays) ? String(ageDays) : ageDays.toFixed(1);
  return `${n} ${ageDays === 1 ? 'day' : 'days'}`;
}

const SECTION_HEADER = '\n\n## 🔍 What moved the Democracy Score';

/** Every degraded path says the same plain thing, then why. */
const UNAVAILABLE = 'Metric-level attribution unavailable for this period';

/**
 * Pure markdown formatter, same discipline as `formatFallback` /
 * `formatCuratedNotesSection` in `digest-generator.ts`: a leading blank-line
 * gap, an emoji `## ` header, and `- **bold**` bullets, so it can be
 * concatenated onto the report body.
 *
 * Returns `''` only when there is genuinely nothing to report (the DAO has no
 * usable current score). Every other degraded case renders an explicit note —
 * a customer paying for explanation is owed "we can't attribute this" over
 * silence, and over numbers we can't stand behind.
 */
export function formatScoreAttributionSection(attribution: ScoreAttribution): string {
  if (attribution.status === 'unavailable') {
    switch (attribution.reason) {
      case 'no_current_snapshot':
      case 'no_current_breakdown':
        return '';
      case 'first_period':
        return `${SECTION_HEADER}\n_First period scored — metric-level deltas begin next week._`;
      case 'metrics_missing': {
        const names = (attribution.missingMetrics ?? []).map((m) => METRIC_LABEL[m] ?? m).join(', ');
        return `${SECTION_HEADER}\n_${UNAVAILABLE} — ${names} ${(attribution.missingMetrics ?? []).length === 1 ? 'is' : 'are'} missing from one of the two snapshots._`;
      }
      case 'residual_exceeds_tolerance':
        return `${SECTION_HEADER}\n_${UNAVAILABLE} — the per-metric contributions (${signed(attribution.attributedDelta ?? 0)}) do not reconcile with the ${signed(attribution.scoreDelta ?? 0)} score move._`;
    }
  }

  const { period, scoreDelta, residual, drivers } = attribution;
  const movers = drivers.filter((d) => d.contribution !== 0);
  const baseline = `the ${isoDay(period.baselineComputedAt)} snapshot, ${formatGap(period.ageDays)} earlier`;

  if (movers.length === 0) {
    return `${SECTION_HEADER}\n_Measured against ${baseline}: every metric held steady and the Democracy Score did not move._`;
  }

  // Nothing crossed the rounding this decomposition already tolerates, so
  // there is no finding here — only arithmetic noise. Say the move and stop,
  // rather than printing bullets of hundredths under a "Biggest driver"
  // headline complete with its methodology hint, which is what a live report
  // did for a +0.01 score move on a +0.02 contribution.
  //
  // Tested against the CONTRIBUTIONS, never the headline delta: two metrics
  // moving two points in opposite directions net to zero while genuinely
  // changing what the score is made of, and that is exactly what this section
  // exists to surface.
  if (!hasMaterialContribution(movers)) {
    return `${SECTION_HEADER}\n_Measured against ${baseline}: the Democracy Score moved ${signed(scoreDelta)} points. No metric moved by more than the ±${ATTRIBUTION_RESIDUAL_TOLERANCE} this decomposition treats as rounding, so there is nothing to attribute this period._`;
  }

  // Surface the residual rather than hiding it — it is small by construction
  // (both sides are rounded to 2dp) but the bullets should still visibly add up.
  const rounding = residual === 0 ? '' : ` (${signed(residual)} rounding)`;
  const lead = `_Measured against ${baseline}: the score moved ${signed(scoreDelta)} points. Each metric’s share below sums to that move${rounding}._`;

  const bullets = movers
    .map(
      (d) =>
        `- **${d.label}** — ${d.previous.toFixed(0)} → ${d.current.toFixed(0)} (${signed(d.delta)}), ${signed(d.contribution)} of the score`,
    )
    .join('\n');

  const top = movers[0];
  const why = top.hint ? `\n_Biggest driver: ${top.label}. ${top.hint}_` : '';

  const stale = period.coversFullWeek
    ? ''
    : `\n_Note: no snapshot a full week old was available, so this compares the closest one we have._`;

  return `${SECTION_HEADER}\n${lead}\n${bullets}${why}${stale}`;
}
