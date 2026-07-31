import { describe, expect, it } from 'vitest';
import { hasVotingClosed, isStaleActive } from '@/lib/proposal-status';

/**
 * One definition of "this vote is over", shared by the report's alerts section
 * and by every surface that lists active proposals — so the paid report and
 * the dashboards cannot disagree about whether a vote is still live.
 *
 * The boundary matters: `formatTimeRemaining` already treats `seconds <= 0` as
 * `'ended'`, so a proposal exactly at its deadline is closed, not open.
 */

const NOW = new Date('2026-07-31T12:00:00Z');

describe('hasVotingClosed', () => {
  it('is true for a deadline in the past', () => {
    expect(hasVotingClosed(new Date('2026-07-26T00:00:00Z'), NOW)).toBe(true);
  });

  it('is false for a deadline in the future', () => {
    expect(hasVotingClosed(new Date('2026-08-05T00:00:00Z'), NOW)).toBe(false);
  });

  it('treats a deadline exactly at now as closed', () => {
    expect(hasVotingClosed(new Date(NOW), NOW)).toBe(true);
  });

  it('is false when there is no deadline at all', () => {
    // score_drop alerts are DAO-level and carry no proposal.
    expect(hasVotingClosed(null, NOW)).toBe(false);
    expect(hasVotingClosed(undefined, NOW)).toBe(false);
  });

  it('is false for an unusable timestamp rather than throwing', () => {
    expect(hasVotingClosed(new Date('nonsense'), NOW)).toBe(false);
  });
});

describe('isStaleActive', () => {
  it('flags a row still marked active past its deadline', () => {
    expect(isStaleActive('active', new Date('2026-07-04T00:00:00Z'), NOW)).toBe(true);
  });

  it('does not flag an active row that is genuinely still open', () => {
    expect(isStaleActive('active', new Date('2026-08-09T00:00:00Z'), NOW)).toBe(false);
  });

  it('does not flag rows the sync has already closed', () => {
    // Already `closed`: correctly labelled, nothing stale about it.
    expect(isStaleActive('closed', new Date('2026-07-04T00:00:00Z'), NOW)).toBe(false);
  });

  it('does not flag a pending proposal whose voting has not opened', () => {
    expect(isStaleActive('pending', new Date('2026-08-09T00:00:00Z'), NOW)).toBe(false);
  });

  it('degrades safely on missing data', () => {
    expect(isStaleActive(null, null, NOW)).toBe(false);
    expect(isStaleActive('active', null, NOW)).toBe(false);
  });
});
