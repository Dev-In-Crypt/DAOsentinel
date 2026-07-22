import { NextResponse } from 'next/server';
import { asc, and, eq, gt, inArray } from 'drizzle-orm';
import { db } from '@/server/db';
import { proposals, daos, users } from '@/server/db/schema';
import { verifyLinkToken } from '@/lib/telegram';
import { toIcs, type IcsEvent } from '@/lib/ics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_BASE = process.env.NEXTAUTH_URL || 'https://www.daosentinel.xyz';

/**
 * Per-user watchlist ICS feed of active-proposal deadlines across the
 * user's watched DAOs — see docs/specs/ics-calendar-export.md. Keyed by an
 * opaque token (same HMAC link-token scheme already built for Telegram in
 * src/lib/telegram.ts) rather than a session cookie, since calendar apps
 * poll this URL unauthenticated on their own schedule.
 *
 * URL has no literal .ics suffix — same typedRoutes limitation as the
 * per-DAO route in src/app/api/ics/dao/[slug]/route.ts.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const userId = verifyLinkToken(token);
  if (!userId) {
    return new NextResponse('Invalid or expired token', { status: 401 });
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    return new NextResponse('User not found', { status: 404 });
  }

  const watched = user.watchedDaos ?? [];
  if (watched.length === 0) {
    return new NextResponse(toIcs([], 'DAO Sentinel — My Watchlist', new Date()), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'private, max-age=300',
      },
    });
  }

  const now = new Date();
  const rows = await db
    .select({ proposal: proposals, dao: daos })
    .from(proposals)
    .innerJoin(daos, eq(daos.id, proposals.daoId))
    .where(
      and(inArray(daos.slug, watched), eq(proposals.state, 'active'), gt(proposals.endTimestamp, now)),
    )
    .orderBy(asc(proposals.endTimestamp))
    .limit(100);

  const events: IcsEvent[] = rows.map(({ proposal: p, dao }) => ({
    uid: `proposal-${p.id}@daosentinel.xyz`,
    title: `${dao.name}: ${p.title}`,
    start: p.startTimestamp,
    end: p.endTimestamp,
    url: `${APP_BASE}/proposals/${p.id}`,
  }));

  const ics = toIcs(events, 'DAO Sentinel — My Watchlist', now);

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'private, max-age=300',
    },
  });
}
