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

/**
 * Colours. Muted on purpose: this is a document a customer may print, and the
 * dark UI palette does not survive on paper. Accent is used only for section
 * headings and the risk word, so colour marks structure rather than decorating.
 */
const INK = rgb(0.07, 0.09, 0.15);
const INK_MUTED = rgb(0.42, 0.45, 0.52);
const ACCENT = rgb(0.13, 0.45, 0.35);
const RULE_GREY = rgb(0.8, 0.82, 0.85);
const LABEL_GREY = rgb(0.35, 0.38, 0.45);

/** Deepest nesting the layout indents for; beyond this the text column gets too narrow. */
const MAX_LIST_DEPTH = 3;
/** Horizontal step per nesting level. */
const INDENT_STEP = 16;

/** Air above a `##` section heading, and above a `###` sub-heading. */
const SECTION_GAP = 16;
const SUBSECTION_GAP = 8;

/**
 * How far a justified line may stretch its spaces, as a multiple of the normal
 * space. Past this the line grows "rivers" of white and reads worse than a
 * ragged right edge would, so it falls back to left-aligned. Short lines — a
 * two-word bullet, a heading — are exactly the case this protects.
 */
const MAX_SPACE_STRETCH = 2.6;

type Align = 'left' | 'center' | 'justify';

/**
 * Chart data for the paid org report's PDF-only "Visual summary" block.
 *
 * Defined here rather than in the org-report module so the numbers and the
 * renderer that draws them share one definition — `src/lib` is already the
 * direction org-report code imports (see its `@/lib/constants` usage), and a
 * second copy of these shapes is exactly how a field gets added on one side
 * only.
 *
 * These are the ONLY numbers this renderer ever receives. Everything else it
 * draws is markdown, which is why `fb817aa` left richer visuals undone: the
 * figures would have had to be regex-recovered from prose. They are threaded
 * explicitly instead — same reasoning as `riskLevel` above.
 */
export type QuorumMeterStatus = 'met' | 'on_track' | 'at_risk' | 'too_early_to_call';

export interface QuorumMeterInput {
  label: string;
  /** 0-100+; may exceed 100 once quorum is passed. The bar clamps, the printed figure does not. */
  pct: number;
  status: QuorumMeterStatus;
}

export interface AttributionBarInput {
  label: string;
  /** Signed Democracy Score-point contribution; the sign picks the bar's direction and colour. */
  contribution: number;
}

export interface DigestPdfVisuals {
  quorumMeters?: QuorumMeterInput[];
  attributionBars?: AttributionBarInput[];
}

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

/**
 * The longest prefix of `text` (plus an ellipsis) that fits `maxWidth`, found
 * by binary search over the character count.
 *
 * Chart labels are proposal titles — user-controlled, no length limit, and
 * drawn on a fixed-width row that cannot wrap. Without this they run off the
 * page edge exactly the way the report title used to before `f89a303`.
 * Returns a bare ellipsis rather than an empty string when not even one
 * character fits, so a too-narrow column still shows that something is there.
 */
