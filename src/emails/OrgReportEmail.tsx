import * as React from 'react';
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { hexToHsl } from '@/lib/color';

const APP_BASE = process.env.NEXTAUTH_URL || 'https://www.daosentinel.xyz';

/** Brand green, used whenever the org has no (valid) `brandingPrimaryColor`. */
const DEFAULT_ACCENT = '#22c55e';

export interface OrgReportEmailProps {
  /** `organizations.id` — half of the org's own dashboard route. */
  organizationId: string;
  /** `organizations.name` — the header fallback when no branding name is set. */
  organizationName: string;
  /** `organizations.brandingDisplayName` — the white-label override, preferred when present. */
  brandingDisplayName?: string | null;
  /** `organizations.brandingLogoUrl` — rendered above the header when it's an http(s) URL. */
  brandingLogoUrl?: string | null;
  /** `organizations.brandingPrimaryColor` — user-supplied hex; ignored when malformed. */
  brandingPrimaryColor?: string | null;
  /** Human-readable DAO name this report covers, e.g. "Uniswap". */
  daoName: string;
  /** `daos.slug` — the other half of the org's own dashboard route. */
  daoSlug: string;
  /** Week label, already formatted by the caller (e.g. `weekOf.toLocaleDateString()`). */
  weekOf: string;
  /** The assembled report body, in the narrow markdown subset `formatFallback` emits. */
  markdownBody: string;
}

/**
 * The paid, org-scoped weekly report (TODO-070).
 *
 * Deliberately NOT `WeeklyDigestEmail` — that template belongs to the free
 * public newsletter and says three things that are false for a paying org
 * member: it heads the mail "DAO Sentinel Weekly" (no customer name), it
 * points at the public `/digest` archive (which never contains this private
 * report), and it offers a public-newsletter unsubscribe (org members are on
 * this list via `organization_members`, not a newsletter subscription).
 *
 * Here the header names the customer and the DAO, the only link is the org's
 * own dashboard, and the delivery footer describes the real mechanism.
 */
