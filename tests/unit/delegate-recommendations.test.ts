import { describe, it, expect } from 'vitest';
import { scoreDelegate, type DelegateScoreInput } from '@/server/services/delegate-recommendations';

const FULL: DelegateScoreInput = {
  participationRate: 0.8,
  karmaScore: 60,
  totalDaosActive: 5,
  avgResponseTimeHours: 12,
};

describe('scoreDelegate', () => {
  it('computes the weighted sum when every signal is present', () => {
    // participation: 0.8*0.4=0.32; karma: 0.6*0.3=0.18; daosActive: 0.5*0.15=0.075;
    // responsiveness: 1/(1+12/24)=0.6667*0.15=0.1; total weight=1 → sum≈0.6667
    const score = scoreDelegate(FULL);
    expect(score).toBeCloseTo(0.32 + 0.18 + 0.075 + 1 / 1.5 * 0.15, 4);
  });

  it('returns 0 when every signal is missing', () => {
    expect(
      scoreDelegate({
        participationRate: null,
        karmaScore: null,
        totalDaosActive: null,
        avgResponseTimeHours: null,
      }),
    ).toBe(0);
  });

  it('re-normalizes weights instead of penalizing a missing Karma score', () => {
    // Without karma, remaining weights are 0.4+0.15+0.15=0.7. A delegate with
    // perfect scores on the other three should score 1, not 0.7.
    const score = scoreDelegate({
      participationRate: 1,
      karmaScore: null,
      totalDaosActive: 10,
      avgResponseTimeHours: 0,
    });
    expect(score).toBeCloseTo(1, 4);
  });

  it('gives immediate responders (0 hours) full responsiveness credit', () => {
    const withZero = scoreDelegate({ ...FULL, avgResponseTimeHours: 0 });
    const withTwelve = scoreDelegate({ ...FULL, avgResponseTimeHours: 12 });
    expect(withZero).toBeGreaterThan(withTwelve);
  });

  it('caps totalDaosActive contribution at 10 DAOs (no extra credit beyond that)', () => {
    const at10 = scoreDelegate({ ...FULL, totalDaosActive: 10 });
    const at50 = scoreDelegate({ ...FULL, totalDaosActive: 50 });
    expect(at50).toBeCloseTo(at10, 6);
  });

  it('clamps out-of-range participationRate and karmaScore defensively', () => {
    const over = scoreDelegate({
      participationRate: 1.5, // shouldn't happen, but defend anyway
      karmaScore: 150,
      totalDaosActive: 5,
      avgResponseTimeHours: 12,
    });
    const capped = scoreDelegate({
      participationRate: 1,
      karmaScore: 100,
      totalDaosActive: 5,
      avgResponseTimeHours: 12,
    });
    expect(over).toBeCloseTo(capped, 6);
  });

  it('never exceeds 1 or drops below 0 for any combination', () => {
    const best = scoreDelegate({
      participationRate: 1,
      karmaScore: 100,
      totalDaosActive: 999,
      avgResponseTimeHours: 0,
    });
    const worst = scoreDelegate({
      participationRate: 0,
      karmaScore: 0,
      totalDaosActive: 0,
      avgResponseTimeHours: 100000,
    });
    expect(best).toBeLessThanOrEqual(1);
    expect(worst).toBeGreaterThanOrEqual(0);
  });
});
