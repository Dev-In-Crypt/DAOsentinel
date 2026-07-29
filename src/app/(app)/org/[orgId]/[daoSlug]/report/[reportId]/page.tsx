import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { resolveOrgReportAccess } from '@/server/api/org-report-access';
import { loadDao } from '@/server/services/org-report';
import {
  formatWeekRange,
  getOrgReportById,
  listOrgReports,
} from '@/server/services/org-report/store';
import {
  formatInstantUtc,
  OrgReportBody,
  OrgReportHistory,
  RiskBadge,
} from '@/components/org/OrgReportView';
import { isValidUuid } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ daoSlug: string }>;
}) {
  const { daoSlug } = await params;
  return { title: `${daoSlug} archived report — DAO Sentinel` };
}

/**
 * One archived week of the paid report (TODO-072).
 *
 * Reads only — an archived report is never regenerated. Re-running the
 * pipeline for a past week would quietly rewrite what the customer was told at
 * the time, which is the opposite of what an archive is for.
 *
 * `getOrgReportById` filters on the organization and DAO inside the query, so
 * a valid session for Org A cannot pull Org B's report by id.
 */
export default async function ArchivedOrgReportPage({
  params,
}: {
  params: Promise<{ orgId: string; daoSlug: string; reportId: string }>;
}) {
  const { orgId, daoSlug, reportId } = await params;

  const access = await resolveOrgReportAccess(orgId, daoSlug);
  if (!access) redirect('/login');

  // A malformed id would otherwise reach Postgres as an invalid uuid literal
  // and surface as a 500 instead of a 404.
  if (!isValidUuid(reportId)) notFound();

  const dao = await loadDao(daoSlug);
  const report = await getOrgReportById(reportId, orgId, dao.id);
  if (!report) notFound();

  const history = await listOrgReports(orgId, dao.id);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href={`/org/${orgId}/${daoSlug}/report`}
          className="inline-flex items-center gap-2 text-sm text-[hsl(var(--indigo-bright))] hover:underline"
        >
          ← Latest report
        </Link>
        <a
          href={`/api/org/${orgId}/${daoSlug}/report.pdf?id=${report.id}`}
          className="text-sm mono text-[hsl(var(--indigo-bright))] hover:underline"
        >
          Download PDF ↓
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-[hsl(var(--text-dim))]">
        <span className="mono text-[hsl(var(--text))]">{formatWeekRange(report.weekStart)}</span>
        <RiskBadge level={report.riskLevel} />
        <span>Generated {formatInstantUtc(report.generatedAt)}</span>
        <span aria-hidden>·</span>
        <span>{report.sentAt ? `Emailed ${formatInstantUtc(report.sentAt)}` : 'Not emailed'}</span>
      </div>

      <OrgReportBody body={report.body} />

      <OrgReportHistory items={history} orgId={orgId} daoSlug={daoSlug} currentId={report.id} />

      <p className="text-xs text-[hsl(var(--text-dim))]">
        Archived exactly as generated for that week. The underlying governance data has moved on
        since; this page is not recomputed.
      </p>
    </div>
  );
}
