import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { daos, proposals, alerts, scoreHistory } from '@/server/db/schema';
import { desc, asc, eq, and } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { ScoreGauge } from '@/components/charts/ScoreGauge';
import { ScoreTrend } from '@/components/charts/ScoreTrend';
import { RiskBadge } from '@/components/proposals/RiskBadge';
import { ProgressBar } from '@/components/ui/progress';
import { CompareWithPicker } from '@/components/daos/CompareWithPicker';
import { formatNumber, formatPct, timeAgo, timeRemaining } from '@/lib/utils';
import { METRIC_HINT } from '@/lib/constants';

export const revalidate = 60; // ISR — public page, data changes on cron cadence

// Render on demand, then cache (ISR). No params prebuilt at compile time.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [d] = await db
    .select({ name: daos.name })
    .from(daos)
    .where(eq(daos.slug, slug))
    .limit(1);
  return {
    title: d ? `${d.name} — DAO Sentinel` : 'DAO — DAO Sentinel',
  };
}

const METRIC_LABEL: Record<string, string> = {
  participation: 'Voter participation',
  powerDistribution: 'Power distribution',
  proposalDiversity: 'Proposal diversity',
  delegateAccountability: 'Delegate accountability',
  manipulationResistance: 'Manipulation resistance',
};

