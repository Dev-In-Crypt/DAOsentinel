/**
 * TODO-060: CSV export for the org dashboard's report data.
 *
 * Pure formatter — takes already-fetched report data (the same shape the org
 * dashboard page queries: active/recent proposals, recent alerts, score
 * history, curated org notes — see
 * src/app/(app)/org/[orgId]/[daoSlug]/page.tsx) and renders it as CSV text.
 * No DB access, no framework types — mirrors the extraction pattern already
 * used for pure/unit-testable logic elsewhere in this codebase
 * (formatFallback/formatCuratedNotesSection in
 * src/server/services/digest-generator.ts, findAccessibleOrg in
 * src/server/api/org-auth.ts, shouldShowPrioritySyncBadge in
 * src/lib/priority-sync-badge.ts).
 *
 * Renders as a sequence of labeled sections rather than one flat table,
 * since proposals/alerts/score-history/notes have different column shapes —
 * each section carries its own title line and header row, separated by a
 * blank line. Excel/Sheets/Numbers all parse this correctly when opened.
 */

export interface OrgReportProposalRow {
  title: string;
  state: string;
  votesCount: number;
  /** endTimestamp for active proposals, createdAt for recent proposals. */
  timestamp: Date | string;
}

export interface OrgReportAlertRow {
  severity: string;
  title: string;
  description: string;
  createdAt: Date | string;
}

export interface OrgReportScoreRow {
  score: number;
  computedAt: Date | string;
}

export interface OrgReportNoteRow {
  subjectType: string;
  /** Resolved proposal/alert title when available, otherwise the raw subject id. */
  subjectLabel: string;
  note: string;
  authorLabel: string;
  createdAt: Date | string;
}

export interface OrgReportCsvInput {
  organizationName: string;
  daoName: string;
  daoSlug: string;
  generatedAt: Date | string;
  activeProposals: OrgReportProposalRow[];
  recentProposals: OrgReportProposalRow[];
  alerts: OrgReportAlertRow[];
  scoreHistory: OrgReportScoreRow[];
  notes: OrgReportNoteRow[];
  /**
   * TODO-069: optional one-line footer for the notes section, reporting notes
   * that were excluded because their subject could not be matched to this DAO
   * (see `formatUnresolvedNotesNotice` in src/server/api/org-notes.ts). The
   * dashboard shows the same sentence, so a reader reconciling the CSV against
   * the screen sees the same count in the same words. Omitted when null.
   */
  notesNotice?: string | null;
  /**
   * How many rows the active-proposals deadline filter dropped — still
   * `state = 'active'` in the database but already past their close. Printed
   * under that section in the same words the dashboard uses, so the export and
   * the screen cannot appear to disagree. Omitted when zero.
   */
  staleActiveCount?: number;
}

/**
 * Escapes a single CSV field per RFC 4180: values are stringified (Dates ->
 * ISO string, null/undefined -> empty string), then wrapped in double quotes
 * if they contain a comma, double quote, or newline (\n or \r) — with any
 * embedded double quotes doubled.
 */
export function csvEscapeField(value: unknown): string {
  const str = value == null ? '' : value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(fields: unknown[]): string {
  return fields.map(csvEscapeField).join(',');
}

function isoDate(d: Date | string): string {
  return typeof d === 'string' ? new Date(d).toISOString() : d.toISOString();
}

/** Renders one section: a title line, a header row, then data rows. */
function section(title: string, header: string[], rows: unknown[][]): string {
  return [csvRow([title]), csvRow(header), ...rows.map(csvRow)].join('\r\n');
}

/**
 * Formats the org dashboard's report data as CSV text. Pure function of
 * already-fetched data — no DB access — so it's unit-testable without
 * mocking Drizzle or a live database.
 */
export function formatOrgReportCsv(input: OrgReportCsvInput): string {
  const parts: string[] = [];

  parts.push(csvRow([`DAO Sentinel org report — ${input.organizationName} — ${input.daoName}`]));
  parts.push(csvRow([`Generated ${isoDate(input.generatedAt)}`]));
  parts.push('');

  parts.push(
    section(
      'Active proposals',
      ['Title', 'State', 'Votes', 'Ends'],
      input.activeProposals.map((p) => [p.title, p.state, p.votesCount, isoDate(p.timestamp)]),
    ),
  );
  // Same sentence, same count, as the dashboard's own panel. A silently
  // shorter list would read as a quiet week rather than as a lagging sync.
  if (input.staleActiveCount && input.staleActiveCount > 0) {
    parts.push(
      csvRow([
        `${input.staleActiveCount} ${
          input.staleActiveCount === 1
            ? 'proposal still flagged active past its deadline was'
            : 'proposals still flagged active past their deadline were'
        } excluded — awaiting the next sync.`,
      ]),
    );
  }
  parts.push('');

  parts.push(
    section(
      'Recent proposals',
      ['Title', 'State', 'Votes', 'Created'],
      input.recentProposals.map((p) => [p.title, p.state, p.votesCount, isoDate(p.timestamp)]),
    ),
  );
  parts.push('');

  parts.push(
    section(
      'Recent alerts',
      ['Severity', 'Title', 'Description', 'Created'],
      input.alerts.map((a) => [a.severity, a.title, a.description, isoDate(a.createdAt)]),
    ),
  );
  parts.push('');

  parts.push(
    section(
      'Democracy Score history',
      ['Date', 'Score'],
      input.scoreHistory.map((s) => [isoDate(s.computedAt), s.score]),
    ),
  );
  parts.push('');

  parts.push(
    section(
      'Concierge notes',
      ['Subject type', 'Subject', 'Note', 'Author', 'Created'],
      input.notes.map((n) => [
        n.subjectType,
        n.subjectLabel,
        n.note,
        n.authorLabel,
        isoDate(n.createdAt),
      ]),
    ),
  );

  if (input.notesNotice) {
    parts.push(csvRow([input.notesNotice]));
  }

  return parts.join('\r\n');
}
