import { NextResponse } from 'next/server';
import { desc, asc, eq, and, inArray } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { daos, proposals, alerts, scoreHistory, users, orgNotes } from '@/server/db/schema';
import { requireOrgAccess } from '@/server/api/org-auth';
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

  const [active, recent, recentAlerts, history, notes] = await Promise.all([
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
    db
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
      .where(eq(orgNotes.organizationId, organization.id))
      .orderBy(desc(orgNotes.createdAt))
      .limit(50),
  ]);

  // Same best-effort subject-title resolution as the dashboard page.
  const proposalIds = notes.filter((n) => n.subjectType === 'proposal').map((n) => n.subjectId);
  const alertIds = notes.filter((n) => n.subjectType === 'alert').map((n) => n.subjectId);
  const [subjectProposals, subjectAlerts] = await Promise.all([
    proposalIds.length
      ? db
          .select({ id: proposals.id, title: proposals.title })
          .from(proposals)
          .where(inArray(proposals.id, proposalIds))
      : Promise.resolve([]),
    alertIds.length
      ? db
          .select({ id: alerts.id, title: alerts.title })
          .from(alerts)
          .where(inArray(alerts.id, alertIds))
      : Promise.resolve([]),
  ]);
  const proposalTitleById = new Map(subjectProposals.map((p) => [p.id, p.title]));
  const alertTitleById = new Map(subjectAlerts.map((a) => [a.id, a.title]));

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
    notes: notes.map((n) => ({
      subjectType: n.subjectType,
      subjectLabel:
        (n.subjectType === 'proposal'
          ? proposalTitleById.get(n.subjectId)
          : n.subjectType === 'alert'
            ? alertTitleById.get(n.subjectId)
            : undefined) ?? n.subjectId,
      note: n.note,
      authorLabel: n.authorName ?? n.authorEmail,
      createdAt: n.createdAt,
    })),
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
