import { describe, it, expect } from 'vitest';
import {
  attributionBarScale,
  renderDigestPdf,
  sanitizeForPdf,
  tokenize,
  truncateToWidth,
  MIN_ATTRIBUTION_SCALE,
} from '@/lib/pdf/digest-pdf';
import { MATERIAL_SCORE_DROP } from '@/server/services/org-report/executive-summary';

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

describe('PDF visual summary (TODO-081)', () => {
  // The load-bearing one: the free public digest never passes `visuals`, so
  // this feature must be provably invisible on that path.
  it('renders nothing extra when visuals is omitted or empty', async () => {
    const body = '## 📰 Top stories\n- **A thing happened.**';
    const withoutVisuals = await renderDigestPdf({
      title: 'T',
      weekOfLabel: 'July 27, 2026',
      body,
    });
    const withEmptyVisuals = await renderDigestPdf({
      title: 'T',
      weekOfLabel: 'July 27, 2026',
      body,
      visuals: { quorumMeters: [], attributionBars: [] },
    });
    expect(withEmptyVisuals.length).toBe(withoutVisuals.length);
  });

  it('draws quorum meters and grows the document', async () => {
    const base = await renderDigestPdf({ title: 'T', weekOfLabel: 'July 27, 2026', body: 'x' });
    const withMeters = await renderDigestPdf({
      title: 'T',
      weekOfLabel: 'July 27, 2026',
      body: 'x',
      visuals: {
        quorumMeters: [
          { label: 'Fee switch activation', pct: 62, status: 'at_risk' },
          { label: 'Grants round 12', pct: 101, status: 'met' },
        ],
      },
    });
    expect(withMeters.subarray(0, 5).toString()).toBe('%PDF-');
    expect(withMeters.length).toBeGreaterThan(base.length);
  });

  it('draws attribution bars for both positive and negative contributions', async () => {
    const pdf = await renderDigestPdf({
      title: 'T',
      weekOfLabel: 'July 27, 2026',
      body: 'x',
      visuals: {
        attributionBars: [
          { label: 'Voter participation', contribution: -5 },
          { label: 'Power distribution', contribution: 2.5 },
        ],
      },
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('does not throw on a proposal title too long for its column', async () => {
    const longTitle =
      'A very long governance proposal title that would otherwise run off the right edge of an A4 page if nothing truncated it first';
    await expect(
      renderDigestPdf({
        title: 'T',
        weekOfLabel: 'July 27, 2026',
        body: 'x',
        visuals: { quorumMeters: [{ label: longTitle, pct: 40, status: 'too_early_to_call' }] },
      }),
    ).resolves.toBeInstanceOf(Buffer);
  });

  it('does not throw when many meters force a page break', async () => {
    const meters = Array.from({ length: 40 }, (_, i) => ({
      label: `Proposal ${i}`,
      pct: (i * 7) % 130,
      status: 'on_track' as const,
    }));
    await expect(
      renderDigestPdf({
        title: 'T',
        weekOfLabel: 'July 27, 2026',
        body: 'x',
        visuals: { quorumMeters: meters },
      }),
    ).resolves.toBeInstanceOf(Buffer);
  });
});

describe('truncateToWidth (TODO-081)', () => {
  it('leaves text that already fits untouched', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    expect(truncateToWidth(font, 'short', 10, 500)).toBe('short');
  });

  it('shortens overlong text and marks it with an ellipsis', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const long = 'a governance proposal title far wider than the space allowed for it';
    const got = truncateToWidth(font, long, 10, 80);
    expect(got.endsWith('...')).toBe(true);
    expect(got.length).toBeLessThan(long.length);
    expect(font.widthOfTextAtSize(got, 10)).toBeLessThanOrEqual(80);
  });

  it('degrades to a bare ellipsis when not even one character fits', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    expect(truncateToWidth(font, 'anything', 10, 1)).toBe('...');
  });
});

/**
 * TODO-084. Live defect: with a single driver, `maxAbs` equalled that driver's
 * own magnitude, so the ratio was 1.0 by construction and the bar drew at full
 * width whatever the number was. A real Uniswap report rendered a **+0.02**
 * contribution — a rounding artifact on a score that moved +0.01 — as a
 * maximal green bar, while the prose beside it correctly called the move
 * negligible.
 */
describe('attributionBarScale (TODO-084)', () => {
  it('never scales below the materiality floor, so a lone tiny driver stays tiny', () => {
    const scale = attributionBarScale([{ label: 'Power distribution', contribution: 0.02 }]);
    expect(scale).toBe(MIN_ATTRIBUTION_SCALE);
    // 0.02 against a floor of 2 is 1% of the bar area, not 100%.
    expect(0.02 / scale).toBeLessThan(0.02);
  });

  it('uses the largest contribution once it clears the floor', () => {
    const scale = attributionBarScale([
      { label: 'Voter participation', contribution: -5 },
      { label: 'Manipulation resistance', contribution: -2 },
    ]);
    expect(scale).toBe(5);
  });

  it('keeps drivers comparable to each other, not each to itself', () => {
    const bars = [
      { label: 'big', contribution: -8 },
      { label: 'small', contribution: -1 },
    ];
    const scale = attributionBarScale(bars);
    expect(Math.abs(bars[1].contribution) / scale).toBeCloseTo(0.125, 5);
  });

  it('a lone material driver still fills the bar', () => {
    expect(attributionBarScale([{ label: 'x', contribution: -7 }])).toBe(7);
  });

  it('returns the floor for an empty set rather than -Infinity', () => {
    // Math.max() with no arguments is -Infinity, which would make every width NaN.
    expect(attributionBarScale([])).toBe(MIN_ATTRIBUTION_SCALE);
  });

  /**
   * The floor is not a magic number: it is the same threshold the report uses
   * to call a score move material at all. This test is the link between the
   * two, since the renderer cannot import from the server services layer.
   */
  it('matches the report\'s own definition of a material score move', () => {
    expect(MIN_ATTRIBUTION_SCALE).toBe(Math.abs(MATERIAL_SCORE_DROP));
  });
});