export function truncateToWidth(
  font: PDFFont,
  text: string,
  size: number,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;

  const ELLIPSIS = '...';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (font.widthOfTextAtSize(text.slice(0, mid) + ELLIPSIS, size) <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo === 0 ? ELLIPSIS : text.slice(0, lo) + ELLIPSIS;
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

  /**
   * A filled banner naming the week's risk level.
   *
   * The only non-text graphic in the document, and deliberately so: it encodes
   * a value the report already computes, in the one place a reader's eye lands
   * first. Anything richer — quorum meters, score-attribution bars — needs the
   * underlying NUMBERS, and this renderer is handed markdown, so those would
   * have to be regex-recovered from prose. That trade is not worth it.
   */
  drawRiskBanner(level: string) {
    const label = level.trim().toUpperCase();
    const fill = RISK_FILL[level.trim().toLowerCase()] ?? INK_MUTED;
    const height = 22;

    this.ensureSpace(height + 8);
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - height,
      width: MAX_WIDTH,
      height,
      color: fill,
    });
    this.page.drawText(sanitizeForPdf(`GOVERNANCE RISK: ${label}`), {
      x: MARGIN + 10,
      y: this.y - height + 7,
      size: 10,
      font: this.fonts.bold,
      color: rgb(1, 1, 1),
    });
    this.y -= height + 12;
  }

  /**
   * Vertical air before a heading.
   *
   * Space goes BEFORE the heading, not after it: a heading belongs close to
   * the text it introduces and far from the section that ended above it.
   * Adding the gap after instead would push every heading away from its own
   * content, which is the opposite of what makes sections scannable.
   *
   * Skipped at the very top of a page — leading whitespace under a page break
   * reads as a rendering fault, not as spacing.
   */
  addGap(px: number) {
    if (this.y >= PAGE_HEIGHT - MARGIN - 1) return;
    this.y -= px;
  }

  /** A thin rule for the markdown `---` break, which used to print literally. */
  drawRule(gapAfter = 10) {
    this.ensureSpace(gapAfter);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 0.5,
      color: RULE_GREY,
    });
    this.y -= gapAfter;
  }

  /**
   * One quorum meter: the proposal, its percentage, and a track-and-fill bar.
   *
   * The fill is CLAMPED to the full width at 100% while the printed figure is
   * not — a vote at 142% of quorum shows a full bar and the real number. The
   * alternative, scaling every bar to the largest value in the set, would
   * shrink a struggling vote's bar because some other vote overshot, which is
   * the opposite of what the reader is looking for here: distance to quorum.
   */
  drawQuorumMeter(label: string, pct: number, status: QuorumMeterStatus) {
    const METER_HEIGHT = 8;
    const labelHeight = 11 * 1.3;
    this.ensureSpace(labelHeight + 4 + METER_HEIGHT + 10);

    const color = QUORUM_STATUS_FILL[status] ?? INK_MUTED;
    const pctText = `${Math.round(pct)}%`;
    const pctWidth = this.fonts.bold.widthOfTextAtSize(pctText, 10);
    const clean = truncateToWidth(
      this.fonts.regular,
      sanitizeForPdf(label),
      10,
      MAX_WIDTH - pctWidth - 10,
    );

    this.page.drawText(clean, { x: MARGIN, y: this.y - 11, size: 10, font: this.fonts.regular, color: INK });
    this.page.drawText(pctText, {
      x: PAGE_WIDTH - MARGIN - pctWidth,
      y: this.y - 11,
      size: 10,
      font: this.fonts.bold,
      color,
    });
    this.y -= labelHeight + 4;

    const trackY = this.y - METER_HEIGHT;
    this.page.drawRectangle({ x: MARGIN, y: trackY, width: MAX_WIDTH, height: METER_HEIGHT, color: METER_TRACK });
    const fillWidth = (MAX_WIDTH * Math.min(Math.max(pct, 0), 100)) / 100;
    if (fillWidth > 0) {
      this.page.drawRectangle({ x: MARGIN, y: trackY, width: fillWidth, height: METER_HEIGHT, color });
    }
    this.y -= METER_HEIGHT + 10;
  }

  /**
   * One attribution bar, diverging from a centre tick — right for a metric
   * that pushed the score up, left for one that pulled it down.
   *
   * `maxAbs` is the largest |contribution| across the WHOLE chart and is
   * passed in rather than computed per row, which is what keeps the bars
   * comparable: scaled individually, a -0.2 and a -5 would draw identically
   * and the chart would say nothing at all.
   */
  drawAttributionBar(label: string, contribution: number, maxAbs: number) {
    const BAR_HEIGHT = 7;
    const rowHeight = 11 * 1.3 + 10;
    this.ensureSpace(rowHeight);

    const barAreaWidth = MAX_WIDTH * 0.5;
    const labelWidth = MAX_WIDTH - barAreaWidth - 8;
    const centerX = MARGIN + labelWidth + 8 + barAreaWidth / 2;
    const color = contribution >= 0 ? ATTRIBUTION_POSITIVE : ATTRIBUTION_NEGATIVE;

    const clean = truncateToWidth(this.fonts.regular, sanitizeForPdf(label), 10, labelWidth);
    this.page.drawText(clean, { x: MARGIN, y: this.y - 11, size: 10, font: this.fonts.regular, color: INK });

    const valueText = `${contribution >= 0 ? '+' : ''}${contribution.toFixed(2)}`;
    const valueWidth = this.fonts.bold.widthOfTextAtSize(valueText, 9);
    this.page.drawText(valueText, {
      x: PAGE_WIDTH - MARGIN - valueWidth,
      y: this.y - 11,
      size: 9,
      font: this.fonts.bold,
      color,
    });

    // The zero axis, drawn across the FULL row height rather than just beside
    // the bar. Consecutive rows then join into one continuous line, so the
    // chart reads as diverging from an axis instead of as bars floating in
    // whitespace — and it still degrades correctly across a page break,
    // because each row draws only its own segment.
    this.page.drawLine({
      start: { x: centerX, y: this.y },
      end: { x: centerX, y: this.y - rowHeight },
      thickness: 0.75,
      color: RULE_GREY,
    });

    const barY = this.y - 13;

    const width = maxAbs > 0 ? (barAreaWidth / 2) * Math.min(Math.abs(contribution) / maxAbs, 1) : 0;
    if (width > 0) {
      this.page.drawRectangle({
        x: contribution >= 0 ? centerX : centerX - width,
        y: barY - BAR_HEIGHT,
        width,
        height: BAR_HEIGHT,
        color,
      });
    }
    this.y -= rowHeight;
  }

  private ensureSpace(lineHeight: number) {
    if (this.y - lineHeight < MARGIN) {
      this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      this.y = PAGE_HEIGHT - MARGIN;
    }
  }

  /** Draws a single-style line (headings, meta) with no wrapping. */
  drawLine(text: string, { size, bold = false, color = INK, gapAfter = 4, x = MARGIN, align = 'left' }: {
    size: number;
    bold?: boolean;
    color?: ReturnType<typeof rgb>;
    gapAfter?: number;
    x?: number;
    align?: 'left' | 'center';
  }) {
    const lineHeight = size * 1.3;
    const clean = sanitizeForPdf(text);
    const font = bold ? this.fonts.bold : this.fonts.regular;

    // Centre within the text column, not the page, so a centred heading lines
    // up with the block it introduces rather than with the paper.
    const drawX =
      align === 'center'
        ? x + Math.max(0, (MAX_WIDTH - (x - MARGIN) - font.widthOfTextAtSize(clean, size)) / 2)
        : x;

    this.ensureSpace(lineHeight);
    this.page.drawText(clean, { x: drawX, y: this.y - size, size, font, color });
    this.y -= lineHeight + gapAfter;
  }

  /**
   * Word-wrapped, mixed-style text starting at `x`.
   *
   * Two passes: break the words into lines, THEN draw each line. The single
   * greedy pass this replaced could not justify, because justification needs to
   * know a line's full contents — how much width is left over, and how many
   * gaps to spread it across — before any of its words are placed.
   */
  drawWrapped(
    words: Word[],
    {
      x = MARGIN,
      size = 11,
      gapAfter = 6,
      color = INK,
      align = 'left',
    }: {
      x?: number;
      size?: number;
      gapAfter?: number;
      color?: ReturnType<typeof rgb>;
      align?: Align;
    } = {},
  ) {
    if (words.length === 0) {
      this.y -= gapAfter;
      return;
    }

    const lineHeight = size * 1.35;
    const spaceWidth = this.regular.widthOfTextAtSize(' ', size);
    const maxWidth = MAX_WIDTH - (x - MARGIN);
    const widthOf = (w: Word) => this.fontFor(w.style).widthOfTextAtSize(w.text, size);

    // Pass 1 — break into lines.
    const lines: Word[][] = [];
    let current: Word[] = [];
    let currentWidth = 0;
    for (const word of words) {
      const w = widthOf(word);
      const projected = current.length === 0 ? w : currentWidth + spaceWidth + w;
      if (current.length > 0 && projected > maxWidth) {
        lines.push(current);
        current = [word];
        currentWidth = w;
      } else {
        current.push(word);
        currentWidth = projected;
      }
    }
    if (current.length > 0) lines.push(current);

    // Pass 2 — place them.
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const isLastLine = i === lines.length - 1;
      const naturalWidth = line.reduce((sum, w) => sum + widthOf(w), 0);
      const gaps = line.length - 1;

      let gap = spaceWidth;
      let startX = x;

      if (align === 'justify' && !isLastLine && gaps > 0) {
        // The last line of a block is never justified — stretching it would
        // pull two trailing words to opposite margins, which is the classic
        // way justified text announces that it was done by a machine.
        const stretched = (maxWidth - naturalWidth) / gaps;
        gap = stretched > spaceWidth * MAX_SPACE_STRETCH ? spaceWidth : stretched;
      } else if (align === 'center') {
        startX = x + Math.max(0, (maxWidth - (naturalWidth + gaps * spaceWidth)) / 2);
      }

      this.ensureSpace(lineHeight);
      let cursorX = startX;
      for (const word of line) {
        this.page.drawText(word.text, {
          x: cursorX,
          y: this.y - size,
          size,
          font: this.fontFor(word.style),
          color,
        });
        cursorX += widthOf(word) + gap;
      }
      this.y -= lineHeight;
    }

    this.y -= gapAfter;
  }
}

