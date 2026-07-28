import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { organizations } from '@/server/db/schema';
import { requireCronAuth } from '@/server/api/cron-auth';
import { runOrgDigestJob } from '@/server/jobs/send-org-digest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * TODO-055: Org-scoped private weekly report.
 *
 * Unlike /api/cron/send-digest (the public path, which broadcasts to every
 * active newsletter subscriber unconditionally), this route requires an
 * explicit `organizationId` + `daoSlug` and sends to exactly one org's
 * members for exactly one DAO in its scope. Deliberately NOT wired into
 * .github/workflows/cron.yml's schedule — this is a per-org report, not a
 * "run for everyone on a timer" job, and this touches the paid-customer
 * email send path, so it stays a manually-triggerable endpoint (same
 * `requireCronAuth` Bearer-token gate as every other cron route) until an
 * explicit decision is made about batching/scheduling cadence per org.
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

  const result = await runOrgDigestJob(organizationId, daoSlug);
  return NextResponse.json({ ok: true, result });
}
