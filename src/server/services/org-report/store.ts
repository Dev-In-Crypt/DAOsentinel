import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { orgReports } from '@/server/db/schema';
import {
  generateOrgReport,
  loadDao,
  loadOrganization,
  type OrgReportDao,
  type OrgReportOrganization,
} from './index';
import { startOfIsoWeekUtc } from './week';
import type {
  AttributionBarInput,
  QuorumMeterInput,
  QuorumMeterStatus,
} from '@/lib/pdf/digest-pdf';
import type { OrgReportVisuals } from './visuals';

/**
 * TODO-072: persistence for the paid org report.
 *
 * Until this existed, every view of /org/{id}/{dao}/report re-ran the whole
 * pipeline — six concurrent DB sweeps plus one LLM call, ~3s — and the result
 * was thrown away. Two consequences beyond the latency: a customer refreshing
 * the page could see the document change under them (the model's prose is not
 * pinned, and the window advances with the clock), and there was no record of
 * what we had told them last week.
 *
 * The unit of storage is the ISO week. `getOrGenerateOrgReport` returns the
 * stored row when one exists for the current week and generates exactly once
 * otherwise, so the report a customer reads on Wednesday is byte-identical to
 * the one they read on Monday and to the one the cron emailed them.
 */

const MS_PER_DAY = 86_400_000;

/** Default page size for the archive list. */
export const ORG_REPORT_HISTORY_LIMIT = 26;

/**
 * Re-exported from ./week, which is where it now lives so that `index.ts` can
 * use it for the report's own title without importing back from this module
 * (this one already imports from `index.ts`, so that would be a cycle).
 * Existing callers and tests keep this import path.
 */
export { startOfIsoWeekUtc };

/**
 * Removes the leading `# ` title line from a stored body.
 *
 * `composeOrgReportBody` builds the document as `'# ' + title` joined to the
 * sections, and its `includeTitle: false` branch trims the leading blank lines
 * the missing title would otherwise leave. Undoing it here reproduces that
 * branch's output exactly, so the PDF and the email — both of which print
 * their own title block — don't double the heading.
 *
 * A body that somehow lacks the heading is returned unchanged rather than
 * losing its real first line.
 */
export function stripLeadingH1(body: string): string {
  if (!body.startsWith('# ')) return body;
  const newline = body.indexOf('\n');
  if (newline === -1) return '';
  return body.slice(newline + 1).replace(/^\n+/, '');
}

const EMPTY_VISUALS: OrgReportVisuals = { quorumMeters: [], attributionBars: [] };

const QUORUM_STATUSES: ReadonlySet<string> = new Set<QuorumMeterStatus>([
  'met',
  'on_track',
  'at_risk',
  'too_early_to_call',
]);

function isQuorumMeter(m: unknown): m is QuorumMeterInput {
  if (typeof m !== 'object' || m === null) return false;
  const r = m as Record<string, unknown>;
  return (
    typeof r.label === 'string' &&
    typeof r.pct === 'number' &&
    typeof r.status === 'string' &&
    QUORUM_STATUSES.has(r.status)
  );
}

function isAttributionBar(b: unknown): b is AttributionBarInput {
  if (typeof b !== 'object' || b === null) return false;
  const r = b as Record<string, unknown>;
  return typeof r.label === 'string' && typeof r.contribution === 'number';
}

/**
 * Reads chart data back out of the untyped `payload` jsonb (TODO-081).
 *
 * Every row written before this feature shipped has no `visuals` key at all,
 * and those rows are still downloadable from the archive — so the legacy shape
 * is the common case here, not an edge one. Postgres gives no runtime
 * guarantee about jsonb contents either way, so each entry is validated
 * individually and anything that fails is DROPPED rather than thrown on: a
 * missing chart on an old report is a cosmetic gap, a 500 on a paying
 * customer's PDF download is not.
 */
export function parseStoredVisuals(payload: unknown): OrgReportVisuals {
  if (typeof payload !== 'object' || payload === null) return EMPTY_VISUALS;
  const raw = (payload as Record<string, unknown>).visuals;
  if (typeof raw !== 'object' || raw === null) return EMPTY_VISUALS;
  const r = raw as Record<string, unknown>;

  return {
    quorumMeters: Array.isArray(r.quorumMeters) ? r.quorumMeters.filter(isQuorumMeter) : [],
    attributionBars: Array.isArray(r.attributionBars)
      ? r.attributionBars.filter(isAttributionBar)
      : [],
  };
}

