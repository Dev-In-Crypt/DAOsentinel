import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { users } from '@/server/db/schema';
import { requireOrgAccess } from '@/server/api/org-auth';
import { generateOrgReport } from '@/server/services/org-report';
import { renderDigestPdf } from '@/lib/pdf/digest-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PDF of the paid org weekly report — the downloadable twin of
 * src/app/(app)/org/[orgId]/[daoSlug]/report/page.tsx.
 *
 * Gated identically to that page and to the CSV export beside it: session ->
 * user -> requireOrgAccess -> explicit orgId cross-check, failing closed with
 * an undifferentiated 404. The cross-check is not redundant: requireOrgAccess
 * only proves *some* org the caller belongs to covers daoSlug, so without it a
 * member of Org A could pull a PDF under Org B's id.
 *
 * Reuses `renderDigestPdf`, which already takes markdown — the same renderer
 * the public digest's PDF uses. Note it strips characters the standard PDF
 * fonts can't encode, so the report's section emoji are dropped from the PDF
 * while all the text survives.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ orgId: string; daoSlug: string }> },
) {
  const { orgId, daoSlug } = await ctx.params;

  const session = await auth();
  if (!session?.user?.email) {
    return new NextResponse('Not found', { status: 404 });
  }

  const [user] = await db.select().from(users).where(eq(users.email, session.user.email)).limit(1);
  if (!user) {
    return new NextResponse('Not found', { status: 404 });
  }

  const access = await requireOrgAccess(user.id, daoSlug);
  if (!access.ok) {
    return new NextResponse('Not found', { status: 404 });
  }
  if (access.organization.id !== orgId) {
    return new NextResponse('Not found', { status: 404 });
  }

  const report = await generateOrgReport(orgId, daoSlug);

  // Fixed locale, not the server's — keeps the label deterministic wherever
  // the process runs, and the standard PDF fonts can't render non-Latin month
  // names anyway.
  const weekOfLabel = report.weekOf.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // The PDF prints its own title block, so hand it the untitled body rather
  // than doubling the heading.
  const pdf = await renderDigestPdf({
    title: report.title,
    weekOfLabel,
    body: report.bodyWithoutTitle,
  });

  const datestamp = report.weekOf.toISOString().slice(0, 10);
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
