import { describe, it, expect } from 'vitest';
import { shortenAddress, formatNumber, formatPct, timeAgo, normalizeProposalTitle } from '@/lib/utils';

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

describe('normalizeProposalTitle', () => {
  it('strips a trailing clone tag', () => {
    expect(normalizeProposalTitle('DAO Governance Evolution - [25-day-clone]')).toBe(
      'DAO Governance Evolution',
    );
  });

  it('treats two clones of one proposal as the same title', () => {
    expect(normalizeProposalTitle('Transfer IP - [25-day-clone]')).toBe(
      normalizeProposalTitle('Transfer IP - [32-day-clone]'),
    );
  });

  // The regression this guards: leading tags identify the proposal TYPE and
  // stripping them would merge genuinely different proposals into one bucket.
  it('keeps leading tags', () => {
    expect(normalizeProposalTitle('[SIGPROP] Transfer IP - [25-day-clone]')).toBe(
      '[SIGPROP] Transfer IP',
    );
    expect(normalizeProposalTitle('[AGIP-42] Raise the cap')).toBe('[AGIP-42] Raise the cap');
  });

  it('strips several trailing tags', () => {
    expect(normalizeProposalTitle('Proposal [v2] [25-day-clone]')).toBe('Proposal');
  });

  it('handles the em-dash and en-dash separators', () => {
    expect(normalizeProposalTitle('Proposal — [clone]')).toBe('Proposal');
    expect(normalizeProposalTitle('Proposal – [clone]')).toBe('Proposal');
  });

  it('leaves an untagged title alone', () => {
    expect(normalizeProposalTitle('Raise treasury allocation')).toBe('Raise treasury allocation');
  });

  // Returning '' here would put every bracket-only proposal in one dedupe
  // bucket and collapse unrelated alerts into each other.
  it('keeps the original text when the title is nothing but a tag', () => {
    expect(normalizeProposalTitle('[25-day-clone]')).toBe('[25-day-clone]');
  });

  it('is total on null, undefined and empty input', () => {
    expect(normalizeProposalTitle(null)).toBe('');
    expect(normalizeProposalTitle(undefined)).toBe('');
    expect(normalizeProposalTitle('   ')).toBe('');
  });
});
