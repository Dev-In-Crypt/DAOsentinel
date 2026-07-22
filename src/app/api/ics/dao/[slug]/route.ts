import { NextResponse } from 'next/server';
import { asc, and, eq, gt } from 'drizzle-orm';
import { db } from '@/server/db';
import { proposals, daos } from '@/server/db/schema';
import { toIcs, type IcsEvent } from '@/lib/ics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_BASE = process.env.NEXTAUTH_URL || 'https://www.daosentinel.xyz';

/**
 * Per-DAO ICS feed of active-proposal deadlines — see
 * docs/specs/ics-calendar-export.md. Public, read-only, no auth (mirrors
 * the rest of the free public API surface).
 *
 * URL has no literal .ics suffix — same typedRoutes limitation documented
 * on the Atom feed route (src/app/api/feed/dao/[slug]/route.ts): a dynamic
 * segment combined with a dot suffix fails `next build`'s type check.
 * Content-Type governs calendar-app behavior, not the URL extension.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [dao] = await db.select().from(daos).where(eq(daos.slug, slug)).limit(1);
  if (!dao) {
    return new NextResponse('DAO not found', { status: 404 });
  }

  const now = new Date();
  const rows = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.daoId, dao.id), eq(proposals.state, 'active'), gt(proposals.endTimestamp, now)))
    .orderBy(asc(proposals.endTimestamp))
    .limit(50);

  const events: IcsEvent[] = rows.map((p) => ({
    uid: `proposal-${p.id}@daosentinel.xyz`,
    title: `${dao.name}: ${p.title}`,
    start: p.startTimestamp,
    end: p.endTimestamp,
    url: `${APP_BASE}/proposals/${p.id}`,
  }));

  const ics = toIcs(events, `DAO Sentinel — ${dao.name} Deadlines`, now);

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
