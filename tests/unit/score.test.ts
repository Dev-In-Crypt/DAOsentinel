import { describe, it, expect } from 'vitest';
import { calculateGini, avg, weightedScore } from '@/server/services/democracy-score';
import { SCORE_WEIGHTS } from '@/lib/constants';

describe('Democracy Score helpers', () => {
  it('Gini is 0 for perfectly equal distribution', () => {
    expect(calculateGini([10, 10, 10, 10])).toBeCloseTo(0, 5);
  });

  it('Gini approaches 1 for total inequality', () => {
    expect(calculateGini([0, 0, 0, 100])).toBeGreaterThan(0.7);
  });

  it('Gini is 0 for empty or zero input', () => {
    expect(calculateGini([])).toBe(0);
    expect(calculateGini([0, 0, 0])).toBe(0);
  });

  it('avg averages numbers', () => {
    expect(avg([1, 2, 3])).toBe(2);
    expect(avg([])).toBe(0);
  });
});

/**
 * TODO-090. Participation is a PROXY — average voters per recent proposal
 * against the distinct addresses we have ever seen vote. It is unmeasurable in
 * two situations, and both were being printed as if they were findings:
 *
 *   - No vote data at all. Tally-sourced DAOs (Compound, Optimism) have
 *     proposals but `tally-sync` writes no `votes` rows, so the electorate is
 *     0 and the rate came out 0.00% — "we did not measure this" rendered as
 *     "nobody voted", and scored as such.
 *   - Too little history. With one proposal the electorate IS that proposal's
 *     voters by construction, so the ratio is 1 by definition. Three DAOs sat
 *     at exactly 100.00%.
 */
describe('weightedScore', () => {
  const FULL = {
    participation: 60,
    powerDistribution: 40,
    proposalDiversity: 80,
    delegateAccountability: 20,
    manipulationResistance: 90,
  };

  it('matches the plain weighted sum when every metric is present', () => {
    // The weights total 1.0, so renormalising must be a no-op here — this is
    // what guarantees no existing DAO's score moves for an unrelated reason.
    const expected =
      60 * SCORE_WEIGHTS.participation +
      40 * SCORE_WEIGHTS.powerDistribution +
      80 * SCORE_WEIGHTS.proposalDiversity +
      20 * SCORE_WEIGHTS.delegateAccountability +
      90 * SCORE_WEIGHTS.manipulationResistance;
    expect(weightedScore(FULL)).toBeCloseTo(expected, 6);
  });

  it('renormalises over the remaining weights when a metric is absent', () => {
    const { participation, ...rest } = FULL;
    void participation;
    const remainingWeight =
      SCORE_WEIGHTS.powerDistribution +
      SCORE_WEIGHTS.proposalDiversity +
      SCORE_WEIGHTS.delegateAccountability +
      SCORE_WEIGHTS.manipulationResistance;
    const expected =
      (40 * SCORE_WEIGHTS.powerDistribution +
        80 * SCORE_WEIGHTS.proposalDiversity +
        20 * SCORE_WEIGHTS.delegateAccountability +
        90 * SCORE_WEIGHTS.manipulationResistance) /
      remainingWeight;
    expect(weightedScore(rest)).toBeCloseTo(expected, 6);
  });

  it('does not punish a DAO for an axis we could not measure', () => {
    // Scoring the unknown as 0 asserted "turnout is terrible" about a DAO we
    // simply have no vote data for. Omitting it must score strictly higher.
    const { participation, ...rest } = FULL;
    void participation;
    expect(weightedScore(rest)).toBeGreaterThan(weightedScore({ ...rest, participation: 0 }));
  });

  it('ignores non-finite values rather than poisoning the score with NaN', () => {
    expect(weightedScore({ ...FULL, participation: NaN })).toBeCloseTo(
      weightedScore({
        powerDistribution: FULL.powerDistribution,
        proposalDiversity: FULL.proposalDiversity,
        delegateAccountability: FULL.delegateAccountability,
        manipulationResistance: FULL.manipulationResistance,
      }),
      6,
    );
  });

  it('returns 0 when nothing at all could be measured', () => {
    expect(weightedScore({})).toBe(0);
  });
});
