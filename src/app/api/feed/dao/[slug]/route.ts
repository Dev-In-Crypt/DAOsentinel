import { NextResponse } from 'next/server';
import { desc, and, eq, inArray } from 'drizzle-orm';
import { db } from '@/server/db';
import { alerts, daos } from '@/server/db/schema';
import { toAtomFeed, type FeedEntry } from '@/lib/feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_BASE = process.env.NEXTAUTH_URL || 'https://www.daosentinel.xyz';

/**
 * Per-DAO Atom feed of governance alerts — see
 * docs/specs/governance-rss-feed.md. Public, read-only, no auth. Optional
 * ?severity=warning,critical to exclude info-level noise.
 *
 * URL has no literal .xml suffix (spec suggested /api/feed/dao/[slug].xml) —
 * Next's typed-routes generator can't validate a dynamic segment combined
 * with a dot suffix (`[slug].xml` fails `next build`'s type check on this
 * route). Content-Type governs feed-reader behavior, not the URL extension,
 * so this is functionally identical.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [dao] = await db.select().from(daos).where(eq(daos.slug, slug)).limit(1);
  if (!dao) {
    return new NextResponse('DAO not found', { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const severityParam = searchParams.get('severity');
  const severities = severityParam
    ? severityParam.split(',').map((s) => s.trim()).filter(Boolean)
    : null;

  const rows = await db
    .select()
    .from(alerts)
    .where(
      and(
        eq(alerts.daoId, dao.id),
        severities && severities.length ? inArray(alerts.severity, severities) : undefined,
      ),
    )
    .orderBy(desc(alerts.createdAt))
    .limit(50);

  const entries: FeedEntry[] = rows.map((alert) => ({
    id: `tag:daosentinel.xyz,2026:alert-${alert.id}`,
    title: alert.title,
    summary: alert.description,
    link: alert.proposalId ? `${APP_BASE}/proposals/${alert.proposalId}` : `${APP_BASE}/daos/${dao.slug}`,
    updated: alert.createdAt,
  }));

  const xml = toAtomFeed(
    entries,
    `DAO Sentinel — ${dao.name} Alerts`,
    `${APP_BASE}/api/feed/dao/${dao.slug}`,
  );

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
