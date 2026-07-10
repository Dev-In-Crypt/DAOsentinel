import { describe, it, expect } from 'vitest';
import { formatFallback, type DigestPayload } from '@/server/services/digest-generator';

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
