import { describe, it, expect } from 'vitest';
import {
  ATTRIBUTION_RESIDUAL_TOLERANCE,
  attributeScoreChange,
  formatScoreAttributionSection,
  SCORE_METRICS,
  type ScoreAttribution,
  type ScoreSnapshot,
} from '@/server/services/org-report/score-attribution';
import { SCORE_WEIGHTS } from '@/lib/constants';

/** Float tolerance for the "contributions sum to the total" invariant. */
const EPSILON = 1e-9;

const PREV_BREAKDOWN = {
  participation: 60,
  powerDistribution: 70,
  proposalDiversity: 80,
  delegateAccountability: 50,
  manipulationResistance: 90,
};

/** A realistic bad week: turnout collapses, whales creep in, the rest drifts. */
const CUR_BREAKDOWN = {
  participation: 42,
  powerDistribution: 66,
  proposalDiversity: 80,
  delegateAccountability: 55,
  manipulationResistance: 84,
};

/** The score is the weighted sum — build snapshots the way the DB stores them. */
function weightedScore(breakdown: Record<string, number>): number {
  const raw = SCORE_METRICS.reduce((s, m) => s + (breakdown[m] ?? 0) * SCORE_WEIGHTS[m], 0);
  return Math.round(raw * 100) / 100;
}

function snapshot(
  breakdown: Record<string, number> | null,
  computedAt: string,
  score?: number,
): ScoreSnapshot {
  return {
    score: score ?? weightedScore(breakdown ?? {}),
    breakdown,
    computedAt: new Date(computedAt),
  };
}

const PREVIOUS = snapshot(PREV_BREAKDOWN, '2026-07-21T00:00:00Z'); // score 70.00
const CURRENT = snapshot(CUR_BREAKDOWN, '2026-07-28T00:00:00Z'); // score 64.05

function attributed(a: ScoreAttribution) {
  if (a.status !== 'attributed') throw new Error(`expected attributed, got ${a.reason}`);
  return a;
}

function unavailable(a: ScoreAttribution) {
  if (a.status !== 'unavailable') throw new Error('expected unavailable');
  return a;
}

