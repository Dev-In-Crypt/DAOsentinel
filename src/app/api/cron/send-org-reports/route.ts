import { NextResponse } from 'next/server';
import { requireCronAuth } from '@/server/api/cron-auth';
import { runAllOrgReportsJob } from '@/server/jobs/send-org-reports';
import { isValidUuid } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * TODO-073: the scheduled weekly org-report run.
 *
 * Wired into .github/workflows/cron.yml at Monday 09:00 UTC — an hour after
 * the public digest, so the two mail sends do not contend and the org reports
 * are built from the same overnight score recompute.
 *
 * The older /api/cron/send-org-digest stays as the single-org manual path.
 * This one takes no required parameters and covers every active organization.
 *
 * Optional query params, both for operators rather than the schedule:
 *   organizationId — restrict the run to one org (must be a valid uuid)
 *   force=1        — re-send weeks already marked sent
 *
 * `force` is off unless explicitly asked for: the whole point of the `sentAt`
 * guard is that a retried workflow run cannot mail paying customers twice.
 */
export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId') ?? undefined;
  const force = url.searchParams.get('force') === '1';

  if (organizationId && !isValidUuid(organizationId)) {
    return NextResponse.json(
      { ok: false, error: 'organizationId is not a valid id' },
      { status: 400 },
    );
  }

  const result = await runAllOrgReportsJob({ organizationId, force });
  return NextResponse.json({ ok: true, result });
}