export default function OrgReportEmail(p: OrgReportEmailProps) {
  const displayName = p.brandingDisplayName ?? p.organizationName;
  const accent = resolveAccent(p.brandingPrimaryColor);
  const logoUrl = safeLogoUrl(p.brandingLogoUrl);
  const dashboardUrl = `${APP_BASE}/org/${encodeURIComponent(p.organizationId)}/${encodeURIComponent(p.daoSlug)}`;

  return (
    <Html>
      <Head />
      <Preview>
        {displayName} — {p.daoName} governance report, week of {p.weekOf}
      </Preview>
      <Body style={body}>
        <Container style={container}>
          {logoUrl ? <Img src={logoUrl} alt={displayName} height="28" style={logo} /> : null}
          <Heading style={{ ...h1, color: accent }}>
            {displayName} — {p.daoName} governance report
          </Heading>
          <Text style={muted}>Week of {p.weekOf}</Text>

          <Section style={card}>
            <MarkdownBody markdown={p.markdownBody} accent={accent} />
          </Section>

          <Text style={muted}>
            Prepared privately for {displayName}. This report is not published anywhere public —
            the live numbers behind it are on your{' '}
            <Link href={dashboardUrl} style={{ ...link, color: accent }}>
              {p.daoName} dashboard
            </Link>
            .
          </Text>

          <Hr style={hr} />

          <Text style={muted}>
            You receive this because you're a member of {displayName} on DAO Sentinel. To change
            who on your team gets it, or to pause delivery, reply to this email or contact your
            account manager.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// =============================================
// Markdown → React (no dangerouslySetInnerHTML)
// =============================================
// `WeeklyDigestEmail` dumps the body into a `<pre>` and cites XSS safety with
// model-generated output — a fair call, but it also means `##` and `**` show
// up as literal punctuation, which reads like a log file in a $750 artifact.
//
// The body here comes from `formatFallback` + `formatCuratedNotesSection`,
// which emit a deliberately narrow subset: `#`/`##` headings, `- ` bullets,
// `**bold**` and `_italic_` inline. So we parse exactly that subset into real
// React elements. Everything that isn't one of those tokens stays a text node,
// and React escapes text nodes — a `<script>` in a curated note or in an
// LLM-written paragraph renders as visible characters, never as markup. No
// HTML string is ever constructed, so there is nothing for an injection to
// ride in on.

type Block =
  | { kind: 'h1' | 'h2' | 'h3' | 'p'; text: string }
  | { kind: 'hr' }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'table'; header: string[]; rows: string[][] };

/** A markdown table row: starts and ends with a pipe. */
function isTableRow(line: string): boolean {
  return line.startsWith('|') && line.endsWith('|');
}

/** `| --- | :--: |` — the alignment row under a header, which carries no content. */
function isTableDivider(line: string): boolean {
  return isTableRow(line) && /^\|[\s:|-]+\|$/.test(line);
}

function splitRow(line: string): string[] {
  return line
    .slice(1, -1)
    .split('|')
    // `/\\\|/` — an escaped backslash followed by an escaped pipe, matching the
    // literal two characters `\|`. NOT `/\\|/`, which reads as "a backslash OR
    // nothing" and therefore matches the empty string at every position,
    // inserting a pipe between every character of the cell.
    .map((c) => c.replace(/\\\|/g, '|').trim());
}

/** Splits the body into blocks. Anything unrecognised falls through as a paragraph. */
function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trimEnd();
    if (line.trim() === '') continue;

    if (/^-{3,}$/.test(line.trim())) {
      // The report body's thematic break before its methodology footer. Without
      // this arm it would fall through to the paragraph case and print "---" as
      // literal text in a paid email.
      blocks.push({ kind: 'hr' });
    } else if (isTableRow(line.trim())) {
      // Tables arrived with the at-a-glance section (TODO-076). Without this
      // arm every row fell through to the paragraph case and the customer's
      // email opened with a wall of literal `|` characters.
      const cells = splitRow(line.trim());
      const last = blocks[blocks.length - 1];
      if (isTableDivider(line.trim())) continue;
      if (last && last.kind === 'table') last.rows.push(cells);
      else blocks.push({ kind: 'table', header: cells, rows: [] });
    } else if (line.startsWith('### ')) {
      blocks.push({ kind: 'h3', text: line.slice(4).trim() });
    } else if (line.startsWith('## ')) {
      blocks.push({ kind: 'h2', text: line.slice(3).trim() });
    } else if (line.startsWith('# ')) {
      blocks.push({ kind: 'h1', text: line.slice(2).trim() });
    } else if (line.startsWith('- ')) {
      const item = line.slice(2).trim();
      const last = blocks[blocks.length - 1];
      if (last && last.kind === 'bullets') last.items.push(item);
      else blocks.push({ kind: 'bullets', items: [item] });
    } else {
      blocks.push({ kind: 'p', text: line.trim() });
    }
  }
  return blocks;
}

/**
 * `**bold**` and `_italic_`. The italic arm requires the opening `_` to start
 * a word and the closing `_` to end one, so `snake_case_identifiers` in a DAO
 * name or proposal title don't get chopped into fake emphasis.
 */
