import { describe, it, expect } from 'vitest';
import {
  shouldShowPrioritySyncBadge,
  formatPrioritySyncBadgeLabel,
} from '@/lib/priority-sync-badge';

describe('shouldShowPrioritySyncBadge', () => {
  it('shows the badge for an active priority-tier org', () => {
    expect(shouldShowPrioritySyncBadge({ tier: 'priority', active: true })).toBe(true);
  });

  it('hides the badge when the org is priority-tier but not active', () => {
    expect(shouldShowPrioritySyncBadge({ tier: 'priority', active: false })).toBe(false);
  });

  it('hides the badge when active is null (defaults to inactive)', () => {
    expect(shouldShowPrioritySyncBadge({ tier: 'priority', active: null })).toBe(false);
  });

  it('hides the badge for an active org on a non-priority tier', () => {
    expect(shouldShowPrioritySyncBadge({ tier: 'concierge', active: true })).toBe(false);
    expect(shouldShowPrioritySyncBadge({ tier: 'white_label', active: true })).toBe(false);
  });

  it('hides the badge for an inactive non-priority org', () => {
    expect(shouldShowPrioritySyncBadge({ tier: 'concierge', active: false })).toBe(false);
  });
});

describe('formatPrioritySyncBadgeLabel', () => {
  it('formats a recent timestamp as seconds ago, matching the acceptance criterion text', () => {
    const fiveSecondsAgo = new Date(Date.now() - 5_000);
    expect(formatPrioritySyncBadgeLabel(fiveSecondsAgo)).toBe(
      '⚡ Priority sync — updated 5s ago',
    );
  });

  it('formats an older timestamp using timeAgo minute granularity', () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);
    expect(formatPrioritySyncBadgeLabel(tenMinutesAgo)).toBe(
      '⚡ Priority sync — updated 10m ago',
    );
  });

  it('accepts a string or numeric timestamp, not just a Date', () => {
    const iso = new Date(Date.now() - 60_000).toISOString();
    expect(formatPrioritySyncBadgeLabel(iso)).toMatch(/^⚡ Priority sync — updated 1m ago$/);
  });
});
