import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { alerts, orgNotes, proposals, users } from '../db/schema';
import { isValidUuid } from '@/lib/utils';

/**
 * TODO-069: DAO-scoped reads of `org_notes`.
 *
 * `org_notes` rows carry an `organizationId` but no `daoId` — so filtering by
 * organization alone shows every note the org's concierge team wrote, across
 * every DAO in the org's `daoSlugs` scope. An org watching two DAOs saw DAO-B's
 * notes on DAO-A's dashboard, CSV export, and weekly report. (Not a
 * cross-tenant leak — never another customer's notes — but wrong context for a
 * per-DAO artifact.) The DAO is resolved transitively through the note's
 * subject row instead of via a schema change: 'proposal' -> proposals.daoId,
 * 'alert' -> alerts.daoId. Both read sites already looked the subject up to
 * render a title; this selects `daoId` in the same query and filters on it.
 *
 * `subjectId` is TEXT with no FK and no validation (notes are inserted by hand
 * — there is no authoring UI), so a malformed value would reach `inArray` and
 * make Postgres throw "invalid input syntax for type uuid", 500-ing the page.
 * `collectSubjectIds` runs every id through `isValidUuid` first.
 *
 * Lives next to org-auth.ts rather than under services/org-report/ on purpose:
 * the dashboard page and the CSV route must not import a report-generation
 * module. Same shape as org-auth.ts too — pure, unit-testable logic exported
 * alongside the DB-touching fetch that composes it.
 */

/** Window of most-recent notes considered, matching what both surfaces render. */
export const ORG_NOTES_LIMIT = 50;

/** A raw `org_notes` row joined to its author, before DAO scoping. */
export interface OrgNoteRow {
  id: string;
  subjectType: string;
  subjectId: string;
  note: string;
  createdAt: Date;
  authorName: string | null;
  authorEmail: string;
}

/** A note's subject row (proposal or alert), reduced to what scoping and display need. */
export interface OrgNoteSubject {
  daoId: string;
  title: string;
}

/** Subject lookups keyed by id, kept per subject type exactly as the queries are. */
export interface OrgNoteSubjects {
  proposals: Map<string, OrgNoteSubject>;
  alerts: Map<string, OrgNoteSubject>;
}

/** A note whose subject resolved, carrying the subject title for display. */
export interface ResolvedOrgNote extends OrgNoteRow {
  subjectLabel: string;
}

export interface OrgNotesForDao {
  /** Notes whose subject resolved to this DAO, newest first. */
  notes: ResolvedOrgNote[];
  /**
   * Notes in the same window whose subject could not be resolved at all
   * (non-uuid `subjectId`, deleted subject row, or unknown `subjectType`) and
   * so could not be attributed to any DAO. Excluded from `notes`, but counted
   * so every surface can say so — silently dropping them would hide the
   * concierge team's only human-curated content with no signal that a row
   * needs fixing. Notes that resolved to a *different* DAO are not counted
   * here: they are not broken, they simply belong on that DAO's view.
   */
  unresolvedCount: number;
}

/**
 * Collects the subject ids to look up, per subject type. Pure.
 *
 * Every id is validated as a uuid before it is returned, so a malformed
 * `subjectId` can never reach an `inArray(...)` — Postgres rejects a malformed
 * uuid with an error rather than returning zero rows (see `isValidUuid` in
 * src/lib/utils.ts). Ids are de-duplicated; several notes may share a subject.
 */
export function collectSubjectIds(notes: OrgNoteRow[]): {
  proposalIds: string[];
  alertIds: string[];
} {
  const proposalIds = new Set<string>();
  const alertIds = new Set<string>();

  for (const note of notes) {
    if (!isValidUuid(note.subjectId)) continue;
    if (note.subjectType === 'proposal') proposalIds.add(note.subjectId);
    else if (note.subjectType === 'alert') alertIds.add(note.subjectId);
  }

  return { proposalIds: [...proposalIds], alertIds: [...alertIds] };
}

/**
 * Scopes an organization's notes to a single DAO, resolving each note through
 * its subject. Pure — takes already-fetched rows and lookups, so it unit-tests
 * with plain fixture data instead of a mocked Drizzle chain (same discipline
 * as `findAccessibleOrg` in src/server/api/org-auth.ts).
 *
 * Input order is preserved, so a newest-first query stays newest-first.
 */
export function filterNotesForDao(
  notes: OrgNoteRow[],
  subjects: OrgNoteSubjects,
  daoId: string,
): OrgNotesForDao {
  const scoped: ResolvedOrgNote[] = [];
  let unresolvedCount = 0;

  for (const note of notes) {
    const subject =
      note.subjectType === 'proposal'
        ? subjects.proposals.get(note.subjectId)
        : note.subjectType === 'alert'
          ? subjects.alerts.get(note.subjectId)
          : undefined;

    if (!subject) {
      unresolvedCount += 1;
      continue;
    }
    if (subject.daoId !== daoId) continue;

    scoped.push({ ...note, subjectLabel: subject.title });
  }

  return { notes: scoped, unresolvedCount };
}

/**
 * One sentence of copy for the excluded-note count, shared verbatim by every
 * surface so the dashboard and the CSV export can be reconciled against each
 * other. Returns null when there is nothing to report.
 */
export function formatUnresolvedNotesNotice(count: number, daoName: string): string | null {
  if (count <= 0) return null;
  const noun = count === 1 ? 'note' : 'notes';
  const verb = count === 1 ? 'is' : 'are';
  return `${count} concierge ${noun} could not be matched to ${daoName} and ${verb} not shown — the linked proposal or alert is missing, or its subject id is malformed.`;
}

/**
 * Fetches an organization's most recent notes and scopes them to one DAO.
 *
 * The `limit` applies to the org-wide window before DAO scoping (there is no
 * `daoId` column to filter on in SQL), so a DAO shows at most `limit` notes and
 * possibly fewer — the same window both surfaces already read.
 */
export async function fetchOrgNotesForDao(
  organizationId: string,
  daoId: string,
  limit = ORG_NOTES_LIMIT,
): Promise<OrgNotesForDao> {
  const noteRows = await db
    .select({
      id: orgNotes.id,
      subjectType: orgNotes.subjectType,
      subjectId: orgNotes.subjectId,
      note: orgNotes.note,
      createdAt: orgNotes.createdAt,
      authorName: users.name,
      authorEmail: users.email,
    })
    .from(orgNotes)
    .innerJoin(users, eq(users.id, orgNotes.authorUserId))
    .where(eq(orgNotes.organizationId, organizationId))
    .orderBy(desc(orgNotes.createdAt))
    .limit(limit);

  const { proposalIds, alertIds } = collectSubjectIds(noteRows);

  const [subjectProposals, subjectAlerts] = await Promise.all([
    proposalIds.length
      ? db
          .select({ id: proposals.id, daoId: proposals.daoId, title: proposals.title })
          .from(proposals)
          .where(inArray(proposals.id, proposalIds))
      : Promise.resolve([]),
    alertIds.length
      ? db
          .select({ id: alerts.id, daoId: alerts.daoId, title: alerts.title })
          .from(alerts)
          .where(inArray(alerts.id, alertIds))
      : Promise.resolve([]),
  ]);

  return filterNotesForDao(
    noteRows,
    {
      proposals: new Map(subjectProposals.map((p) => [p.id, { daoId: p.daoId, title: p.title }])),
      alerts: new Map(subjectAlerts.map((a) => [a.id, { daoId: a.daoId, title: a.title }])),
    },
    daoId,
  );
}
