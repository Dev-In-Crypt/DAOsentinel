import Link from 'next/link';
import { db } from '@/server/db';
import { daos, proposals, alerts } from '@/server/db/schema';
import { desc, eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScoreGauge } from '@/components/charts/ScoreGauge';
import { RiskBadge } from '@/components/proposals/RiskBadge';
import { timeAgo, timeRemaining, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DashboardHome() {
  const [trending, recentAlerts, topDaos] = await Promise.all([
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
      .limit(10),
    db.select().from(daos).orderBy(desc(daos.democracyScore)).limit(5),
  ]).catch(() => [[], [], []] as const);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Live signal from across DAO governance.</p>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">Trending proposals</h2>
          <Link href="/proposals" className="text-sm text-primary hover:underline">
            View all →
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {trending.map(({ proposal: p, dao }) => (
            <Link key={p.id} href={`/proposals/${p.id}`} className="group">
              <Card className="h-full transition-colors group-hover:border-primary/50">
                <CardHeader>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{dao.name}</span>
                    <span>{timeRemaining(p.endTimestamp)}</span>
                  </div>
                  <CardTitle className="line-clamp-2 text-base">{p.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="line-clamp-3 text-sm text-muted-foreground">
                    {p.aiSummary ?? 'Summary pending…'}
                  </p>
                  <div className="flex items-center gap-2 text-xs">
                    <RiskBadge level={p.aiRiskLevel} />
                    <Badge variant="outline">{formatNumber(p.votesCount ?? 0)} votes</Badge>
                    {p.hasWhaleVote && <Badge variant="warning">🐳 whale</Badge>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
          {!trending.length && (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No active proposals yet — waiting for the next Snapshot sync.
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-xl font-semibold">Recent alerts</h2>
          <Card>
            <CardContent className="divide-y p-0">
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
                      <div className="font-medium">{alert.title}</div>
                      <div className="text-sm text-muted-foreground">{alert.description}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        <Link href={`/daos/${dao.slug}`} className="hover:underline">
                          {dao.name}
                        </Link>{' '}
                        · {timeAgo(alert.createdAt)}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No alerts yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">Top Democracy Scores</h2>
          <Card>
            <CardContent className="divide-y p-0">
              {topDaos.map((d) => (
                <Link
                  key={d.id}
                  href={`/daos/${d.slug}`}
                  className="flex items-center gap-3 p-3 hover:bg-accent"
                >
                  <ScoreGauge score={Number(d.democracyScore ?? 0)} size="sm" />
                  <div className="flex-1">
                    <div className="font-medium">{d.name}</div>
                    <div className="text-xs text-muted-foreground">{d.governanceToken}</div>
                  </div>
                </Link>
              ))}
              {!topDaos.length && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Scores pending first computation.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
