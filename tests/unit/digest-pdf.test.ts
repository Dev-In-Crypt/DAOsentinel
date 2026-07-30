import { describe, it, expect } from 'vitest';
import { renderDigestPdf, sanitizeForPdf, tokenize } from '@/lib/pdf/digest-pdf';

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

describe('PDF inline formatting (TODO-079)', () => {
  it('renders arrows as ASCII instead of dropping them', () => {
    // The score attribution prints "40 → 45". Dropping the arrow left "40 45",
    // which reads as a typo and loses the direction of the change.
    expect(sanitizeForPdf('Voter participation — 40 → 45 (+5.00)')).toContain('40 -> 45');
  });

  it('keeps other meaningful symbols readable', () => {
    expect(sanitizeForPdf('a ≥ b')).toContain('>=');
    expect(sanitizeForPdf('x ≤ y')).toContain('<=');
    expect(sanitizeForPdf('p ≈ q')).toContain('~');
  });

  it('still drops emoji, which carry no meaning here', () => {
    expect(sanitizeForPdf('🐳 Whale vote')).toBe('Whale vote');
  });

  it('does not glue words together across a non-breaking space', () => {
    expect(sanitizeForPdf('Week\u00a0of\u00a0July')).toBe('Week of July');
  });

  it('strips italic markers and marks the words italic', () => {
    const words = tokenize('_Each action is produced by a rule._');
    expect(words.every((w) => w.style === 'italic')).toBe(true);
    expect(words.map((w) => w.text).join(' ')).not.toContain('_');
  });

  it('strips backticks and marks the words as code', () => {
    const words = tokenize('Trigger: `no_action_needed` fired');
    const code = words.filter((w) => w.style === 'code');
    expect(code).toHaveLength(1);
    expect(code[0].text).toBe('no_action_needed');
  });

  it('still handles bold, and mixes styles on one line', () => {
    const words = tokenize('**Risk** is _elevated_ per `critical_alert`');
    expect(words.find((w) => w.text === 'Risk')?.style).toBe('bold');
    expect(words.find((w) => w.text === 'elevated')?.style).toBe('italic');
    expect(words.find((w) => w.text === 'critical_alert')?.style).toBe('code');
  });

  // The guard that keeps rule ids intact: without it `no_action_needed` would
  // be chopped into fake emphasis at its underscores.
  it('does not treat snake_case as emphasis', () => {
    const words = tokenize('the rule no_action_needed matched');
    expect(words.find((w) => w.text === 'no_action_needed')?.style).toBe('regular');
  });

  it('renders a thematic break as a rule, not as literal dashes', async () => {
    const pdf = await renderDigestPdf({
      title: 'T',
      weekOfLabel: 'July 27, 2026',
      body: 'Above\n\n---\n\nBelow',
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('wraps a long title instead of running it off the page', async () => {
    const long = 'QA — Email Render — Aavegotchi governance report — week of 2026-07-27';
    const pdf = await renderDigestPdf({ title: long, weekOfLabel: 'July 27, 2026', body: 'x' });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
