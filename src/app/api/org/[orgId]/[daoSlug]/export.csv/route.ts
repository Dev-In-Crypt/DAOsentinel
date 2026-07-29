import { NextResponse } from 'next/server';
import { desc, asc, eq, and } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { daos, proposals, alerts, scoreHistory, users } from '@/server/db/schema';
import { requireOrgAccess } from '@/server/api/org-auth';
import { fetchOrgNotesForDao, formatUnresolvedNotesNotice } from '@/server/api/org-notes';
import { formatOrgReportCsv } from '@/lib/org-report-csv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * TODO-060: CSV export of the org dashboard's report data.
 *
 * This is a private, org-scoped download — it must be gated exactly as
 * strictly as the dashboard page it mirrors
 * (src/app/(app)/org/[orgId]/[daoSlug]/page.tsx), not just "reachable by
 * anyone who guesses the URL". Same gate, same order, same fail-closed
 * behavior:
 *   1. session -> user lookup by session email (redirect to /login if either
 *      is missing, same as the page)
 *   2. requireOrgAccess(user.id, daoSlug) — the same org-membership +
 *      active + daoSlug-in-scope check the page uses (see
 *      src/server/api/org-auth.ts). Fails closed with a generic 404 exactly
 *      like the page's `notFound()` — deliberately doesn't distinguish "no
 *      org", "inactive org", and "daoSlug out of scope" in the response.
 *   3. explicit access.organization.id !== orgId cross-check — requireOrgAccess
 *      only confirms *some* org the caller belongs to covers daoSlug; it
 *      doesn't know which org the route's orgId param claims. Without this,
 *      a member of Org A could hit /api/org/<org-B-id>/<slug-in-A-scope>/export.csv
 *      and download a report under another org's id. The page has the exact
 *      same comment/check for the exact same reason.
 *
 * Queries mirror the dashboard page's queries byte-for-byte (same filters,
 * ordering, and limits) so the exported CSV always matches what's on screen.
 * As of TODO-069 the curated-notes half of that invariant is enforced rather
 * than merely maintained by hand: both this route and the page call the same
 * `fetchOrgNotesForDao` helper (src/server/api/org-notes.ts), so the note set,
 * the DAO scoping, and the excluded-note copy cannot drift apart.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ orgId: string; daoSlug: string }> },
) {
  const { orgId, daoSlug } = await ctx.params;

  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const [user] = await db.select().from(users).where(eq(users.email, session.user.email)).limit(1);
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const access = await requireOrgAccess(user.id, daoSlug);
  if (!access.ok) {
    return new NextResponse('Not found', { status: 404 });
  }

  // See function-level comment: cross-check the route's orgId against the
  // org requireOrgAccess actually resolved — mirrors the dashboard page's
  // identical check.
  if (access.organization.id !== orgId) {
    return new NextResponse('Not found', { status: 404 });
  }

  const organization = access.organization;

  const [dao] = await db.select().from(daos).where(eq(daos.slug, daoSlug)).limit(1);
  if (!dao) {
    return new NextResponse('Not found', { status: 404 });
  }

  const [active, recent, recentAlerts, history, curatedNotes] = await Promise.all([
    db
      .select()
      .from(proposals)
      .where(and(eq(proposals.daoId, dao.id), eq(proposals.state, 'active')))
      .orderBy(desc(proposals.endTimestamp))
      .limit(10),
    db
      .select()
      .from(proposals)
      .where(eq(proposals.daoId, dao.id))
      .orderBy(desc(proposals.createdAt))
      .limit(15),
    db
      .select()
      .from(alerts)
      .where(eq(alerts.daoId, dao.id))
      .orderBy(desc(alerts.createdAt))
      .limit(10),
    db
      .select({ score: scoreHistory.score, computedAt: scoreHistory.computedAt })
      .from(scoreHistory)
      .where(eq(scoreHistory.daoId, dao.id))
      .orderBy(asc(scoreHistory.computedAt))
      .limit(90),
    // TODO-069: the dashboard page's identical call — DAO-scoped notes with
    // the same subject resolution and the same excluded-note policy.
    fetchOrgNotesForDao(organization.id, dao.id),
  ]);

  const csv = formatOrgReportCsv({
    organizationName: organization.brandingDisplayName ?? organization.name,
    daoName: dao.name,
    daoSlug: dao.slug,
    generatedAt: new Date(),
    activeProposals: active.map((p) => ({
      title: p.title,
      state: p.state,
      votesCount: p.votesCount ?? 0,
      timestamp: p.endTimestamp,
    })),
    recentProposals: recent.map((p) => ({
      title: p.title,
      state: p.state,
      votesCount: p.votesCount ?? 0,
      timestamp: p.createdAt,
    })),
    alerts: recentAlerts.map((a) => ({
      severity: a.severity,
      title: a.title,
      description: a.description,
      createdAt: a.createdAt,
    })),
    scoreHistory: history.map((h) => ({ score: Number(h.score), computedAt: h.computedAt })),
    notes: curatedNotes.notes.map((n) => ({
      subjectType: n.subjectType,
      subjectLabel: n.subjectLabel,
      note: n.note,
      authorLabel: n.authorName ?? n.authorEmail,
      createdAt: n.createdAt,
    })),
    notesNotice: formatUnresolvedNotesNotice(curatedNotes.unresolvedCount, dao.name),
  });

  const datestamp = new Date().toISOString().slice(0, 10);
  const filename = `dao-sentinel-${dao.slug}-${datestamp}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
