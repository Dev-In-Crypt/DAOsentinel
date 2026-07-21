import { NextResponse } from 'next/server';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/server/db';
import { alerts, daos } from '@/server/db/schema';
import { toAtomFeed, type FeedEntry } from '@/lib/feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_BASE = process.env.NEXTAUTH_URL || 'https://www.daosentinel.xyz';

/**
 * Global Atom feed of governance alerts — see
 * docs/specs/governance-rss-feed.md. Public, read-only, no auth. Optional
 * ?severity=warning,critical to exclude info-level noise.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const severityParam = searchParams.get('severity');
  const severities = severityParam
    ? severityParam.split(',').map((s) => s.trim()).filter(Boolean)
    : null;

  const rows = await db
    .select({ alert: alerts, dao: daos })
    .from(alerts)
    .innerJoin(daos, eq(daos.id, alerts.daoId))
    .where(severities && severities.length ? inArray(alerts.severity, severities) : undefined)
    .orderBy(desc(alerts.createdAt))
    .limit(50);

  const entries: FeedEntry[] = rows.map(({ alert, dao }) => ({
    id: `tag:daosentinel.xyz,2026:alert-${alert.id}`,
    title: `${alert.title} · ${dao.name}`,
    summary: alert.description,
    link: alert.proposalId ? `${APP_BASE}/proposals/${alert.proposalId}` : `${APP_BASE}/daos/${dao.slug}`,
    updated: alert.createdAt,
  }));

  const xml = toAtomFeed(entries, 'DAO Sentinel — Governance Alerts', `${APP_BASE}/api/feed/alerts.xml`);

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/atom+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