export interface DigestPdfInput {
  title: string;
  weekOfLabel: string;
  body: string;
  /**
   * Draws the coloured risk banner when supplied. Passed EXPLICITLY rather than
   * parsed out of `body`: the risk level is the single most consequential word
   * in the document, and recovering it by regex from prose we ourselves wrote
   * would make a rendering detail depend on the wording never changing. Omitted
   * by the public digest, which has no risk level.
   */
  riskLevel?: string;
  /**
   * Charts for the paid org report. Omitted by the free public digest, whose
   * PDF route never supplies it — `renderVisualsBlock` then draws nothing at
   * all rather than an empty heading.
   */
  visuals?: DigestPdfVisuals;
}

/** Banner fill per risk level. Unknown levels get the neutral grey, never a guess. */
const RISK_FILL: Record<string, ReturnType<typeof rgb>> = {
  high: rgb(0.86, 0.25, 0.25),
  elevated: rgb(0.91, 0.6, 0.13),
  moderate: rgb(0.2, 0.55, 0.75),
  low: rgb(0.16, 0.6, 0.4),
};

/** Unfilled part of a quorum meter. Light enough that the fill reads as the figure. */
const METER_TRACK = rgb(0.88, 0.89, 0.91);

/**
 * Meter fill per quorum status — the same physical colours `RISK_FILL` uses,
 * so "red" means trouble in both graphics rather than meaning one thing in the
 * banner and another twenty millimetres below it. `too_early_to_call` is
 * deliberately the neutral muted ink, not amber: a young vote short of quorum
 * is not a warning, and colouring it like one would contradict the section
 * text, which says so in as many words.
 */