export default async function DaoProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [dao] = await db.select().from(daos).where(eq(daos.slug, slug)).limit(1);
  if (!dao) notFound();

  const [active, recent, recentAlerts, history, allDaos] = await Promise.all([
    db
      .select()
      .from(proposals)
      .where(and(eq(proposals.daoId, dao.id), eq(proposals.state, 'active')))
      .orderBy(desc(proposals.endTimestamp))
      .limit(10),
    db
      .select()
      .from(proposals)
      .where(eq(proposals.daoId, dao.id))
      .orderBy(desc(proposals.createdAt))
      .limit(15),
    db
      .select()
      .from(alerts)
      .where(eq(alerts.daoId, dao.id))
      .orderBy(desc(alerts.createdAt))
      .limit(10),
    db
      .select({ score: scoreHistory.score, computedAt: scoreHistory.computedAt })
      .from(scoreHistory)
      .where(eq(scoreHistory.daoId, dao.id))
      .orderBy(asc(scoreHistory.computedAt))
      .limit(90),
    db.select({ slug: daos.slug, name: daos.name }).from(daos).orderBy(asc(daos.name)),
  ]);

  const breakdown = (dao.scoreBreakdown ?? {}) as Record<string, number>;

  const trendPoints = history.map((h) => ({
    day: new Date(h.computedAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    }),
    score: Number(h.score),
  }));

  return (
    <div className="space-y-10">
      {/* Hero */}
      <div className="flex flex-wrap items-center gap-6">
        <ScoreGauge score={Number(dao.democracyScore ?? 0)} size="lg" />
        <div className="flex-1">
          <span className="eyebrow mb-3">DAO profile · {dao.chain}</span>
          <h1
            className="mt-3 text-4xl font-semibold md:text-5xl"
            style={{
              fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
              letterSpacing: '-0.025em',
            }}
          >
            {dao.name}
          </h1>
          <p className="mt-3 text-sm text-[hsl(var(--text-dim))]">
            {formatNumber(dao.totalProposals ?? 0)} proposals ·{' '}
            {formatPct(Number(dao.avgParticipationRate ?? 0) * 100)} avg participation
            {dao.governanceToken && (
              <>
                {' '}
                · governance token{' '}
                <span className="mono text-[hsl(var(--cyan))]">{dao.governanceToken}</span>
              </>
            )}
          </p>
          {dao.website && (
            <a
              href={dao.website}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-sm text-[hsl(var(--indigo-bright))] hover:underline"
            >
              {dao.website} ↗
            </a>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <CompareWithPicker currentSlug={dao.slug} options={allDaos} />
            <Link
              href={`/daos/${dao.slug}/simulator`}
              className="text-sm text-[hsl(var(--indigo-bright))] hover:underline mono"
            >
              Voting-power simulator →
            </Link>
          </div>
        </div>
      </div>

      {/* Score trend (hidden if fewer than 3 data points) */}
      {trendPoints.length >= 3 && (
        <div>
          <h2 className="app-sec-title">
            Democracy Score · last {trendPoints.length} days
          </h2>
          <div className="glass-card">
            <ScoreTrend data={trendPoints} />
          </div>
        </div>
      )}

      {/* Score breakdown */}
      {Object.keys(breakdown).length > 0 && (
        <div>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="app-sec-title" style={{ marginBottom: 0 }}>Score breakdown</h2>
            <Link
              href="/docs"
              className="text-xs mono text-[hsl(var(--indigo-bright))] hover:underline"
            >
              methodology →
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            {Object.entries(breakdown).map(([k, v]) => (
              <div key={k} className="stat-cell" title={METRIC_HINT[k]}>
                <div className="lab">{METRIC_LABEL[k] ?? k}</div>
                <div className="val">
                  {Number(v).toFixed(0)}
                  <span style={{ fontSize: 13, color: 'hsl(var(--text-dim))' }}>/100</span>
                </div>
                <div className="mt-3">
                  <ProgressBar value={Number(v)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active proposals */}
      <section>
        <h2 className="app-sec-title">Active proposals</h2>
        <div className="grid gap-3">
          {active.length === 0 && (
            <div className="glass-card py-10 text-center text-sm text-[hsl(var(--text-dim))]">
              No active proposals.
            </div>
          )}
          {active.map((p) => (
            <Link key={p.id} href={`/proposals/${p.id}`} className="group">
              <div className="glass-card space-y-2 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="font-semibold"
                    style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}
                  >
                    {p.title}
                  </div>
                  <RiskBadge level={p.aiRiskLevel} />
                </div>
                <p className="line-clamp-2 text-sm text-[hsl(var(--text-dim))]">
                  {p.aiSummary ?? 'Summary pending…'}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs mono text-[hsl(var(--text-dim))]">
                  <span>{timeRemaining(p.endTimestamp)}</span>
                  <span>·</span>
                  <span>{formatNumber(p.votesCount ?? 0)} votes</span>
                  {p.hasWhaleVote && <Badge variant="warning">🐳 whale</Badge>}
                  {p.hasLastMinuteSwing && <Badge variant="destructive">⚡ swing</Badge>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Recent + Alerts */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="app-sec-title">Recent proposals</h2>
          <div className="glass-card divide-y divide-[hsl(var(--line))] p-0">
            {recent.map((p) => (
              <Link
                key={p.id}
                href={`/proposals/${p.id}`}
                className="block p-4 transition-colors hover:bg-[hsl(var(--accent)/0.4)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="line-clamp-1 font-medium">{p.title}</div>
                  <Badge variant={p.state === 'active' ? 'success' : 'secondary'}>{p.state}</Badge>
                </div>
                <div className="mt-1 text-xs mono text-[hsl(var(--text-dim))]">
                  {timeAgo(p.createdAt)} · {formatNumber(p.votesCount ?? 0)} votes
                </div>
              </Link>
            ))}
            {!recent.length && (
              <div className="p-6 text-center text-sm text-[hsl(var(--text-dim))]">
                No recent proposals.
              </div>
            )}
          </div>
        </div>
        <div>
          <h2 className="app-sec-title">Recent alerts</h2>
          <div className="glass-card divide-y divide-[hsl(var(--line))] p-0">
            {recentAlerts.length === 0 && (
              <div className="p-8 text-center text-sm text-[hsl(var(--text-dim))]">No alerts.</div>
            )}
            {recentAlerts.map((a) => (
              <div key={a.id} className="p-4">
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
                <div className="mt-1 text-xs mono text-[hsl(var(--text-faint))]">
                  {timeAgo(a.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
