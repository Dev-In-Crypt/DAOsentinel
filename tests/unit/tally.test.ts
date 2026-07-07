import { describe, it, expect } from 'vitest';
import { mapTallyState, tallyTsToDate } from '@/lib/tally-client';

describe('mapTallyState', () => {
  it('maps ACTIVE → active and PENDING → pending', () => {
    expect(mapTallyState('ACTIVE')).toBe('active');
    expect(mapTallyState('PENDING')).toBe('pending');
  });

  it('is case-insensitive', () => {
    expect(mapTallyState('active')).toBe('active');
    expect(mapTallyState('pending')).toBe('pending');
  });

  it('maps every terminal Governor state to closed', () => {
    for (const s of ['DEFEATED', 'EXECUTED', 'CANCELED', 'QUEUED', 'SUCCEEDED', 'EXPIRED']) {
      expect(mapTallyState(s), s).toBe('closed');
    }
  });

  it('defaults unknown states to closed', () => {
    expect(mapTallyState('SOMETHING_NEW')).toBe('closed');
    expect(mapTallyState('')).toBe('closed');
  });
});

describe('tallyTsToDate', () => {
  it('returns null for empty/nullish/non-numeric/non-positive input', () => {
    expect(tallyTsToDate(null)).toBeNull();
    expect(tallyTsToDate(undefined)).toBeNull();
    expect(tallyTsToDate('')).toBeNull();
    expect(tallyTsToDate('not-a-number')).toBeNull();
    expect(tallyTsToDate('0')).toBeNull();
    expect(tallyTsToDate('-5')).toBeNull();
  });

  it('treats a seconds timestamp (< 1e12) as seconds and converts to ms', () => {
    const secs = 1_700_000_000; // ~2023-11-14
    expect(tallyTsToDate(String(secs))?.getTime()).toBe(secs * 1000);
  });

  it('treats a millisecond timestamp (>= 1e12) as already-ms', () => {
    const ms = 1_700_000_000_000;
    expect(tallyTsToDate(String(ms))?.getTime()).toBe(ms);
  });
});
