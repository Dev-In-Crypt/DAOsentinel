import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { organizations } from '@/server/db/schema';
import { requireCronAuth } from '@/server/api/cron-auth';
import { runOrgDigestJob } from '@/server/jobs/send-org-digest';
import { isValidUuid } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * TODO-055: Org-scoped private weekly report.
 *
 * Unlike /api/cron/send-digest (the public path, which broadcasts to every
 * active newsletter subscriber unconditionally), this route requires an
 * explicit `organizationId` + `daoSlug` and sends to exactly one org's
 * members for exactly one DAO in its scope.
 *
 * The scheduled path is now /api/cron/send-org-reports (TODO-073), which walks
 * every active org on Mondays. This route remains the manual, single-pair
 * trigger — for a customer who needs their report re-cut mid-week, or to test
 * one org without touching the others.
 *
 * Sends are idempotent per week (see `sendOrgDigestToMembers`), so re-hitting
 * this route after the schedule has run is a no-op. Pass `force=1` to
 * deliberately re-send a week already delivered.
 *
 * Fails closed the same way `requireOrgAccess` does: an unknown org, an
 * inactive org, and a daoSlug outside the org's scope all return the same
 * 404 rather than leaking which case applied.
 */
export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId');
  const daoSlug = url.searchParams.get('daoSlug');

  if (!organizationId || !daoSlug) {
    return NextResponse.json(
      { ok: false, error: 'organizationId and daoSlug query params are required' },
      { status: 400 },
    );
  }
  if (!isValidUuid(organizationId)) {
    return NextResponse.json({ ok: false, error: 'organizationId is not a valid id' }, { status: 400 });
  }

  const [org] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, organizationId), eq(organizations.active, true)))
    .limit(1);

  if (!org || !org.daoSlugs.includes(daoSlug)) {
    return NextResponse.json(
      { ok: false, error: 'organization not found or dao out of scope' },
      { status: 404 },
    );
  }

  const force = url.searchParams.get('force') === '1';
  const result = await runOrgDigestJob(organizationId, daoSlug, { force });
  return NextResponse.json({ ok: true, result });
}
