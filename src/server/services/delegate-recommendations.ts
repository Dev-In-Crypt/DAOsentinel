/**
 * Delegate recommendation scoring — see docs/specs/delegate-recommendation-engine.md.
 *
 * Pure aggregation of signals we already collect (Karma score, participation
 * rate, cross-DAO activity, response time). No new data source, no AI call.
 * Returns a 0-1 fraction; the UI layer (TODO-020) scales it for display and
 * must show the score breakdown — this is a transparent formula, not a
 * black-box ranking.
 */

export interface DelegateScoreInput {
  participationRate: number | null; // 0-1
  karmaScore: number | null; // 0-100
  totalDaosActive: number | null;
  avgResponseTimeHours: number | null;
}

interface WeightedComponent {
  value: number; // already normalized to 0-1
  weight: number;
}

const WEIGHTS = {
  participation: 0.4,
  karma: 0.3,
  daosActive: 0.15,
  responsiveness: 0.15,
} as const;

/**
 * Weighted score over available signals. Missing fields (null) are excluded
 * from both the numerator and the weight total — re-normalizing rather than
 * treating a missing signal as zero, so a delegate without a Karma profile
 * isn't penalized as if they scored 0 on it.
 */
export function scoreDelegate(d: DelegateScoreInput): number {
  const components: WeightedComponent[] = [];

  if (d.participationRate != null) {
    components.push({ value: clamp01(d.participationRate), weight: WEIGHTS.participation });
  }
  if (d.karmaScore != null) {
    components.push({ value: clamp01(d.karmaScore / 100), weight: WEIGHTS.karma });
  }
  if (d.totalDaosActive != null) {
    components.push({
      value: clamp01(Math.min(d.totalDaosActive, 10) / 10),
      weight: WEIGHTS.daosActive,
    });
  }
  if (d.avgResponseTimeHours != null) {
    // Lower hours → closer to 1. Never negative given a real hours value.
    const responsiveness = 1 / (1 + Math.max(d.avgResponseTimeHours, 0) / 24);
    components.push({ value: clamp01(responsiveness), weight: WEIGHTS.responsiveness });
  }

  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  if (totalWeight === 0) return 0;

  const weightedSum = components.reduce((s, c) => s + c.value * c.weight, 0);
  return weightedSum / totalWeight;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
