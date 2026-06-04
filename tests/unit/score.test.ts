import { describe, it, expect } from 'vitest';
import { calculateGini, avg } from '@/server/services/democracy-score';

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
