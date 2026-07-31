import { NextResponse } from 'next/server';
import { resolveOrgReportAccess } from '@/server/api/org-report-access';
import { loadDao } from '@/server/services/org-report';
import { getOrGenerateOrgReport, getOrgReportById } from '@/server/services/org-report/store';
import { renderDigestPdf } from '@/lib/pdf/digest-pdf';
import { isValidUuid } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PDF of the paid org weekly report — the downloadable twin of
 * src/app/(app)/org/[orgId]/[daoSlug]/report/page.tsx.
 *
 * Without `?id=` this serves the current week, reading the stored report
 * (TODO-072) so the download is byte-identical to what the page showed. With
 * `?id=<uuid>` it serves that archived week, scoped to this org and DAO inside
 * the query — an id from another organization simply does not match.
 *
 * Gated by the same `resolveOrgReportAccess` as both pages, failing closed with
 * an undifferentiated 404.
 *
 * Reuses `renderDigestPdf`, which already takes markdown — the same renderer
 * the public digest's PDF uses. Note it strips characters the standard PDF
 * fonts can't encode, so the report's section emoji are dropped from the PDF
 * while all the text survives.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ orgId: string; daoSlug: string }> },
) {
  const { orgId, daoSlug } = await ctx.params;

  const access = await resolveOrgReportAccess(orgId, daoSlug);
  if (!access) {
    return new NextResponse('Not found', { status: 404 });
  }

  const requestedId = new URL(req.url).searchParams.get('id');

  let report;
  if (requestedId) {
    if (!isValidUuid(requestedId)) {
      return new NextResponse('Not found', { status: 404 });
    }
    const dao = await loadDao(daoSlug);
    report = await getOrgReportById(requestedId, orgId, dao.id);
    if (!report) {
      return new NextResponse('Not found', { status: 404 });
    }
  } else {
    report = (await getOrGenerateOrgReport(orgId, daoSlug)).report;
  }

  // Fixed locale and zone, not the server's — keeps the label deterministic
  // wherever the process runs, and the standard PDF fonts can't render
  // non-Latin month names anyway.
  const weekOfLabel = report.weekStart.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

  // The PDF prints its own title block, so hand it the untitled body rather
  // than doubling the heading.
  const pdf = await renderDigestPdf({
    title: report.title,
    weekOfLabel,
    body: report.bodyWithoutTitle,
    riskLevel: report.riskLevel,
    // TODO-081: the charts, as numbers rather than recovered from the markdown
    // above. Empty for reports archived before that shipped, which then render
    // exactly as they always did.
    visuals: report.visuals,
  });

  const datestamp = report.weekStart.toISOString().slice(0, 10);
  const filename = `dao-sentinel-${daoSlug}-report-${datestamp}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // Private: this is one organization's paid artifact.
      'Cache-Control': 'private, no-store',
    },
  });
}