const INLINE_RE = /\*\*([^*]+?)\*\*|(?:^|(?<=\s))_([^_]+?)_(?=[\s.,;:!?)]|$)/g;

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  INLINE_RE.lastIndex = 0;
  let match = INLINE_RE.exec(text);
  while (match !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    if (match[1] !== undefined) {
      nodes.push(<strong key={key++}>{match[1]}</strong>);
    } else {
      nodes.push(<em key={key++}>{match[2]}</em>);
    }
    cursor = match.index + match[0].length;
    match = INLINE_RE.exec(text);
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function MarkdownBody({ markdown, accent }: { markdown: string; accent: string }) {
  return (
    <>
      {parseBlocks(markdown).map((block, i) => {
        if (block.kind === 'h1') {
          return (
            <Text key={i} style={bodyH1}>
              {renderInline(block.text)}
            </Text>
          );
        }
        if (block.kind === 'h2') {
          return (
            <Text key={i} style={{ ...bodyH2, color: accent }}>
              {renderInline(block.text)}
            </Text>
          );
        }
        if (block.kind === 'h3') {
          return (
            <Text key={i} style={bodyH3}>
              {renderInline(block.text)}
            </Text>
          );
        }
        if (block.kind === 'table') {
          // A real <table>, not a <pre> grid: Gmail and Outlook both render
          // tables reliably, and the at-a-glance row holds a full sentence in
          // its last cell, which any fixed-width layout would truncate.
          return (
            <table key={i} style={tableStyle}>
              <thead>
                <tr>
                  {block.header.map((h, j) => (
                    <th key={j} style={{ ...tableCell, ...tableHeadCell }}>
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r}>
                    {block.header.map((_, c) => (
                      <td key={c} style={tableCell}>
                        {renderInline(row[c] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        }
        if (block.kind === 'hr') {
          return <Hr key={i} style={hr} />;
        }
        if (block.kind === 'bullets') {
          return (
            <ul key={i} style={list}>
              {block.items.map((item, j) => (
                <li key={j} style={listItem}>
                  {renderInline(item)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <Text key={i} style={paragraph}>
            {renderInline(block.text)}
          </Text>
        );
      })}
    </>
  );
}

// =============================================
// Untrusted branding values
// =============================================

/**
 * `brandingPrimaryColor` is whatever a client typed into a branding form, so
 * it never reaches CSS verbatim. `hexToHsl` (the existing validator, src/lib/color.ts)
 * returns null for anything malformed; a valid parse is re-emitted as a
 * comma-form `hsl()` string, which is both guaranteed well-formed and the
 * syntax every email client understands.
 */
function resolveAccent(brandingPrimaryColor: string | null | undefined): string {
  if (!brandingPrimaryColor) return DEFAULT_ACCENT;
  const hsl = hexToHsl(brandingPrimaryColor);
  if (!hsl) return DEFAULT_ACCENT;
  return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
}

/** Only http(s) logos are rendered — never a `data:`/`javascript:` src from stored data. */
function safeLogoUrl(brandingLogoUrl: string | null | undefined): string | null {
  if (!brandingLogoUrl) return null;
  const trimmed = brandingLogoUrl.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

const body = { backgroundColor: '#0a0a0a', color: '#fafafa', fontFamily: 'system-ui, sans-serif' };
const container = { margin: '0 auto', padding: '32px 24px', maxWidth: '640px' };
const logo = { display: 'block', marginBottom: '16px' };
const h1 = { fontSize: '22px', lineHeight: '30px', margin: '0' };
const muted = { color: '#a3a3a3', fontSize: '13px', lineHeight: '20px' };
const card = {
  backgroundColor: '#171717',
  border: '1px solid #262626',
  borderRadius: '8px',
  padding: '8px 20px',
  margin: '16px 0',
};
const bodyH1 = { color: '#fafafa', fontSize: '17px', fontWeight: 600, margin: '16px 0 4px' };
const bodyH2 = { fontSize: '14px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.04em', margin: '20px 0 4px' };
const bodyH3 = { color: '#fafafa', fontSize: '13px', fontWeight: 600, margin: '16px 0 4px' };
// Fixed layout + wrapped cells: the Action column holds a full sentence, and
// without these the table stretches past the email's width in Outlook.
const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse' as const,
  tableLayout: 'fixed' as const,
  margin: '8px 0 16px',
};
const tableCell = {
  color: '#fafafa',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '6px 8px',
  border: '1px solid #262626',
  textAlign: 'left' as const,
  verticalAlign: 'top' as const,
  wordBreak: 'break-word' as const,
};
const tableHeadCell = { color: '#a3a3a3', fontWeight: 600, textTransform: 'uppercase' as const, fontSize: '11px', letterSpacing: '0.04em' };
const paragraph = { color: '#fafafa', fontSize: '14px', lineHeight: '22px', margin: '8px 0' };
const list = { margin: '4px 0 12px', paddingLeft: '20px' };
const listItem = { color: '#fafafa', fontSize: '14px', lineHeight: '22px', marginBottom: '4px' };
const hr = { borderColor: '#262626', margin: '20px 0' };
const link = { fontWeight: 600 };
