import { describe, it, expect } from 'vitest';
import { normaliseChoice } from '@/server/services/snapshot-sync';

describe('normaliseChoice', () => {
  it('passes through a plain number unchanged (single-choice votes)', () => {
    expect(normaliseChoice(2)).toBe(2);
    expect(normaliseChoice(0)).toBe(0);
  });

  it('takes the first entry of an array (ranked-choice votes)', () => {
    expect(normaliseChoice([3, 1, 2])).toBe(3);
  });

  it('defaults an empty array to 0', () => {
    expect(normaliseChoice([])).toBe(0);
  });

  it('picks the dominant key of a weighted/approval object', () => {
    expect(normaliseChoice({ '1': 20, '2': 80, '3': 5 })).toBe(2);
  });

  it('breaks ties by keeping the lower key (integer-like object keys iterate in ascending order, not insertion order)', () => {
    expect(normaliseChoice({ '4': 50, '1': 50 })).toBe(1);
  });

  it('defaults an empty object to 0', () => {
    expect(normaliseChoice({})).toBe(0);
  });

  it('defaults null/undefined to 0', () => {
    expect(normaliseChoice(null as unknown as number)).toBe(0);
    expect(normaliseChoice(undefined as unknown as number)).toBe(0);
  });
});
