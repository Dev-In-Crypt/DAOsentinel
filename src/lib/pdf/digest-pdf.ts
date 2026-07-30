import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

/**
 * PDF export for the public weekly digest (src/app/(app)/digest/[id]/page.tsx).
 *
 * `digests.body` is markdown produced either by `formatFallback` (deterministic,
 * see digest-generator.ts) or by the AI call following the same structure
 * (DIGEST_SYSTEM_PROMPT enforces "this exact structure") — headings (#/##),
 * `- ` bullets, and `**bold**` inline spans.
 *
 * Built directly on `pdf-lib` (manual layout, no React) rather than
 * `@react-pdf/renderer` — that library ships its own React reconciler, which
 * conflicts with Next.js 15's bundled React 18 inside route handlers
 * (`Minified React error #31`, a known incompatibility that only clears up
 * on React 19 — not worth an app-wide React major-version bump for one PDF
 * button). `pdf-lib` has no React dependency at all, so there's nothing to
 * conflict.
 */

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const MAX_WIDTH = PAGE_WIDTH - MARGIN * 2;

type WordStyle = 'regular' | 'bold' | 'italic' | 'code';

interface Word {
  text: string;
  style: WordStyle;
}

/**
 * Standard PDF fonts (Helvetica) only support WinAnsi encoding — drawing an
 * emoji (the digest markdown uses 📰/🐳/📊/📅 section headers) throws inside
 * pdf-lib's `encodeText`. Strip anything outside printable ASCII / Latin-1
 * before it ever reaches `drawText`, rather than bundling a Unicode font just
 * for a handful of header emoji. A small whitelist of "smart typography"
 * characters WinAnsi *does* support (bullet, en/em dash, curly quotes,
 * ellipsis) is kept even though their code points fall outside the Latin-1
 * range, so markdown bullets and any AI-generated smart punctuation aren't
 * silently dropped.
 */
const WINANSI_EXTRAS = '•–—‘’“”…';
const SANITIZE_RE = new RegExp(`[^\\x20-\\x7E\\xA0-\\xFF${WINANSI_EXTRAS}]`, 'g');

/**
 * Characters that carry MEANING and must survive as an ASCII equivalent rather
 * than being dropped by the strip above.
 *
 * The score attribution prints "40 → 45". Stripping the arrow left "40 45" in
 * a paid report — which reads as a typo and, worse, loses the direction of the
 * change. Anything decorative (emoji) still gets dropped; only characters
 * whose absence changes the meaning are mapped.
 */
const TRANSLITERATE: Array<[RegExp, string]> = [
  [/[→⟶]/g, '->'],
  [/[←⟵]/g, '<-'],
  [/⇒/g, '=>'],
  [/≤/g, '<='],
  [/≥/g, '>='],
  [/≈/g, '~'],
  [/×/g, 'x'],
  [/·/g, '-'],
  [/‑/g, '-'],
  // Non-breaking / thin spaces collapse to a plain space rather than vanishing
  // and gluing two words together.
  [/[   ]/g, ' '],
];

