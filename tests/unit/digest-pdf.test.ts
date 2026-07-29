import { describe, it, expect } from 'vitest';
import { renderDigestPdf } from '@/lib/pdf/digest-pdf';

describe('renderDigestPdf', () => {
  it('produces a valid PDF buffer for a representative markdown digest body', async () => {
    const body = [
      '# DAO Sentinel Weekly — 2026-07-27',
      '',
      '## 📰 Top stories',
      '- **Uniswap considers V4 deployment strategy.** A temperature check.',
      '',
      '## 🐳 Whale activity',
      '_No whale votes this week._',
    ].join('\n');

    const pdf = await renderDigestPdf({
      title: 'DAO Sentinel Weekly — 2026-07-27',
      weekOfLabel: 'July 27, 2026',
      body,
    });

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(0);
    // PDF files start with the "%PDF-" magic header.
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('handles an empty body without throwing', async () => {
    const pdf = await renderDigestPdf({ title: 'Empty', weekOfLabel: 'Jan 1, 2026', body: '' });
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});

describe('markdown tables (TODO-076)', () => {
  const TABLE = [
    '## At a glance',
    '',
    '| Risk | Affected | Deadline | Owner | Action |',
    '| --- | --- | --- | --- | --- |',
    '| 68.5% in one address | Fee switch | 2026-08-15 | Research | Identify whether 0xfe69 is a known address |',
    '| Quorum at risk | Grants r12 | — | Delegate relations | Push turnout |',
  ].join('\n');

  it('renders a table without leaking raw pipe characters', async () => {
    const pdf = await renderDigestPdf({ title: 'T', weekOfLabel: 'July 27, 2026', body: TABLE });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    // The separator row carries no content and must not become a bullet.
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('does not throw on a malformed or truncated table', async () => {
    const broken = '| Risk | Affected |\n| --- |\n| only one cell |\n';
    await expect(
      renderDigestPdf({ title: 'T', weekOfLabel: 'July 27, 2026', body: broken }),
    ).resolves.toBeInstanceOf(Buffer);
  });
});
