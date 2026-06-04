import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { daos, proposals, alerts } from '@/server/db/schema';
import { desc, eq, and } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScoreGauge } from '@/components/charts/ScoreGauge';
import { RiskBadge } from '@/components/proposals/RiskBadge';
import { ProgressBar } from '@/components/ui/progress';
import { formatNumber, formatPct, timeAgo, timeRemaining } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DaoProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [dao] = await db.select().from(daos).where(eq(daos.slug, slug)).limit(1);
  if (!dao) notFound();

  const [active, recent, recentAlerts] = await Promise.all([
    db
      .select()
      .from(proposals)
      .where(and(eq(proposals.daoId, dao.id), eq(proposals.state, 'active')))
      .orderBy(desc(proposals.endTimestamp))
      .limit(10),
    db.select().from(proposals).where(eq(proposals.daoId, dao.id)).orderBy(desc(proposals.createdAt)).limit(15),
    db.select().from(alerts).where(eq(alerts.daoId, dao.id)).orderBy(desc(alerts.createdAt)).limit(10),
  ]);

  const breakdown = (dao.scoreBreakdown ?? {}) as Record<string, number>;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center gap-6">
        <ScoreGauge score={Number(dao.democracyScore ?? 0)} size="lg" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">{dao.name}</h1>
            {dao.chain && <Badge variant="outline">{dao.chain}</Badge>}
            {dao.governanceToken && <Badge variant="secondary">{dao.governanceToken}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {formatNumber(dao.totalProposals ?? 0)} proposals ·{' '}
            {formatPct(Number(dao.avgParticipationRate ?? 0) * 100)} participation
          </p>
          {dao.website && (
            <a
              href={dao.website}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary hover:underline"
            >
              {dao.website} ↗
            </a>
          )}
        </div>
      </header>

      {Object.keys(breakdown).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Score breakdown</CardTitle>
            <CardDescription>How {dao.name} earns its Democracy Score</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(breakdown).map(([k, v]) => (
              <div key={k}>
                <div className="flex justify-between text-sm">
                  <span className="capitalize">{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                  <span className="font-mono">{Number(v).toFixed(0)}</span>
                </div>
                <ProgressBar value={Number(v)} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <section>
        <h2 className="mb-3 text-xl font-semibold">Active proposals</h2>
        <div className="grid gap-3">
          {active.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No active proposals.
              </CardContent>
            </Card>
          )}
          {active.map((p) => (
            <Link key={p.id} href={`/proposals/${p.id}`} className="group">
              <Card className="transition-colors group-hover:border-primary/50">
                <CardContent className="space-y-2 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium">{p.title}</div>
                    <RiskBadge level={p.aiRiskLevel} />
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {p.aiSummary ?? 'Summary pending…'}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{timeRemaining(p.endTimestamp)}</span>
                    <span>·</span>
                    <span>{formatNumber(p.votesCount ?? 0)} votes</span>
                    {p.hasWhaleVote && <Badge variant="warning">🐳 whale</Badge>}
                    {p.hasLastMinuteSwing && <Badge variant="destructive">⚡ swing</Badge>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-xl font-semibold">Recent proposals</h2>
          <Card>
            <CardContent className="divide-y p-0">
              {recent.map((p) => (
                <Link key={p.id} href={`/proposals/${p.id}`} className="block p-4 hover:bg-accent">
                  <div className="flex items-center justify-between">
                    <div className="line-clamp-1 font-medium">{p.title}</div>
                    <Badge variant={p.state === 'active' ? 'success' : 'secondary'}>{p.state}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {timeAgo(p.createdAt)} · {formatNumber(p.votesCount ?? 0)} votes
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
        <div>
          <h2 className="mb-3 text-xl font-semibold">Recent alerts</h2>
          <Card>
            <CardContent className="divide-y p-0">
              {recentAlerts.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">No alerts.</div>
              )}
              {recentAlerts.map((a) => (
                <div key={a.id} className="p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Badge
                      variant={
                        a.severity === 'critical'
                          ? 'destructive'
                          : a.severity === 'warning'
                            ? 'warning'
                            : 'secondary'
                      }
                    >
                      {a.severity}
                    </Badge>
                    {a.title}
                  </div>
                  <div className="text-xs text-muted-foreground">{timeAgo(a.createdAt)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