const QUORUM_STATUS_FILL: Record<QuorumMeterStatus, ReturnType<typeof rgb>> = {
  met: rgb(0.16, 0.6, 0.4),
  on_track: rgb(0.2, 0.55, 0.75),
  at_risk: rgb(0.86, 0.25, 0.25),
  too_early_to_call: INK_MUTED,
};

const ATTRIBUTION_POSITIVE = rgb(0.16, 0.6, 0.4);
const ATTRIBUTION_NEGATIVE = rgb(0.86, 0.25, 0.25);

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

/**
 * The PDF-only "Visual summary": quorum meters, then score-attribution bars.
 *
 * FIXED POSITION — after the risk banner, before the markdown body — rather
 * than interleaved into the matching markdown section. Placing each chart
 * beside its own section would mean matching on heading text, and a rendering
 * detail that depends on prose never being reworded is the exact coupling
 * `fb817aa` refused; the whole point of threading `visuals` explicitly was to
 * avoid reading the document to decide how to draw it.
 *
 * Titled "Visual summary" and not "At a glance": the body's own at-a-glance
 * table (TODO-076) is the very next thing on the page, and two blocks under
 * one name would read as a duplicated section.
 *
 * Returns with ZERO drawing calls when both arrays are empty, so the free
 * public digest — which never passes `visuals` — produces the same document
 * it did before this existed. A test pins that byte-for-byte.
 */