export interface StoredOrgReport {
  id: string;
  title: string;
  /** Full markdown, with the `# ` title line. */
  body: string;
  /** The same document without its title line — for the PDF and the email. */
  bodyWithoutTitle: string;
  weekStart: Date;
  generatedAt: Date;
  riskLevel: string;
  sentAt: Date | null;
  /** Chart data for the PDF's "Visual summary" block (TODO-081). Empty for pre-TODO-081 rows. */
  visuals: OrgReportVisuals;
  /** True when this call computed the report; false when it came from the archive. */
  fresh: boolean;
}

export interface OrgReportHistoryItem {
  id: string;
  title: string;
  weekStart: Date;
  generatedAt: Date;
  riskLevel: string;
  sentAt: Date | null;
}

function toStored(
  row: {
    id: string;
    title: string;
    body: string;
    weekStart: Date;
    generatedAt: Date;
    riskLevel: string;
    sentAt: Date | null;
    payload: Record<string, unknown> | null;
  },
  fresh: boolean,
): StoredOrgReport {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    bodyWithoutTitle: stripLeadingH1(row.body),
    weekStart: row.weekStart,
    generatedAt: row.generatedAt,
    riskLevel: row.riskLevel,
    sentAt: row.sentAt,
    visuals: parseStoredVisuals(row.payload),
    fresh,
  };
}

const STORED_COLUMNS = {
  id: orgReports.id,
  title: orgReports.title,
  body: orgReports.body,
  weekStart: orgReports.weekStart,
  generatedAt: orgReports.generatedAt,
  riskLevel: orgReports.riskLevel,
  sentAt: orgReports.sentAt,
  // Selected for its `visuals` key (TODO-081), which the PDF needs. The
  // archive-list query below deliberately does NOT select it — that view
  // renders no charts and the column holds the whole structured report.
  payload: orgReports.payload,
} as const;

async function selectStoredForWeek(
  organizationId: string,
  daoId: string,
  weekStart: Date,
): Promise<StoredOrgReport | null> {
  const [row] = await db
    .select(STORED_COLUMNS)
    .from(orgReports)
    .where(
      and(
        eq(orgReports.organizationId, organizationId),
        eq(orgReports.daoId, daoId),
        eq(orgReports.weekStart, weekStart),
      ),
    )
    .limit(1);
  return row ? toStored(row, false) : null;
}

export interface GetOrGenerateResult {
  report: StoredOrgReport;
  organization: OrgReportOrganization;
  dao: OrgReportDao;
}

export interface GetOrGenerateOptions {
  /** The clock. Defaults to now; pass a fixed instant to reproduce a past week. */
  now?: Date;
  /** `false` pins the executive summary to deterministic prose (no network call). */
  useAi?: boolean;
  /**
   * Skips the archive read and always computes a new report, overwriting this
   * week's row. For the operator's "regenerate" path only — a normal page view
   * must never do this, or the customer's document changes under them.
   */
  force?: boolean;
}

/**
 * The single entry point for "this organization's report for the current week".
 *
 * Resolving the org and the DAO is not overhead paid for caching: the DAO row
 * is what turns the URL's slug into the `daoId` the archive is keyed by, and
 * the org row carries the branding the email template needs. Both are
 * single-row primary-key reads.
 *
 * Concurrency: two requests can pass the archive check together (a page view
 * and the Monday cron, say) and both generate. The insert is
 * `onConflictDoNothing`, so the loser discards its work and re-reads the
 * winner's row rather than raising or writing a second row for the week. That
 * ordering is deliberate — whoever got there first defines the week, and the
 * customer never sees the document change.
 */
