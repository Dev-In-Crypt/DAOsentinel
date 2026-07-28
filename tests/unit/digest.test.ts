import { describe, it, expect } from 'vitest';
import {
  formatFallback,
  digestScope,
  formatCuratedNotesSection,
  type DigestPayload,
  type CuratedDigestNote,
} from '@/server/services/digest-generator';

const EMPTY: DigestPayload = {
  weekOf: new Date('2026-07-06T00:00:00Z'),
  topProposals: [],
  whaleAlerts: [],
  scoreMovers: [],
  upcoming: [],
};

describe('formatFallback', () => {
  it('renders all four sections with placeholders when the payload is empty', () => {
    const md = formatFallback('DAO Sentinel Weekly — 2026-07-06', EMPTY);
    expect(md).toContain('# DAO Sentinel Weekly — 2026-07-06');
    expect(md).toContain('## 📰 Top stories');
    expect(md).toContain('_No standout proposals this week._');
    expect(md).toContain('_No whale votes this week._');
    expect(md).toContain('_No significant moves._');
    expect(md).toContain('_No active proposals._');
  });

  it('formats proposals, whales, movers and upcoming with real data', () => {
    const md = formatFallback('Weekly', {
      ...EMPTY,
      topProposals: [{ title: 'Fee switch', dao: 'Uniswap', state: 'closed', votes: 1234 }],
      whaleAlerts: [{ title: '🐳 Whale vote on Aave', dao: 'Aave', description: 'x' }],
      scoreMovers: [
        { dao: 'Compound', prev: 60, current: 72, delta: 12 },
        { dao: 'ENS', prev: 80, current: 74, delta: -6 },
      ],
      upcoming: [{ title: 'Grant renewal', dao: 'Optimism', deadline: new Date('2026-07-15T12:00:00Z') }],
    });
    expect(md).toContain('- **Fee switch** (Uniswap) — 1234 votes, closed');
    expect(md).toContain('- 🐳 Whale vote on Aave');
    expect(md).toContain('- Compound: 60 → 72 (+12)'); // positive delta gets a leading +
    expect(md).toContain('- ENS: 80 → 74 (-6)'); // negative keeps its own minus
    expect(md).toContain('- **Grant renewal** (Optimism) — ends 2026-07-15');
  });

  it('caps top proposals at 5 and whale alerts at 4', () => {
    const md = formatFallback('W', {
      ...EMPTY,
      topProposals: Array.from({ length: 8 }, (_, i) => ({
        title: `P${i}`,
        dao: 'D',
        state: 'active',
        votes: i,
      })),
      whaleAlerts: Array.from({ length: 8 }, (_, i) => ({ title: `W${i}`, dao: 'D', description: '' })),
    });
    expect(md).toContain('**P4**');
    expect(md).not.toContain('**P5**');
    expect(md).toContain('- W3');
    expect(md).not.toContain('- W4');
  });
});

/**
 * TODO-055: proves the additive/backward-compatible guarantee for the
 * optional `daoSlug` filter added to `gatherDigestData` — same spirit as
 * `resolveSyncTargets`'s tests for TODO-056's `daoIds` filter. `digestScope`
 * is the one pure decision function every one of `gatherDigestData`'s four
 * queries defers to, so exercising it here proves the contract without
 * needing a live DB.
 */
describe('digestScope (additive daoSlug filter — no-regression guarantee)', () => {
  it('is unscoped when daoSlug is omitted (today\'s exact behavior, the public digest path)', () => {
    expect(digestScope()).toEqual({ scoped: false });
  });

  it('is unscoped when daoSlug is explicitly undefined', () => {
    expect(digestScope(undefined)).toEqual({ scoped: false });
  });

  it('is unscoped when daoSlug is an empty string', () => {
    expect(digestScope('')).toEqual({ scoped: false });
  });

  it('is scoped to exactly the given slug when daoSlug is a non-empty string', () => {
    expect(digestScope('uniswap')).toEqual({ scoped: true, daoSlug: 'uniswap' });
  });

  it('unscoped and scoped results are distinguishable (the whole point)', () => {
    const unscoped = digestScope();
    const scoped = digestScope('aave');
    expect(unscoped).not.toEqual(scoped);
    expect(unscoped.scoped).toBe(false);
    expect(scoped.scoped).toBe(true);
  });
});

describe('formatCuratedNotesSection', () => {
  it('renders nothing when there are no notes (org digest degrades to just formatFallback)', () => {
    expect(formatCuratedNotesSection([])).toBe('');
  });

  it('renders a heading + one bullet per note, using the resolved subject title when present', () => {
    const notes: CuratedDigestNote[] = [
      {
        subjectType: 'proposal',
        subjectId: 'p-1',
        note: 'Concierge flagged this as high priority for the client.',
        subjectTitle: 'Fee switch activation',
      },
      {
        subjectType: 'alert',
        subjectId: 'a-1',
        note: 'Discussed on last week\'s call.',
      },
    ];
    const section = formatCuratedNotesSection(notes);
    expect(section).toContain('## 🗒️ Concierge notes');
    expect(section).toContain(
      '- **[proposal]** Fee switch activation — Concierge flagged this as high priority for the client.',
    );
    // Falls back to the raw subjectId when no title could be resolved.
    expect(section).toContain('- **[alert]** a-1 — Discussed on last week\'s call.');
  });

  it('appends cleanly onto formatFallback output, matching the digest\'s existing section style', () => {
    const payload: DigestPayload = {
      weekOf: new Date('2026-07-06T00:00:00Z'),
      topProposals: [],
      whaleAlerts: [],
      scoreMovers: [],
      upcoming: [],
    };
    const body =
      formatFallback('DAO Sentinel Weekly — 2026-07-06', payload) +
      formatCuratedNotesSection([
        { subjectType: 'proposal', subjectId: 'p-1', note: 'Note text', subjectTitle: 'Title' },
      ]);
    expect(body).toContain('## 📅 Coming up');
    expect(body).toContain('## 🗒️ Concierge notes');
    // Curated section comes after the standard sections, not interleaved.
    expect(body.indexOf('## 📅 Coming up')).toBeLessThan(body.indexOf('## 🗒️ Concierge notes'));
  });
});
