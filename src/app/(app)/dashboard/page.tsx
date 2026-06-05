import Link from 'next/link';
import { db } from '@/server/db';
import { daos, proposals, alerts } from '@/server/db/schema';
import { asc, desc, and, eq, gt, sql } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { ScoreGauge } from '@/components/charts/ScoreGauge';
import { RiskBadge } from '@/components/proposals/RiskBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { timeAgo, timeRemaining, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Dashboard — DAO Sentinel',
};

export default async function DashboardHome() {
  const now = new Date();
  const [trending, recentAlerts, topDaos, counts, upcoming] = await Promise.all([
    db
      .select({ proposal: proposals, dao: daos })
      .from(proposals)
      .innerJoin(daos, eq(daos.id, proposals.daoId))
      .where(eq(proposals.state, 'active'))
      .orderBy(desc(proposals.votesCount))
      .limit(6),
    db
      .select({ alert: alerts, dao: daos })
      .from(alerts)
      .innerJoin(daos, eq(daos.id, alerts.daoId))
      .orderBy(desc(alerts.createdAt))
      .limit(8),
    db.select().from(daos).orderBy(desc(daos.democracyScore)).limit(5),
    db.execute(sql`
      SELECT
        (SELECT count(*) FROM proposals WHERE state = 'active')::int AS active_props,
        (SELECT count(*) FROM alerts WHERE created_at > now() - interval '24 hours')::int AS alerts_24h,
        (SELECT round(avg(democracy_score)::numeric, 1) FROM daos WHERE democracy_score::numeric > 0) AS avg_score
    `),
    db
      .select({ proposal: proposals, dao: daos })
      .from(proposals)
      .innerJoin(daos, eq(daos.id, proposals.daoId))
      .where(and(eq(proposals.state, 'active'), gt(proposals.endTimestamp, now)))
      .orderBy(asc(proposals.endTimestamp))
      .limit(15),
  ]).catch(
    () =>
      [[], [], [], [{ active_props: 0, alerts_24h: 0, avg_score: 0 }], []] as [
        Awaited<ReturnType<typeof db.select>['from']> extends never
          ? never
          : Array<{ proposal: typeof proposals.$inferSelect; dao: typeof daos.$inferSelect }>,
        Array<{ alert: typeof alerts.$inferSelect; dao: typeof daos.$inferSelect }>,
        Array<typeof daos.$inferSelect>,
        Array<{ active_props: number; alerts_24h: number; avg_score: string | number | null }>,
        Array<{ proposal: typeof proposals.$inferSelect; dao: typeof daos.$inferSelect }>,
      ],
  );

  // Bucket upcoming by urgency
  const d24 = new Date(now.getTime() + 24 * 3600 * 1000);
  const d3 = new Date(now.getTime() + 3 * 24 * 3600 * 1000);
  const d7 = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  const buckets = {
    urgent: [] as typeof upcoming,
    soon: [] as typeof upcoming,
    watch: [] as typeof upcoming,
  };
  for (const row of upcoming) {
    const end = row.proposal.endTimestamp;
    if (end <= d24) buckets.urgent.push(row);
    else if (end <= d3) buckets.soon.push(row);
    else if (end <= d7) buckets.watch.push(row);
  }
  const hasAnyDeadline =
    buckets.urgent.length + buckets.soon.length + buckets.watch.length > 0;

  const stats = (counts as unknown as Array<{
    active_props: number;
    alerts_24h: number;
    avg_score: string | number | null;
  }>)[0];

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Mission control"
        title="Dashboard"
        description="Live signal from across DAO governance — trending proposals, fresh alerts, top scores."
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="stat-cell">
          <div className="lab">Active proposals</div>
          <div className="val">{stats?.active_props ?? 0}</div>
        </div>
        <div className="stat-cell">
          <div className="lab">Alerts · 24h</div>
          <div className="val"><span className="accent-warn">{stats?.alerts_24h ?? 0}</span></div>
        </div>
        <div className="stat-cell">
          <div className="lab">Avg democracy score</div>
          <div className="val">
            <span className="accent">{Number(stats?.avg_score ?? 0).toFixed(1)}</span>
            <span style={{ fontSize: 14, color: 'hsl(var(--text-dim))' }}> / 100</span>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="app-sec-title">Trending proposals</h2>
          <Link href="/proposals" className="text-sm text-[hsl(var(--indigo-bright))] hover:underline">
            View all →
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {trending.map(({ proposal: p, dao }) => (
            <Link key={p.id} href={`/proposals/${p.id}`} className="group">
              <div className="glass-card h-full">
                <div className="mb-3 flex items-center justify-between text-xs mono text-[hsl(var(--text-dim))]">
                  <span>{dao.name}</span>
                  <span>{timeRemaining(p.endTimestamp)}</span>
                </div>
                <div
                  className="mb-3 line-clamp-2 text-base font-semibold leading-snug"
                  style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}
                >
                  {p.title}
                </div>
                <p className="mb-4 line-clamp-3 text-sm text-[hsl(var(--text-dim))]">
                  {p.aiSummary ?? 'Summary pending…'}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <RiskBadge level={p.aiRiskLevel} />
                  <Badge variant="outline">{formatNumber(p.votesCount ?? 0)} votes</Badge>
                  {p.hasWhaleVote && <Badge variant="warning">🐳 whale</Badge>}
                </div>
              </div>
            </Link>
          ))}
          {!trending.length && (
            <div className="glass-card col-span-full py-12 text-center text-sm text-[hsl(var(--text-dim))]">
              No active proposals yet — waiting for the next Snapshot sync.
            </div>
          )}
        </div>
      </section>

      {/* Upcoming deadlines */}
      {hasAnyDeadline && (
        <section>
          <h2 className="app-sec-title">Upcoming deadlines</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {(
              [
                {
                  key: 'urgent',
                  label: 'Ending in 24h',
                  badge: 'URGENT',
                  color: 'hsl(var(--rose))',
                  items: buckets.urgent,
                },
                {
                  key: 'soon',
                  label: 'Ending in 3 days',
                  badge: 'SOON',
                  color: 'hsl(var(--amber))',
                  items: buckets.soon,
                },
                {
                  key: 'watch',
                  label: 'Ending this week',
                  badge: 'WATCH',
                  color: 'hsl(var(--indigo-bright))',
                  items: buckets.watch,
                },
              ] as const
            )
              .filter((col) => col.items.length > 0)
              .map((col) => (
                <div key={col.key} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between text-xs mono uppercase tracking-wider text-[hsl(var(--text-dim))]">
                    <span>{col.label}</span>
                    <span
                      className="rounded px-2 py-0.5 text-[10px] tracking-wider"
                      style={{
                        background: `${col.color}1f`,
                        color: col.color,
                        boxShadow: `inset 0 0 0 1px ${col.color}55`,
                      }}
                    >
                      {col.badge} · {col.items.length}
                    </span>
                  </div>
                  {col.items.slice(0, 6).map(({ proposal: p, dao }) => (
                    <Link
                      key={p.id}
                      href={`/proposals/${p.id}`}
                      className="group block"
                    >
                      <div
                        className="glass-card space-y-2 py-3"
                        style={{ borderLeft: `3px solid ${col.color}`, paddingLeft: 16 }}
                      >
                        <div className="text-xs mono text-[hsl(var(--text-dim))]">
                          {dao.name}
                        </div>
                        <div
                          className="line-clamp-2 text-sm font-semibold leading-snug"
                          style={{
                            fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
                          }}
                        >
                          {p.title}
                        </div>
                        <div className="flex items-center justify-between text-xs mono">
                          <span style={{ color: col.color }}>
                            {timeRemaining(p.endTimestamp)}
                          </span>
                          <RiskBadge level={p.aiRiskLevel} />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ))}
          </div>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="app-sec-title">Recent alerts</h2>
            <Link href="/alerts" className="text-sm text-[hsl(var(--indigo-bright))] hover:underline">
              View feed →
            </Link>
          </div>
          <div className="glass-card divide-y divide-[hsl(var(--line))] p-0">
            {recentAlerts.length ? (
              recentAlerts.map(({ alert, dao }) => (
                <div key={alert.id} className="flex items-start gap-3 p-4">
                  <Badge
                    variant={
                      alert.severity === 'critical'
                        ? 'destructive'
                        : alert.severity === 'warning'
                          ? 'warning'
                          : 'secondary'
                    }
                  >
                    {alert.severity}
                  </Badge>
                  <div className="flex-1">
                    <div
                      className="font-semibold"
                      style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}
                    >
                      {alert.title}
                    </div>
                    <div className="text-sm text-[hsl(var(--text-dim))]">{alert.description}</div>
                    <div className="mt-1 text-xs mono text-[hsl(var(--text-faint))]">
                      <Link href={`/daos/${dao.slug}`} className="hover:text-[hsl(var(--indigo-bright))]">
                        {dao.name}
                      </Link>{' '}
                      · {timeAgo(alert.createdAt)}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-sm text-[hsl(var(--text-dim))]">No alerts yet.</div>
            )}
          </div>
        </div>

        <div>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="app-sec-title">Top scores</h2>
            <Link href="/daos" className="text-sm text-[hsl(var(--indigo-bright))] hover:underline">
              Leaderboard →
            </Link>
          </div>
          <div className="glass-card divide-y divide-[hsl(var(--line))] p-0">
            {topDaos.map((d) => (
              <Link
                key={d.id}
                href={`/daos/${d.slug}`}
                className="flex items-center gap-3 p-3 transition-colors hover:bg-[hsl(var(--accent)/0.4)]"
              >
                <ScoreGauge score={Number(d.democracyScore ?? 0)} size="sm" />
                <div className="flex-1">
                  <div
                    className="font-medium"
                    style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}
                  >
                    {d.name}
                  </div>
                  <div className="text-xs mono text-[hsl(var(--text-dim))]">{d.governanceToken}</div>
                </div>
              </Link>
            ))}
            {!topDaos.length && (
              <div className="p-6 text-center text-sm text-[hsl(var(--text-dim))]">
                Scores pending first computation.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
