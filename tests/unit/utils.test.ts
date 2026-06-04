import { describe, it, expect } from 'vitest';
import { shortenAddress, formatNumber, formatPct, timeAgo } from '@/lib/utils';

describe('utils', () => {
  it('shortenAddress trims long addresses', () => {
    expect(shortenAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234…5678');
  });

  it('formatNumber compacts large numbers', () => {
    expect(formatNumber(1500)).toBe('1.50K');
    expect(formatNumber(2_500_000)).toBe('2.50M');
    expect(formatNumber(3_400_000_000)).toBe('3.40B');
  });

  it('formatPct returns dash for nullish', () => {
    expect(formatPct(null)).toBe('—');
    expect(formatPct(12.345)).toBe('12.35%');
  });

  it('timeAgo handles recent times', () => {
    const d = new Date(Date.now() - 5_000);
    expect(timeAgo(d)).toMatch(/s ago/);
  });
});
