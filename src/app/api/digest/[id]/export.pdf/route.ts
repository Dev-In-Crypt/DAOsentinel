import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { digests } from '@/server/db/schema';
import { renderDigestPdf } from '@/lib/pdf/digest-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PDF export of a single public weekly digest — mirrors the page at
 * src/app/(app)/digest/[id]/page.tsx (same lookup, same "not found" behavior).
 * Public, no auth: the digest archive itself has no session gate.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const [d] = await db.select().from(digests).where(eq(digests.id, id)).limit(1);
  if (!d) {
    return new NextResponse('Not found', { status: 404 });
  }

  // Fixed locale, not `undefined` (server OS locale) — the standard PDF font
  // can't render non-Latin month names anyway, and this keeps the date
  // deterministic regardless of what locale the server process runs under.
  const weekOfLabel = new Date(d.weekOf).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const pdf = await renderDigestPdf({ title: d.title, weekOfLabel, body: d.body });

  const datestamp = new Date(d.weekOf).toISOString().slice(0, 10);
  const filename = `dao-sentinel-digest-${datestamp}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