describe('attributeScoreChange', () => {
  it('computes each metric’s weighted contribution to the move', () => {
    const a = attributed(attributeScoreChange(CURRENT, PREVIOUS));

    const byMetric = new Map(a.drivers.map((d) => [d.metric, d]));
    expect(byMetric.get('participation')).toMatchObject({
      label: 'Voter participation',
      previous: 60,
      current: 42,
      delta: -18,
      contribution: -4.5, // -18 * 0.25
    });
    expect(byMetric.get('powerDistribution')?.contribution).toBe(-1); // -4 * 0.25
    expect(byMetric.get('proposalDiversity')?.contribution).toBe(0); // flat
    expect(byMetric.get('delegateAccountability')?.contribution).toBe(0.75); // +5 * 0.15
    expect(byMetric.get('manipulationResistance')?.contribution).toBe(-1.2); // -6 * 0.20
    expect(a.drivers).toHaveLength(5);
  });

  it('ranks drivers by absolute contribution, biggest first', () => {
    const a = attributed(attributeScoreChange(CURRENT, PREVIOUS));
    expect(a.drivers.map((d) => d.metric)).toEqual([
      'participation', // |-4.5|
      'manipulationResistance', // |-1.2|
      'powerDistribution', // |-1|
      'delegateAccountability', // |+0.75|
      'proposalDiversity', // 0
    ]);
  });

  it('carries the methodology hint through for each metric', () => {
    const a = attributed(attributeScoreChange(CURRENT, PREVIOUS));
    expect(a.drivers[0].hint).toContain('Avg voters per recent proposal');
  });

  it('INVARIANT: contributions sum exactly to the attributed delta', () => {
    const a = attributed(attributeScoreChange(CURRENT, PREVIOUS));
    const sum = a.drivers.reduce((s, d) => s + d.contribution, 0);
    expect(Math.abs(sum - a.attributedDelta)).toBeLessThan(EPSILON);
    expect(a.attributedDelta).toBe(-5.95); // -4.5 - 1.2 - 1 + 0.75 + 0
  });

  it('INVARIANT: attributed delta reconciles with the stored score delta', () => {
    const a = attributed(attributeScoreChange(CURRENT, PREVIOUS));
    expect(a.scoreDelta).toBe(-5.95);
    expect(a.residual).toBe(0);
    expect(Math.abs(a.residual)).toBeLessThanOrEqual(ATTRIBUTION_RESIDUAL_TOLERANCE);
  });

  it('INVARIANT holds for awkward fractional metric values too', () => {
    const prev = snapshot(
      {
        participation: 33.33,
        powerDistribution: 61.07,
        proposalDiversity: 12.5,
        delegateAccountability: 47.91,
        manipulationResistance: 88.88,
      },
      '2026-07-21T00:00:00Z',
    );
    const cur = snapshot(
      {
        participation: 41.67,
        powerDistribution: 58.93,
        proposalDiversity: 12.51,
        delegateAccountability: 50.09,
        manipulationResistance: 71.12,
      },
      '2026-07-28T00:00:00Z',
    );
    const a = attributed(attributeScoreChange(cur, prev));
    const sum = a.drivers.reduce((s, d) => s + d.contribution, 0);
    expect(Math.abs(sum - a.attributedDelta)).toBeLessThan(EPSILON);
    expect(Math.abs(a.residual)).toBeLessThanOrEqual(ATTRIBUTION_RESIDUAL_TOLERANCE);
  });

  it('tolerates the 2dp rounding residual the scorer actually produces', () => {
    // `computeScoreForDao` rounds the metrics AND the final score independently,
    // so a stored score can sit a hundredth off the weighted sum.
    const prev = snapshot(PREV_BREAKDOWN, '2026-07-21T00:00:00Z', 69.99);
    const cur = snapshot(CUR_BREAKDOWN, '2026-07-28T00:00:00Z', 64.06);
    const a = attributed(attributeScoreChange(cur, prev));
    expect(a.scoreDelta).toBe(-5.93);
    expect(a.attributedDelta).toBe(-5.95);
    expect(a.residual).toBe(0.02);
  });

  it('DEGRADES rather than publishing a decomposition that does not add up', () => {
    // Stored score claims a -9 move; the metrics only explain -5.95.
    const cur = snapshot(CUR_BREAKDOWN, '2026-07-28T00:00:00Z', 61);
    const u = unavailable(attributeScoreChange(cur, PREVIOUS));
    expect(u.reason).toBe('residual_exceeds_tolerance');
    expect(u.scoreDelta).toBe(-9);
    expect(u.attributedDelta).toBe(-5.95);
    expect(Math.abs(u.residual ?? 0)).toBeGreaterThan(ATTRIBUTION_RESIDUAL_TOLERANCE);
    expect(u).not.toHaveProperty('drivers');
  });

  it('reports first_period when there is no previous snapshot', () => {
    const a = attributeScoreChange(CURRENT, null);
    expect(a).toEqual({ status: 'unavailable', reason: 'first_period' });
    // Explicitly: no fabricated zero-baseline drivers.
    expect(a).not.toHaveProperty('drivers');
  });

  it('reports first_period when the two snapshots share a timestamp', () => {
    const same = snapshot(PREV_BREAKDOWN, '2026-07-28T00:00:00Z');
    expect(attributeScoreChange(CURRENT, same).status).toBe('unavailable');
    expect(unavailable(attributeScoreChange(CURRENT, same)).reason).toBe('first_period');
  });

  it('reports no_current_snapshot / no_current_breakdown when there is nothing to explain', () => {
    expect(attributeScoreChange(null, PREVIOUS)).toEqual({
      status: 'unavailable',
      reason: 'no_current_snapshot',
    });
    expect(attributeScoreChange(undefined, PREVIOUS)).toEqual({
      status: 'unavailable',
      reason: 'no_current_snapshot',
    });
    expect(attributeScoreChange(snapshot(null, '2026-07-28T00:00:00Z', 60), PREVIOUS)).toEqual({
      status: 'unavailable',
      reason: 'no_current_breakdown',
    });
    expect(attributeScoreChange(snapshot({}, '2026-07-28T00:00:00Z', 60), PREVIOUS).status).toBe(
      'unavailable',
    );
  });

  it('DEGRADES and names the keys when a metric is missing from one snapshot', () => {
    const { delegateAccountability: _drop, ...partial } = PREV_BREAKDOWN;
    const u = unavailable(attributeScoreChange(CURRENT, snapshot(partial, '2026-07-21T00:00:00Z')));
    expect(u.reason).toBe('metrics_missing');
    expect(u.missingMetrics).toEqual(['delegateAccountability']);
    // The missing metric is NOT treated as 0 — nothing is published at all.
    expect(u).not.toHaveProperty('drivers');
    expect(u.period?.ageDays).toBe(7);
  });

  it('DEGRADES when a metric is missing from the current snapshot', () => {
    const { participation: _drop, ...partial } = CUR_BREAKDOWN;
    const u = unavailable(attributeScoreChange(snapshot(partial, '2026-07-28T00:00:00Z'), PREVIOUS));
    expect(u.reason).toBe('metrics_missing');
    expect(u.missingMetrics).toEqual(['participation']);
  });

  it('ignores non-numeric jsonb values rather than coercing them', () => {
    const dirty = { ...CUR_BREAKDOWN, participation: 'n/a' } as unknown as Record<string, number>;
    const u = unavailable(attributeScoreChange(snapshot(dirty, '2026-07-28T00:00:00Z'), PREVIOUS));
    expect(u.reason).toBe('metrics_missing');
    expect(u.missingMetrics).toEqual(['participation']);
  });

  it('handles a zero-change week: every contribution is 0 and the total is 0', () => {
    const cur = snapshot(PREV_BREAKDOWN, '2026-07-28T00:00:00Z');
    const a = attributed(attributeScoreChange(cur, PREVIOUS));
    expect(a.scoreDelta).toBe(0);
    expect(a.attributedDelta).toBe(0);
    expect(a.residual).toBe(0);
    expect(a.drivers).toHaveLength(5);
    expect(a.drivers.every((d) => d.delta === 0 && d.contribution === 0)).toBe(true);
  });

  it('reports the baseline’s real age, not a nominal week', () => {
    const stale = snapshot(PREV_BREAKDOWN, '2026-07-15T00:00:00Z');
    const a = attributed(attributeScoreChange(CURRENT, stale));
    expect(a.period.ageDays).toBe(13);
    expect(a.period.baselineComputedAt.toISOString()).toBe('2026-07-15T00:00:00.000Z');
    expect(a.period.coversFullWeek).toBe(true);
  });

  it('flags a baseline that does not cover a full week', () => {
    const recent = snapshot(PREV_BREAKDOWN, '2026-07-26T12:00:00Z');
    const a = attributed(attributeScoreChange(CURRENT, recent));
    expect(a.period.ageDays).toBe(1.5);
    expect(a.period.coversFullWeek).toBe(false);
  });
});