function renderVisualsBlock(layout: Layout, visuals: DigestPdfVisuals | undefined) {
  const meters = visuals?.quorumMeters ?? [];
  const bars = visuals?.attributionBars ?? [];
  if (meters.length === 0 && bars.length === 0) return;

  layout.addGap(SECTION_GAP);
  layout.drawLine('Visual summary', { size: 14, bold: true, gapAfter: 8, color: ACCENT, align: 'center' });

  if (meters.length > 0) {
    layout.drawLine('Quorum - open votes', { size: 12, bold: true, gapAfter: 6, color: INK_MUTED });
    for (const m of meters) layout.drawQuorumMeter(m.label, m.pct, m.status);
  }

  if (bars.length > 0) {
    layout.addGap(SUBSECTION_GAP);
    layout.drawLine('Democracy Score - what moved it', {
      size: 12,
      bold: true,
      gapAfter: 6,
      color: INK_MUTED,
    });
    // One scale for the whole chart, so the bars are comparable to each other.
    const maxAbs = Math.max(...bars.map((b) => Math.abs(b.contribution)));
    for (const b of bars) layout.drawAttributionBar(b.label, b.contribution, maxAbs);
  }

  layout.drawRule(14);
}

function renderBody(layout: Layout, body: string) {
  const lines = body.split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;

    // Nesting depth, read from the RAW line. `lines[i].trim()` used to be the
    // first thing that happened to every line, which threw away the leading
    // whitespace — the only thing distinguishing "- 🔴 Whale vote" from its
    // "  - What happened:" child. Every bullet then drew at the same x and the
    // report's structure was flat on the page while the web and email versions
    // showed it correctly. Two spaces per level, matching the markdown the
    // report emits.
    const depth = Math.min(Math.floor((raw.length - raw.trimStart().length) / 2), MAX_LIST_DEPTH);

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
      // Left, NOT centred: a sub-heading labels the list immediately under it
      // ("Whale votes (4)"), and centring would float it away from the thing
      // it names. Only the document's own section titles are centred.
      layout.addGap(SUBSECTION_GAP);
      layout.drawLine(line.slice(4), { size: 12, bold: true, gapAfter: 4, color: INK_MUTED });
    } else if (line.startsWith('## ')) {
      layout.addGap(SECTION_GAP);
      layout.drawLine(line.slice(3), { size: 14, bold: true, gapAfter: 8, color: ACCENT, align: 'center' });
    } else if (line.startsWith('# ')) {
      layout.drawLine(line.slice(2), { size: 16, bold: true, gapAfter: 8, align: 'center' });
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const bulletX = MARGIN + depth * INDENT_STEP;
      // Nested levels get a lighter mark and lighter text, so depth reads at a
      // glance rather than only from the indent.
      layout.drawLine(depth === 0 ? '•' : '–', {
        size: 11,
        gapAfter: 0,
        x: bulletX,
        color: depth === 0 ? INK : LABEL_GREY,
      });
      layout.y += 11 * 1.35; // bullet mark and text share one line
      layout.drawWrapped(tokenize(line.slice(2)), {
        x: bulletX + 12,
        size: depth === 0 ? 11 : 10,
        color: depth === 0 ? INK : LABEL_GREY,
        align: 'justify',
      });
    } else {
      layout.drawWrapped(tokenize(line), {
        x: MARGIN + depth * INDENT_STEP,
        size: 11,
        align: 'justify',
      });
    }
  }
}

export async function renderDigestPdf({
  title,
  weekOfLabel,
  body,
  riskLevel,
  visuals,
}: DigestPdfInput): Promise<Buffer> {
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
    { size: 18, gapAfter: 2, align: 'center' },
  );
  layout.drawLine(`Week of ${weekOfLabel} — DAO Sentinel`, { size: 10, color: INK_MUTED, gapAfter: 14, align: 'center' });
  if (riskLevel) layout.drawRiskBanner(riskLevel);
  renderVisualsBlock(layout, visuals);
  renderBody(layout, body);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
