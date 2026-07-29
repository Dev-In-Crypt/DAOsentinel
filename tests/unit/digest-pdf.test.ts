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