export function sanitizeForPdf(text: string): string {
  let out = text;
  for (const [re, to] of TRANSLITERATE) out = out.replace(re, to);
  return out
    .replace(SANITIZE_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits a markdown line into styled words.
 *
 * Handles `**bold**`, `_italic_` and `` `code` ``. Until TODO-079 only bold was
 * recognised, so the report's italic notes and its `` `rule_id` `` references
 * printed their markers as literal text — the customer saw
 * "_Each action below is produced…_" and "`critical_alert`" with the
 * punctuation intact, which is the single most obvious way for a paid PDF to
 * look unfinished.
 *
 * The italic arm requires the closing `_` to end a word so `snake_case`
 * identifiers are not chopped into fake emphasis — the same rule the email
 * template uses.
 */
const MD_SPAN_RE = /(\*\*[^*]+?\*\*|`[^`]+?`|(?:^|(?<=\s))_[^_]+?_(?=[\s.,;:!?)]|$))/g;

export function tokenize(line: string): Word[] {
  const segments = line.split(MD_SPAN_RE).filter((s) => s.length > 0);
  const words: Word[] = [];
  for (const seg of segments) {
    let style: WordStyle = 'regular';
    let inner = seg;
    if (seg.startsWith('**') && seg.endsWith('**')) {
      style = 'bold';
      inner = seg.slice(2, -2);
    } else if (seg.startsWith('`') && seg.endsWith('`')) {
      style = 'code';
      inner = seg.slice(1, -1);
    } else if (/^_[^_]+_$/.test(seg.trim())) {
      style = 'italic';
      inner = seg.trim().slice(1, -1);
    }
    const clean = sanitizeForPdf(inner);
    for (const w of clean.split(/\s+/).filter((w) => w.length > 0)) {
      words.push({ text: w, style });
    }
  }
  return words;
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  code: PDFFont;
}

class Layout {
  doc: PDFDocument;
  fonts: Fonts;
  page: PDFPage;
  y: number;

  constructor(doc: PDFDocument, fonts: Fonts, page: PDFPage) {
    this.doc = doc;
    this.fonts = fonts;
    this.page = page;
    this.y = PAGE_HEIGHT - MARGIN;
  }

  private get regular() {
    return this.fonts.regular;
  }

  private fontFor(style: WordStyle): PDFFont {
    return this.fonts[style];
  }

  /** A thin rule for the markdown `---` break, which used to print literally. */
  drawRule(gapAfter = 10) {
    this.ensureSpace(gapAfter);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 0.5,
      color: rgb(0.8, 0.82, 0.85),
    });
    this.y -= gapAfter;
  }

  private ensureSpace(lineHeight: number) {
    if (this.y - lineHeight < MARGIN) {
      this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      this.y = PAGE_HEIGHT - MARGIN;
    }
  }

  /** Draws a single-style line (headings, meta) with no wrapping. */
  drawLine(text: string, { size, bold = false, color = rgb(0.07, 0.09, 0.15), gapAfter = 4 }: {
    size: number;
    bold?: boolean;
    color?: ReturnType<typeof rgb>;
    gapAfter?: number;
  }) {
    const lineHeight = size * 1.3;
    this.ensureSpace(lineHeight);
    this.page.drawText(sanitizeForPdf(text), {
      x: MARGIN,
      y: this.y - size,
      size,
      font: bold ? this.fonts.bold : this.fonts.regular,
      color,
    });
    this.y -= lineHeight + gapAfter;
  }

  /** Draws word-wrapped, mixed bold/regular text starting at `x`, wrapping within maxWidth. */
  drawWrapped(words: Word[], { x = MARGIN, size = 11, gapAfter = 6 }: { x?: number; size?: number; gapAfter?: number } = {}) {
    const lineHeight = size * 1.35;
    const spaceWidth = this.regular.widthOfTextAtSize(' ', size);
    const maxWidth = MAX_WIDTH - (x - MARGIN);

    let cursorX = x;
    this.ensureSpace(lineHeight);

    for (const word of words) {
      const font = this.fontFor(word.style);
      const wordWidth = font.widthOfTextAtSize(word.text, size);

      if (cursorX !== x && cursorX + wordWidth > x + maxWidth) {
        this.y -= lineHeight;
        this.ensureSpace(lineHeight);
        cursorX = x;
      }

      this.page.drawText(word.text, { x: cursorX, y: this.y - size, size, font, color: rgb(0.07, 0.09, 0.15) });
      cursorX += wordWidth + spaceWidth;
    }

    this.y -= lineHeight + gapAfter;
  }
}

export interface DigestPdfInput {
  title: string;
  weekOfLabel: string;
  body: string;
}

/** A markdown table row: starts and ends with a pipe. */
function isTableRow(line: string): boolean {
  return line.startsWith('|') && line.endsWith('|');
}

/** `| --- | :--: |` — the separator under a table header, which carries no content. */
function isTableDivider(line: string): boolean {
  return isTableRow(line) && /^\|[\s:|-]+\|$/.test(line);
}

function splitRow(line: string): string[] {
  return line
    .slice(1, -1)
    .split('|')
    .map((c) => c.replace(/\\\|/g, '|').trim());
}

/**
 * Tables become labelled blocks, not columns.
 *
 * The at-a-glance table (TODO-076) has an Action column holding a full
 * sentence, and Helvetica is proportional — laying that out in real columns
 * would need column-width measurement and mid-cell wrapping for one table in
 * one document. Emitting `Header: value` lines per row keeps every value
 * readable and every header attached to it, which is what the table is for.
 *
 * Without this, `| a | b |` fell through to the plain-text branch and the PDF
 * showed raw pipes.
 */
function renderTable(layout: Layout, rows: string[][]) {
  const [header, ...body] = rows;
  if (!header) return;

  for (const row of body) {
    // First cell is the row's headline; the rest are its attributes.
    layout.drawLine('•', { size: 11, gapAfter: 0 });
    layout.y += 11 * 1.35;
    layout.drawWrapped(tokenize(`**${row[0] ?? ''}**`), { x: MARGIN + 14, size: 11 });

    for (let i = 1; i < header.length; i += 1) {
      const value = row[i];
      if (!value || value === '—') continue;
      layout.drawWrapped(tokenize(`${header[i]}: ${value}`), { x: MARGIN + 26, size: 10 });
    }
  }
}

function renderBody(layout: Layout, body: string) {
  const lines = body.split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;

    if (isTableRow(line)) {
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i].trim())) {
        const current = lines[i].trim();
        if (!isTableDivider(current)) rows.push(splitRow(current));
        i += 1;
      }
      i -= 1; // the outer loop advances again
      renderTable(layout, rows);
      continue;
    }

    if (/^-{3,}$/.test(line)) {
      // The report's break before its methodology footer. Without this arm it
      // fell through to the paragraph case and printed "---" as literal text.
      layout.drawRule();
      continue;
    }

    if (line.startsWith('### ')) {
      layout.drawLine(line.slice(4), { size: 12, bold: true, gapAfter: 4 });
    } else if (line.startsWith('## ')) {
      layout.drawLine(line.slice(3), { size: 13, bold: true, gapAfter: 6 });
    } else if (line.startsWith('# ')) {
      layout.drawLine(line.slice(2), { size: 16, bold: true, gapAfter: 8 });
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      layout.drawLine('•', { size: 11, gapAfter: 0 });
      layout.y += 11 * 1.35; // bullet mark and text share one line
      layout.drawWrapped(tokenize(line.slice(2)), { x: MARGIN + 14, size: 11 });
    } else {
      layout.drawWrapped(tokenize(line), { size: 11 });
    }
  }
}

export async function renderDigestPdf({ title, weekOfLabel, body }: DigestPdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    // Courier for `code` spans: the report cites rule ids like `critical_alert`,
    // and a monospace face is what marks them as identifiers rather than prose.
    code: await doc.embedFont(StandardFonts.Courier),
  };
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  const layout = new Layout(doc, fonts, page);
  // WRAPPED, not `drawLine`: the org report title is
  // "{org} — {dao} governance report — week of {date}", which overruns an A4
  // width and was being cut off mid-word on the first page.
  layout.drawWrapped(
    title.split(/\s+/).map((w) => ({ text: sanitizeForPdf(w), style: 'bold' as const })),
    { size: 18, gapAfter: 2 },
  );
  layout.drawLine(`Week of ${weekOfLabel} — DAO Sentinel`, { size: 10, color: rgb(0.42, 0.45, 0.52), gapAfter: 16 });
  renderBody(layout, body);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