describe('formatScoreAttributionSection', () => {
  it('renders a ranked markdown section naming the real baseline', () => {
    const md = formatScoreAttributionSection(attributeScoreChange(CURRENT, PREVIOUS));
    expect(md.startsWith('\n\n## 🔍 What moved the Democracy Score')).toBe(true);
    expect(md).toContain('_Measured against the 2026-07-21 snapshot, 7 days earlier:');
    expect(md).toContain('the score moved -5.95 points.');
    expect(md).toContain('- **Voter participation** — 60 → 42 (-18.00), -4.50 of the score');
    expect(md).toContain('- **Delegate accountability** — 50 → 55 (+5.00), +0.75 of the score');
    // Flat metrics are omitted from the bullets — nothing to say about them.
    expect(md).not.toContain('Proposal diversity');
    expect(md).toContain('_Biggest driver: Voter participation.');
  });

  it('states the actual gap when the baseline is older than a week', () => {
    const md = formatScoreAttributionSection(
      attributeScoreChange(CURRENT, snapshot(PREV_BREAKDOWN, '2026-07-15T00:00:00Z')),
    );
    expect(md).toContain('the 2026-07-15 snapshot, 13 days earlier');
    expect(md).not.toContain('last week');
  });

  it('warns when the baseline does not cover a full week', () => {
    const md = formatScoreAttributionSection(
      attributeScoreChange(CURRENT, snapshot(PREV_BREAKDOWN, '2026-07-26T12:00:00Z')),
    );
    expect(md).toContain('1.5 days earlier');
    expect(md).toContain('no snapshot a full week old was available');
  });

  it('surfaces a non-zero rounding residual instead of hiding it', () => {
    const cur = snapshot(CUR_BREAKDOWN, '2026-07-28T00:00:00Z', 64.04);
    const md = formatScoreAttributionSection(attributeScoreChange(cur, PREVIOUS));
    expect(md).toContain('(-0.01 rounding)');
  });

  it('says "first period scored" rather than inventing a delta', () => {
    const md = formatScoreAttributionSection(attributeScoreChange(CURRENT, null));
    expect(md).toContain('## 🔍 What moved the Democracy Score');
    expect(md).toContain('First period scored — metric-level deltas begin next week.');
    expect(md).not.toMatch(/[+-]\d/);
  });

  it('says attribution is unavailable when a metric is missing', () => {
    const { delegateAccountability: _drop, ...partial } = PREV_BREAKDOWN;
    const md = formatScoreAttributionSection(
      attributeScoreChange(CURRENT, snapshot(partial, '2026-07-21T00:00:00Z')),
    );
    expect(md).toContain(
      'Metric-level attribution unavailable for this period — Delegate accountability is missing from one of the two snapshots.',
    );
    expect(md).not.toContain('of the score');
  });

  it('says attribution is unavailable when the numbers do not reconcile', () => {
    const cur = snapshot(CUR_BREAKDOWN, '2026-07-28T00:00:00Z', 61);
    const md = formatScoreAttributionSection(attributeScoreChange(cur, PREVIOUS));
    expect(md).toContain('Metric-level attribution unavailable for this period');
    expect(md).toContain('(-5.95) do not reconcile with the -9.00 score move');
    expect(md).not.toContain('- **');
  });

  it('returns an empty string when there is nothing at all to report', () => {
    expect(formatScoreAttributionSection(attributeScoreChange(null, PREVIOUS))).toBe('');
    expect(
      formatScoreAttributionSection(
        attributeScoreChange(snapshot(null, '2026-07-28T00:00:00Z', 60), PREVIOUS),
      ),
    ).toBe('');
  });

  it('says so plainly on a zero-change week', () => {
    const md = formatScoreAttributionSection(
      attributeScoreChange(snapshot(PREV_BREAKDOWN, '2026-07-28T00:00:00Z'), PREVIOUS),
    );
    expect(md).toContain('every metric held steady and the Democracy Score did not move');
  });

  it('produces bullets whose printed contributions sum to the printed total', () => {
    const md = formatScoreAttributionSection(attributeScoreChange(CURRENT, PREVIOUS));
    const printed = [...md.matchAll(/([+-]\d+\.\d{2}) of the score/g)].map((m) => Number(m[1]));
    const total = Number(/moved ([+-]?\d+\.\d{2}) points/.exec(md)?.[1]);
    expect(Math.abs(printed.reduce((s, n) => s + n, 0) - total)).toBeLessThan(EPSILON);
  });
});

