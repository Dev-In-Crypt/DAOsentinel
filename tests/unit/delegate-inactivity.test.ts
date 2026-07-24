import { describe, it, expect } from 'vitest';
import { scoreSilentPower, type SilentPowerInput } from '@/server/services/delegate-inactivity';

const HIGH_POWER: SilentPowerInput = { votingPowerNorm: 1, daysSinceLastVote: 0 };

describe('scoreSilentPower', () => {
  it('scores a fully powerful, fully silent delegate at the max (1)', () => {
    expect(scoreSilentPower({ votingPowerNorm: 1, daysSinceLastVote: 90 })).toBeCloseTo(1, 6);
  });

  it('scores a delegate who just voted at ~0, regardless of power', () => {
    expect(scoreSilentPower(HIGH_POWER)).toBeCloseTo(0, 6);
  });

  it('scores zero voting power at 0, regardless of silence', () => {
    expect(scoreSilentPower({ votingPowerNorm: 0, daysSinceLastVote: 365 })).toBe(0);
  });

  it('scales linearly with days silent up to the 90-day window', () => {
    const at45 = scoreSilentPower({ votingPowerNorm: 1, daysSinceLastVote: 45 });
    const at90 = scoreSilentPower({ votingPowerNorm: 1, daysSinceLastVote: 90 });
    expect(at45).toBeCloseTo(0.5, 6);
    expect(at90).toBeCloseTo(1, 6);
  });

  it('caps inactivity contribution at the 90-day window (no extra credit for longer silence)', () => {
    const at90 = scoreSilentPower({ votingPowerNorm: 1, daysSinceLastVote: 90 });
    const at900 = scoreSilentPower({ votingPowerNorm: 1, daysSinceLastVote: 900 });
    expect(at900).toBeCloseTo(at90, 6);
  });

  it('treats a delegate who has never voted (null) as at least as silent as the 90-day window', () => {
    const neverVoted = scoreSilentPower({ votingPowerNorm: 1, daysSinceLastVote: null });
    const at90 = scoreSilentPower({ votingPowerNorm: 1, daysSinceLastVote: 90 });
    expect(neverVoted).toBeCloseTo(at90, 6);
  });

  it('scales linearly with normalized voting power', () => {
    const half = scoreSilentPower({ votingPowerNorm: 0.5, daysSinceLastVote: 90 });
    const full = scoreSilentPower({ votingPowerNorm: 1, daysSinceLastVote: 90 });
    expect(half).toBeCloseTo(full / 2, 6);
  });

  it('clamps out-of-range inputs defensively', () => {
    const over = scoreSilentPower({ votingPowerNorm: 1.5, daysSinceLastVote: 9000 });
    const negative = scoreSilentPower({ votingPowerNorm: -1, daysSinceLastVote: 90 });
    expect(over).toBeCloseTo(1, 6);
    expect(negative).toBe(0);
  });
});
