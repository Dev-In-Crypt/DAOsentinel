import { describe, it, expect } from 'vitest';
import { computeLeadingChoice } from '@/server/services/whale-detector';

describe('computeLeadingChoice', () => {
  it('picks the choice with the most voting power (1-indexed choice → 0-indexed result)', () => {
    const votes = [
      { choice: 1, votingPower: '10' },
      { choice: 2, votingPower: '35' },
      { choice: 2, votingPower: '5' },
    ];
    // choice 2 (index 1) has 40 total vs choice 1's 10
    expect(computeLeadingChoice(votes, 2)).toBe(1);
  });

  it('sums multiple votes for the same choice', () => {
    const votes = [
      { choice: 1, votingPower: '100' },
      { choice: 1, votingPower: '50' },
      { choice: 3, votingPower: '120' },
    ];
    expect(computeLeadingChoice(votes, 3)).toBe(0); // 150 > 120
  });

  it('returns index 0 on a tie (strict > means first max wins)', () => {
    const votes = [
      { choice: 1, votingPower: '50' },
      { choice: 2, votingPower: '50' },
    ];
    expect(computeLeadingChoice(votes, 2)).toBe(0);
  });

  it('ignores out-of-range choices (below 1 or beyond choicesLen)', () => {
    const votes = [
      { choice: 0, votingPower: '999' }, // idx -1, out of range
      { choice: 5, votingPower: '999' }, // idx 4, out of range for len 2
      { choice: 2, votingPower: '1' },
    ];
    expect(computeLeadingChoice(votes, 2)).toBe(1); // only the valid vote counts
  });

  it('defaults to index 0 with no votes', () => {
    expect(computeLeadingChoice([], 3)).toBe(0);
  });

  it('treats choicesLen <= 0 as a single-bucket array', () => {
    expect(computeLeadingChoice([], 0)).toBe(0);
  });

  it('parses string voting power correctly, including decimals', () => {
    const votes = [
      { choice: 1, votingPower: '10.5' },
      { choice: 2, votingPower: '10.4' },
    ];
    expect(computeLeadingChoice(votes, 2)).toBe(0);
  });
});