/**
 * TODO-085. The live Uniswap report narrated a full attribution — bullets and a
 * "Biggest driver" sentence with its methodology hint — for a Democracy Score
 * that had moved **+0.01** on a **+0.02** contribution. Both figures are
 * smaller than the rounding this decomposition already declares it tolerates,
 * so the section was presenting noise in the shape of a finding.
 */
describe('materiality of the attribution narrative', () => {
  /** One driver, well under the ±0.1 the decomposition tolerates as rounding. */
  const NOISE: ScoreAttribution = {
    status: 'attributed',
    period: {
      currentComputedAt: new Date('2026-07-31T02:00:00Z'),
      baselineComputedAt: new Date('2026-07-24T02:00:00Z'),
      ageDays: 7,
      coversFullWeek: true,
    },
    previousScore: 47.58,
    currentScore: 47.59,
    scoreDelta: 0.01,
    attributedDelta: 0.02,
    residual: -0.01,
    drivers: [
      {
        metric: 'powerDistribution',
        label: 'Power distribution',
        hint: 'How evenly voting power is spread.',
        previous: 2,
        current: 2,
        delta: 0.06,
        contribution: 0.02,
      },
    ],
  };

  it('does not announce a biggest driver for a move inside the rounding', () => {
    const md = formatScoreAttributionSection(NOISE);
    expect(md).not.toContain('Biggest driver');
    expect(md).not.toContain('How evenly voting power is spread');
  });

  it('still states the move and why nothing is attributed', () => {
    const md = formatScoreAttributionSection(NOISE);
    expect(md).toContain('+0.01');
    expect(md).toContain('rounding');
    // The section is not silently dropped — silence would read as "not measured".
    expect(md).toContain('What moved the Democracy Score');
  });

  it('lists no per-metric bullets for it', () => {
    expect(formatScoreAttributionSection(NOISE)).not.toContain('- **Power distribution**');
  });

  /**
   * The threshold must NOT be applied to the headline delta: two metrics moving
   * two points in opposite directions sum to zero while genuinely changing the
   * composition of the score, which is exactly the thing this section exists to
   * surface.
   */
  it('still narrates offsetting drivers that cancel to a zero net move', () => {
    const offsetting: ScoreAttribution = {
      ...NOISE,
      previousScore: 50,
      currentScore: 50,
      scoreDelta: 0,
      attributedDelta: 0,
      residual: 0,
      drivers: [
        { ...NOISE.drivers[0], metric: 'participation', label: 'Voter participation', contribution: 2, delta: 8 },
        { ...NOISE.drivers[0], metric: 'powerDistribution', label: 'Power distribution', contribution: -2, delta: -8 },
      ],
    };
    const md = formatScoreAttributionSection(offsetting);
    expect(md).toContain('Biggest driver');
    expect(md).toContain('- **Voter participation**');
  });

  it('leaves a genuinely material week exactly as it was', () => {
    const md = formatScoreAttributionSection(attributeScoreChange(CURRENT, PREVIOUS));
    expect(md).toContain('Biggest driver');
    expect(md).toContain('- **Voter participation**');
  });

  it('keeps the distinct "held steady" wording when nothing moved at all', () => {
    const flat: ScoreAttribution = {
      ...NOISE,
      scoreDelta: 0,
      attributedDelta: 0,
      residual: 0,
      drivers: [{ ...NOISE.drivers[0], delta: 0, contribution: 0 }],
    };
    expect(formatScoreAttributionSection(flat)).toContain('held steady');
  });

  it('uses the tolerance the module already declares, not a new number', () => {
    const atThreshold: ScoreAttribution = {
      ...NOISE,
      drivers: [{ ...NOISE.drivers[0], contribution: ATTRIBUTION_RESIDUAL_TOLERANCE }],
    };
    // Exactly at the tolerance is still rounding; above it is a finding.
    expect(formatScoreAttributionSection(atThreshold)).not.toContain('Biggest driver');
    const above: ScoreAttribution = {
      ...NOISE,
      drivers: [{ ...NOISE.drivers[0], contribution: ATTRIBUTION_RESIDUAL_TOLERANCE + 0.01 }],
    };
    expect(formatScoreAttributionSection(above)).toContain('Biggest driver');
  });
});
