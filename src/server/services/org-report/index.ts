/**
 * TODO-068 (part B): final assembly of the PAID org-scoped weekly report.
 *
 * This is the only module that knows the report exists as a *document*. Every
 * section it composes was built, and is unit-tested, elsewhere:
 *
 *   executive-summary.ts  risk level + drivers + key events (+ the one AI call)
 *   recommendations.ts    what to do about it
 *   attention-alerts.ts   what fired
 *   upcoming-quorum.ts    what is still open and where quorum stands
 *   whale-context.ts      who moved it and whether it mattered
 *   score-attribution.ts  which axis moved the Democracy Score
 *   ../../api/org-notes   the concierge team's own DAO-scoped annotations
 *
 * ORDER IS THE PRODUCT. The executive summary and the recommended actions come
 * FIRST, before any evidence: a governance team reading this on a Monday needs
 * "what do I do" before "what happened". Everything under those two sections
 * exists to let them check the answer, which is also why the methodology footer
 * is mandatory rather than decorative — a paid claim a customer cannot audit is
 * just an opinion with an invoice attached.
 *
 * Composition is split into a pure `composeOrgReportBody` (no DB, no clock, no
 * network) and a thin `generateOrgReport` that loads the rows and calls it, the
 * same discipline every module above follows.
 */

import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { daos, organizations } from '../../db/schema';
import { QUORUM_RISK_THRESHOLD, QUORUM_RISK_WINDOW_ELAPSED } from '@/lib/constants';
import {
  fetchOrgNotesForDao,
  formatUnresolvedNotesNotice,
  type ResolvedOrgNote,
} from '../../api/org-notes';
import {
  describeAlerts,
  fetchAttentionAlerts,
  formatAttentionAlertsSection,
  type AttentionAlert,
} from './attention-alerts';
import {
  buildExecutiveSummary,
  formatExecutiveSummarySection,
  writeExecutiveSummaryProse,
  MATERIAL_SCORE_DROP,
  MULTI_QUORUM_AT_RISK_MIN,
  SEVERE_SCORE_DROP,
  type ExecutiveSummary,
} from './executive-summary';
import {
  buildRecommendations,
  formatRecommendationsSection,
  type Recommendation,
} from './recommendations';
import {
  fetchScoreAttribution,
  formatScoreAttributionSection,
  ATTRIBUTION_RESIDUAL_TOLERANCE,
  type ScoreAttribution,
} from './score-attribution';
import {
  countStaleActiveProposals,
  fetchUpcomingWithQuorum,
  formatUpcomingSection,
  type UpcomingProposalItem,
} from './upcoming-quorum';
import { fetchWhaleContext, formatWhaleContextSection, type WhaleContextItem } from './whale-context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrgReportOrganization {
  id: string;
  name: string;
  /** `brandingDisplayName ?? name` — what the customer calls themselves. */
  displayName: string;
  brandingDisplayName: string | null;
  brandingLogoUrl: string | null;
  brandingPrimaryColor: string | null;
}

export interface OrgReportDao {
  id: string;
  name: string;
  slug: string;
}

export interface GenerateOrgReportOptions {
  weekOf?: Date;
  /**
   * `false` pins the executive summary to its deterministic prose and makes no
   * network call. Everything else in the report is deterministic already.
   */
  useAi?: boolean;
}

export interface OrgReport {
  /** Also the email subject. */
  title: string;
  weekOf: Date;
  organization: OrgReportOrganization;
  dao: OrgReportDao;
  summary: ExecutiveSummary;
  recommendations: Recommendation[];
  /** The full document, opening with its own `# ` title line. */
  body: string;
  /**
   * The same document with the title line omitted, for surfaces that render
   * their own header — `OrgReportEmail` already prints
   * "{org} — {dao} governance report" above the body, so handing it `body`
   * would show the customer the title twice. See `sendOrgDigestToMembers`.
   */
  bodyWithoutTitle: string;
}

/** Everything `composeOrgReportBody` needs. No DB handles, no promises. */
export interface OrgReportSectionData {
  organizationDisplayName: string;
  daoName: string;
  weekOf: Date;
  summary: ExecutiveSummary;
  /** Already resolved: deterministic text, or model prose that passed `proseIsSafe`. */
  summaryProse: string;
  recommendations: readonly Recommendation[];
  alerts: readonly AttentionAlert[];
  upcoming: readonly UpcomingProposalItem[];
  staleActiveCount: number;
  whales: readonly WhaleContextItem[];
  attribution: ScoreAttribution | null;
  notes: readonly ResolvedOrgNote[];
  unresolvedNotesCount: number;
}

// ---------------------------------------------------------------------------
// Title
// ---------------------------------------------------------------------------

/**
 * Deliberately NOT `DAO Sentinel Weekly — <date>`, which is what this path used
 * to emit — byte-identical to the free public digest's title. A $750/30d
 * artifact that arrives under the same headline as the free newsletter reads
 * like the free newsletter.
 */
