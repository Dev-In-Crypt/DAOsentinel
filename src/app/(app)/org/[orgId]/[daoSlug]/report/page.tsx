import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { resolveOrgReportAccess } from '@/server/api/org-report-access';
import {
  formatWeekRange,
  getOrGenerateOrgReport,
  listOrgReports,
} from '@/server/services/org-report/store';
import {
  formatInstantUtc,
  OrgReportBody,
  OrgReportHistory,
  RiskBadge,
} from '@/components/org/OrgReportView';

// Session-gated and org-scoped: never prerendered, never shared across users.
// It is no longer expensive on the common path — the report is read from
// `org_reports` and only computed on the week's first view (TODO-072) — but
// caching a paid customer's private document at the edge would still be wrong.
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgId: string; daoSlug: string }>;
}) {
  const { daoSlug } = await params;
  return { title: `${daoSlug} weekly report — DAO Sentinel` };
}

/**
 * The paid org weekly report for the current week, readable in the browser.
 *
 * Originally the report existed only as an email: the sole way to produce one
 * was to curl /api/cron/send-org-digest with the server's CRON_SECRET, which
 * mailed every org member immediately — so nobody could read it before it went
 * out, and a customer could not read it at all.
 *
 * Since TODO-072 this page reads the stored report rather than regenerating
 * it. The first view of a week computes and stores it; every later view — and
 * the PDF, and the email the Monday cron sends — serves those same bytes, so
 * the customer's document does not change under them between refreshes.
 *
 * It still deliberately does NOT send anything. Delivery stays on the
 * cron-authenticated path.
 */
export default async function OrgReportPage({
  params,
}: {
  params: Promise<{ orgId: string; daoSlug: string }>;
}) {
  const { orgId, daoSlug } = await params;

  const access = await resolveOrgReportAccess(orgId, daoSlug);
  if (!access) redirect('/login');

  const { report, dao } = await getOrGenerateOrgReport(orgId, daoSlug);
  if (!report.id) notFound();

  const history = await listOrgReports(orgId, dao.id);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href={`/org/${orgId}/${daoSlug}`}
          className="inline-flex items-center gap-2 text-sm text-[hsl(var(--indigo-bright))] hover:underline"
        >
          ← Back to dashboard
        </Link>
        <div className="flex items-center gap-4">
          <a
            href={`/api/org/${orgId}/${daoSlug}/report.pdf`}
            className="text-sm mono text-[hsl(var(--indigo-bright))] hover:underline"
          >
            Download PDF ↓
          </a>
          <a
            href={`/api/org/${orgId}/${daoSlug}/export.csv`}
            className="text-sm mono text-[hsl(var(--indigo-bright))] hover:underline"
          >
            Export CSV ↓
          </a>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-[hsl(var(--text-dim))]">
        <span className="mono text-[hsl(var(--text))]">{formatWeekRange(report.weekStart)}</span>
        <RiskBadge level={report.riskLevel} />
        <span>Generated {formatInstantUtc(report.generatedAt)}</span>
        <span aria-hidden>·</span>
        <span>
          {report.sentAt ? `Emailed to your team ${formatInstantUtc(report.sentAt)}` : 'Not yet emailed'}
        </span>
      </div>

      <OrgReportBody body={report.body} />

      <OrgReportHistory items={history} orgId={orgId} daoSlug={daoSlug} currentId={report.id} />

      <p className="text-xs text-[hsl(var(--text-dim))]">
        This report covers the week shown above and is stored as sent. Opening this page never
        emails anyone — delivery runs on its own weekly schedule.
      </p>
    </div>
  );
}