export async function getOrGenerateOrgReport(
  organizationId: string,
  daoSlug: string,
  opts: GetOrGenerateOptions = {},
): Promise<GetOrGenerateResult> {
  const now = opts.now ?? new Date();
  const weekStart = startOfIsoWeekUtc(now);

  const [organization, dao] = await Promise.all([
    loadOrganization(organizationId),
    loadDao(daoSlug),
  ]);

  if (!opts.force) {
    const existing = await selectStoredForWeek(organizationId, dao.id, weekStart);
    if (existing) return { report: existing, organization, dao };
  }

  const generated = await generateOrgReport(organizationId, daoSlug, {
    weekOf: now,
    useAi: opts.useAi,
  });

  const values = {
    organizationId,
    daoId: dao.id,
    weekStart,
    generatedAt: now,
    title: generated.title,
    body: generated.body,
    riskLevel: generated.summary.riskLevel,
    // The structured summary, recommendations and chart data, kept so the PDF
    // (and a future archive list) can render without re-parsing markdown. The
    // body remains the source of truth for what the customer was shown.
    //
    // `visuals` living here rather than in its own column is what makes
    // TODO-081 migration-free: this jsonb column already existed and is
    // already nullable, so old rows simply lack the key.
    payload: {
      summary: generated.summary,
      recommendations: generated.recommendations,
      visuals: generated.visuals,
    } as unknown as Record<string, unknown>,
  };

  if (opts.force) {
    const [row] = await db
      .insert(orgReports)
      .values(values)
      .onConflictDoUpdate({
        target: [orgReports.organizationId, orgReports.daoId, orgReports.weekStart],
        // A regenerated report has not been emailed in its new form, so
        // `sentAt` is deliberately left as it was rather than reset: the cron's
        // idempotency guard must not be re-armed by a manual regenerate.
        set: {
          generatedAt: values.generatedAt,
          title: values.title,
          body: values.body,
          riskLevel: values.riskLevel,
          payload: values.payload,
        },
      })
      .returning(STORED_COLUMNS);
    return { report: toStored(row, true), organization, dao };
  }

  const [inserted] = await db
    .insert(orgReports)
    .values(values)
    .onConflictDoNothing({
      target: [orgReports.organizationId, orgReports.daoId, orgReports.weekStart],
    })
    .returning(STORED_COLUMNS);

  if (inserted) return { report: toStored(inserted, true), organization, dao };

  // Lost the race — another request stored this week first. Serve theirs.
  const winner = await selectStoredForWeek(organizationId, dao.id, weekStart);
  if (winner) return { report: winner, organization, dao };

  // Unreachable in practice: the conflict proves a row exists. Fall back to
  // the freshly generated document rather than failing the request.
  console.warn(
    `[org-report-store] conflict without a readable row org=${organizationId} dao=${dao.slug}`,
  );
  return {
    report: {
      id: '',
      title: generated.title,
      body: generated.body,
      bodyWithoutTitle: generated.bodyWithoutTitle,
      weekStart,
      generatedAt: now,
      riskLevel: generated.summary.riskLevel,
      sentAt: null,
      visuals: generated.visuals,
      fresh: true,
    },
    organization,
    dao,
  };
}

/** Past reports for one org + DAO, newest week first. */
export async function listOrgReports(
  organizationId: string,
  daoId: string,
  limit = ORG_REPORT_HISTORY_LIMIT,
): Promise<OrgReportHistoryItem[]> {
  return db
    .select({
      id: orgReports.id,
      title: orgReports.title,
      weekStart: orgReports.weekStart,
      generatedAt: orgReports.generatedAt,
      riskLevel: orgReports.riskLevel,
      sentAt: orgReports.sentAt,
    })
    .from(orgReports)
    .where(and(eq(orgReports.organizationId, organizationId), eq(orgReports.daoId, daoId)))
    .orderBy(desc(orgReports.weekStart))
    .limit(limit);
}

/**
 * One archived report by id.
 *
 * `organizationId` and `daoId` are part of the WHERE clause, not checked after
 * the read: a caller who has been authorised for org A and DAO X must not be
 * able to fetch org B's report by guessing its id, and a filter that runs in
 * the query cannot be forgotten by a caller.
 */
export async function getOrgReportById(
  id: string,
  organizationId: string,
  daoId: string,
): Promise<StoredOrgReport | null> {
  const [row] = await db
    .select(STORED_COLUMNS)
    .from(orgReports)
    .where(
      and(
        eq(orgReports.id, id),
        eq(orgReports.organizationId, organizationId),
        eq(orgReports.daoId, daoId),
      ),
    )
    .limit(1);
  return row ? toStored(row, false) : null;
}

/**
 * Records that a report was emailed. This is what makes the weekly cron
 * idempotent — a retried or double-scheduled run finds `sentAt` set and skips
 * the send rather than mailing paying customers twice.
 */
export async function markOrgReportSent(
  id: string,
  recipientCount: number,
  sentAt = new Date(),
): Promise<void> {
  await db.update(orgReports).set({ sentAt, recipientCount }).where(eq(orgReports.id, id));
}

/**
 * Fixed month abbreviations rather than `toLocaleDateString`.
 *
 * Intl's answer depends on the ICU data the Node build ships: `en-GB` renders
 * September as "Sept", `en-US` as "Sep", and a small-icu build can fall back to
 * something else again. These strings go on a paid customer's document and
 * into unit tests; they should not vary with the runtime.
 */
const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** `29 Jul 2026`, always UTC. Pure. */
export function formatUtcDay(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Human label for a stored week, e.g. `27 – 2 Aug 2026` or `31 Aug – 6 Sep 2026`.
 * The opening month is dropped when the week does not cross one. Pure, UTC.
 */
export function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart.getTime() + 6 * MS_PER_DAY);
  const sameMonth = weekStart.getUTCMonth() === end.getUTCMonth();
  const left = sameMonth
    ? `${weekStart.getUTCDate()}`
    : `${weekStart.getUTCDate()} ${MONTHS_SHORT[weekStart.getUTCMonth()]}`;
  return `${left} – ${formatUtcDay(end)}`;
}