export function orgReportTitle(organizationDisplayName: string, daoName: string, weekOf: Date): string {
  return `${organizationDisplayName} — ${daoName} governance report — week of ${weekOf
    .toISOString()
    .slice(0, 10)}`;
}

// ---------------------------------------------------------------------------
// Concierge notes (pure)
// ---------------------------------------------------------------------------

/** Keeps the section readable; `fetchOrgNotesForDao` reads a wider window than this. */
export const CONCIERGE_NOTES_LIMIT = 10;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Replaces `formatCuratedNotesSection` (digest-generator.ts), which was
 * org-wide and so printed another DAO's notes on this DAO's report — see
 * TODO-069. These notes are already scoped by `fetchOrgNotesForDao`.
 *
 * Returns `''` only when there is genuinely nothing to say. An unresolved-note
 * count alone still renders: the concierge team's hand-written content silently
 * vanishing is precisely the failure the count exists to surface.
 */
export function formatConciergeNotesSection(
  notes: readonly ResolvedOrgNote[],
  unresolvedNotice: string | null,
  limit = CONCIERGE_NOTES_LIMIT,
): string {
  const shown = notes.slice(0, limit);
  if (shown.length === 0 && !unresolvedNotice) return '';

  const lines = shown.map(
    (n) =>
      `- **[${n.subjectType}]** ${n.subjectLabel} — ${n.note} _(${n.authorName ?? n.authorEmail}, ${isoDay(n.createdAt)})_`,
  );

  const overflow =
    notes.length > shown.length
      ? `\n_${notes.length - shown.length} older ${notes.length - shown.length === 1 ? 'note' : 'notes'} not shown._`
      : '';

  const body =
    shown.length > 0
      ? `${lines.join('\n')}${overflow}`
      : '_No notes for this DAO in the current window._';

  return `\n\n## 🗒️ Concierge notes\n${body}${unresolvedNotice ? `\n_${unresolvedNotice}_` : ''}`;
}

// ---------------------------------------------------------------------------
// Methodology footer (pure, and required)
// ---------------------------------------------------------------------------

const RISK_PCT = Math.round(QUORUM_RISK_THRESHOLD * 100);
const RISK_WINDOW_REMAINING_PCT = Math.round((1 - QUORUM_RISK_WINDOW_ELAPSED) * 100);

/**
 * Not decoration. This block is what makes the document defensible: it states
 * every threshold and formula the report applied, in the report itself, so a
 * customer can reconstruct any figure above it — and it says, explicitly and
 * in one place, that nothing here is a prediction.
 *
 * Constants are interpolated from `@/lib/constants` rather than typed out, so
 * the footer cannot drift from the code that actually applied them.
 */
export function formatMethodologyFooter(): string {
  return `\n\n---\n\n## 📐 Methodology & definitions
_Every figure above is observed state at the time this report was generated._
- **Risk level** — computed by a fixed rule from the sections below it, never by a language model: a whale currently deciding an open vote, a late swing, ${MULTI_QUORUM_AT_RISK_MIN} or more open votes at risk of missing quorum, or a Democracy Score fall of ${Math.abs(SEVERE_SCORE_DROP)} points or more make the week high; a critical alert, a single at-risk vote, coordinated voting, or a fall of ${Math.abs(MATERIAL_SCORE_DROP)} points or more make it elevated. This scale (low / elevated / high) is deliberately distinct from the low / medium / high AI risk rating shown on individual proposals — they measure different things.
- **"Quorum at risk"** — under ${RISK_PCT}% of the required quorum with under ${RISK_WINDOW_REMAINING_PCT}% of the voting window remaining. Both halves must hold, which is the same condition that raises a quorum-risk alert, so this report and your alerts cannot disagree. Where a source publishes no quorum figure the vote is reported as such rather than assumed to be at 0%.
- **Democracy Score attribution** — each metric's share of the move is (metric now − metric at the baseline snapshot) × that metric's weight. The five shares sum to the published move up to a ±${ATTRIBUTION_RESIDUAL_TOLERANCE} rounding residual; when they do not reconcile, the attribution is withheld rather than published.
- **"Decisive"** — a counterfactual recompute, not a margin comparison: the voter's power is subtracted from the choice they backed and the winner is recomputed from the remaining scores. "Decisive" means that recomputed winner differs. Where the arithmetic cannot be stood behind (no per-choice results, an unsupported voting type), the verdict is reported as undetermined rather than guessed.
- **Nothing in this report is a prediction.** There is no probability of passing, no projected outcome, and no forecast of any kind anywhere in this document — only what has already happened and what is currently true.`;
}

// ---------------------------------------------------------------------------
// Composition (pure)
// ---------------------------------------------------------------------------

export interface ComposeOptions {
  /** `false` omits the `# ` title line for surfaces that render their own header. */
  includeTitle?: boolean;
}

/**
 * The document, in order. Pure: no DB, no clock, no network.
 *
 * Every section formatter returns `''` for an empty week and otherwise leads
 * with `\n\n`, so concatenation is the whole layout algorithm and a quiet week
 * simply produces a shorter document rather than a skeleton of empty headings.
 * Two sections never disappear — the executive summary (which always states the
 * risk level and what was checked) and the recommendations (whose quiet-week
 * output is an explicit `no_action_needed` item) — so even the emptiest week is
 * a valid, honest document that answers "do I need to do anything".
 */
export function composeOrgReportBody(
  data: OrgReportSectionData,
  opts: ComposeOptions = {},
): string {
  const { includeTitle = true } = opts;

  const title = includeTitle
    ? `# ${orgReportTitle(data.organizationDisplayName, data.daoName, data.weekOf)}`
    : '';

  const body = [
    title,
    formatExecutiveSummarySection(data.summary, data.summaryProse),
    formatRecommendationsSection(data.recommendations),
    formatAttentionAlertsSection([...data.alerts]),
    formatUpcomingSection([...data.upcoming], data.staleActiveCount),
    formatWhaleContextSection([...data.whales]),
    data.attribution ? formatScoreAttributionSection(data.attribution) : '',
    formatConciergeNotesSection(
      data.notes,
      formatUnresolvedNotesNotice(data.unresolvedNotesCount, data.daoName),
    ),
    formatMethodologyFooter(),
  ].join('');

  // Without a title the first section's own `\n\n` would open the document with
  // two blank lines.
  return body.trimStart();
}

// ---------------------------------------------------------------------------
// Generation (the only DB-touching function here)
// ---------------------------------------------------------------------------

/** Exported for ./store.ts, which resolves the same two rows before it can look up a stored report. */
export async function loadOrganization(organizationId: string): Promise<OrgReportOrganization> {
  const [row] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      brandingDisplayName: organizations.brandingDisplayName,
      brandingLogoUrl: organizations.brandingLogoUrl,
      brandingPrimaryColor: organizations.brandingPrimaryColor,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!row) throw new Error(`[org-report] organization ${organizationId} not found`);

  return {
    ...row,
    displayName: row.brandingDisplayName?.trim() || row.name,
  };
}

/** Exported for ./store.ts — see `loadOrganization`. */
export async function loadDao(daoSlug: string): Promise<OrgReportDao> {
  const [row] = await db
    .select({ id: daos.id, name: daos.name, slug: daos.slug })
    .from(daos)
    .where(eq(daos.slug, daoSlug))
    .limit(1);

  if (!row) throw new Error(`[org-report] dao ${daoSlug} not found`);
  return row;
}

/**
 * Builds one organization's weekly report for one DAO.
 *
 * The six section fetchers are independent reads and run concurrently. `weekOf`
 * is threaded into every one of them (and into `buildRecommendations`) rather
 * than each module reading its own clock, so the whole document describes a
 * single instant and re-running it for a past `weekOf` reproduces that week.
 */
export async function generateOrgReport(
  organizationId: string,
  daoSlug: string,
  opts: GenerateOrgReportOptions = {},
): Promise<OrgReport> {
  const weekOf = opts.weekOf ?? new Date();

  const [organization, dao] = await Promise.all([
    loadOrganization(organizationId),
    loadDao(daoSlug),
  ]);

  const [alertRows, whales, attribution, upcoming, staleActiveCount, orgNotes] = await Promise.all([
    fetchAttentionAlerts(dao.id, weekOf),
    fetchWhaleContext(dao.id, weekOf),
    fetchScoreAttribution(dao.id, weekOf),
    fetchUpcomingWithQuorum(dao.id, weekOf),
    countStaleActiveProposals(dao.id, weekOf),
    fetchOrgNotesForDao(organizationId, dao.id),
  ]);

  const alerts = describeAlerts(alertRows);
  const recommendations = buildRecommendations({ upcoming, whales, alerts, attribution }, weekOf);

  const summary = buildExecutiveSummary({
    organizationName: organization.displayName,
    daoName: dao.name,
    weekOf,
    upcoming,
    whales,
    alerts,
    attribution,
    recommendations,
  });
  const summaryProse = await writeExecutiveSummaryProse(summary, { useAi: opts.useAi });

  const data: OrgReportSectionData = {
    organizationDisplayName: organization.displayName,
    daoName: dao.name,
    weekOf,
    summary,
    summaryProse,
    recommendations,
    alerts,
    upcoming,
    staleActiveCount,
    whales,
    attribution,
    notes: orgNotes.notes,
    unresolvedNotesCount: orgNotes.unresolvedCount,
  };

  return {
    title: orgReportTitle(organization.displayName, dao.name, weekOf),
    weekOf,
    organization,
    dao,
    summary,
    recommendations,
    body: composeOrgReportBody(data, { includeTitle: true }),
    bodyWithoutTitle: composeOrgReportBody(data, { includeTitle: false }),
  };
}
