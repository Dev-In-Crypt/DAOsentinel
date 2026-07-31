import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { desc, asc, eq, and, gt } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { daos, proposals, alerts, scoreHistory, users } from '@/server/db/schema';
import { requireOrgAccess } from '@/server/api/org-auth';
import { fetchOrgNotesForDao, formatUnresolvedNotesNotice } from '@/server/api/org-notes';
import { countStaleActiveProposals } from '@/server/services/org-report/upcoming-quorum';
import { isStaleActive } from '@/lib/proposal-status';
import { Badge } from '@/components/ui/badge';
import { ScoreGauge } from '@/components/charts/ScoreGauge';
import { ScoreTrend } from '@/components/charts/ScoreTrend';
import { RiskBadge } from '@/components/proposals/RiskBadge';
import { ProgressBar } from '@/components/ui/progress';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatNumber, formatPct, formatUSD, timeAgo, timeRemaining } from '@/lib/utils';
import { METRIC_HINT } from '@/lib/constants';
import { shouldShowPrioritySyncBadge, formatPrioritySyncBadgeLabel } from '@/lib/priority-sync-badge';

// Session-gated + org-scoped: must never be statically prerendered (it hits
// the DB with the caller's identity). Mirrors settings/page.tsx.
export const dynamic = 'force-dynamic';

const METRIC_LABEL: Record<string, string> = {
  participation: 'Voter participation',
  powerDistribution: 'Power distribution',
  proposalDiversity: 'Proposal diversity',
  delegateAccountability: 'Delegate accountability',
  manipulationResistance: 'Manipulation resistance',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgId: string; daoSlug: string }>;
}) {
  const { daoSlug } = await params;
  const [d] = await db
    .select({ name: daos.name })
    .from(daos)
    .where(eq(daos.slug, daoSlug))
    .limit(1);
  return {
    title: d ? `${d.name} — Org dashboard — DAO Sentinel` : 'Org dashboard — DAO Sentinel',
  };
}

export default async function OrgDaoDashboardPage({
  params,
}: {
  params: Promise<{ orgId: string; daoSlug: string }>;
}) {
  const { orgId, daoSlug } = await params;

  const session = await auth();
  if (!session?.user?.email) redirect('/login');

  const [user] = await db.select().from(users).where(eq(users.email, session.user.email)).limit(1);
  if (!user) redirect('/login');

  const access = await requireOrgAccess(user.id, daoSlug);
  if (!access.ok) notFound();

  // requireOrgAccess only checks that *some* org this user belongs to covers
  // daoSlug — it doesn't know which org the caller asked for in the URL. A
  // member of Org A could otherwise probe /org/<org-B-id>/<slug-in-A-scope>
  // and land here. Cross-check the route param against the resolved org.
  if (access.organization.id !== orgId) notFound();

  const organization = access.organization;

  const [dao] = await db.select().from(daos).where(eq(daos.slug, daoSlug)).limit(1);
  if (!dao) notFound();

  // TODO-057: "Priority sync" proof-of-value badge — only shown to org
  // members whose organization is an active priority-tier customer (the
  // same set of orgs the priority-sync cron route in
  // src/app/api/cron/sync-priority/route.ts scopes its faster sync cadence
  // to). `dao.updatedAt` is used as the "last synced" timestamp: it's the
  // field syncTreasuries/syncPrices actually write on every run (see
  // src/lib/priority-sync-badge.ts for why `scoreUpdatedAt` is not used).
  const showPrioritySyncBadge = shouldShowPrioritySyncBadge(organization);

  // The clock for every "is this still open" decision on this page, read once
  // so the list, the excluded count and the badges cannot disagree.
  const now = new Date();

  const [active, recent, recentAlerts, history, curatedNotes, staleActiveCount] = await Promise.all([
    db
      .select()
      .from(proposals)
      // `endTimestamp > now` is load-bearing: without it a vote the sync has
      // not closed yet is listed under ACTIVE PROPOSALS reading "ended".
      // Same condition `fetchUpcomingWithQuorum` applies (TODO-047).
      .where(
        and(
          eq(proposals.daoId, dao.id),
          eq(proposals.state, 'active'),
          gt(proposals.endTimestamp, now),
        ),
      )
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
    // TODO-069: scoped to this DAO, not just this org — `org_notes` has no
    // daoId column, so the helper resolves each note through its subject
    // row (see src/server/api/org-notes.ts). The CSV export calls the exact
    // same helper.
    fetchOrgNotesForDao(organization.id, dao.id),
    // What the deadline filter above dropped. Surfaced rather than silently
    // shortening the list — a non-zero count means the sync is lagging, which
    // is signal, not noise. Same helper the weekly report uses.
    countStaleActiveProposals(dao.id, now),
  ]);

  const notes = curatedNotes.notes;
  const unresolvedNotesNotice = formatUnresolvedNotesNotice(
    curatedNotes.unresolvedCount,
    dao.name,
  );

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
      <PageHeader
        eyebrow={organization.brandingDisplayName ?? organization.name}
        title="Concierge"
        highlight="dashboard"
        description={`Private view for ${dao.name} — visible only to members of ${organization.name}.`}
        right={
          <div className="flex items-center gap-3">
            {showPrioritySyncBadge && (
              <Badge variant="default">{formatPrioritySyncBadgeLabel(dao.updatedAt)}</Badge>
            )}
            {/* The weekly report, readable here rather than only as an email.
                Same requireOrgAccess + orgId cross-check gate as this page. */}
            <Link
              href={`/org/${organization.id}/${dao.slug}/report`}
              className="text-sm mono text-[hsl(var(--indigo-bright))] hover:underline"
            >
              Weekly report →
            </Link>
            {/* TODO-060: CSV export of this dashboard's report data. Same
                requireOrgAccess + orgId cross-check gate as this page itself
                — see src/app/api/org/[orgId]/[daoSlug]/export.csv/route.ts. */}
            <a
              href={`/api/org/${organization.id}/${dao.slug}/export.csv`}
              className="text-sm mono text-[hsl(var(--indigo-bright))] hover:underline"
            >
              Export CSV ↓
            </a>
          </div>
        }
      />

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
          <div className="mt-4">
            <Link
              href={`/daos/${dao.slug}/simulator`}
              className="text-sm text-[hsl(var(--indigo-bright))] hover:underline mono"
            >
              Voting-power simulator →
            </Link>
          </div>
        </div>
      </div>

      {/* Treasury */}
      <section>
        <h2 className="app-sec-title">Treasury</h2>
        <div className="glass-card">
          <div className="flex flex-wrap items-baseline gap-3">
            <div
              className="mono text-3xl font-semibold"
              style={{ color: 'hsl(var(--mint))' }}
            >
              {formatUSD(dao.treasuryUsd == null ? null : Number(dao.treasuryUsd))}
            </div>
            <span className="text-xs text-[hsl(var(--text-dim))]">current treasury value</span>
          </div>
          <p className="mt-2 text-xs text-[hsl(var(--text-faint))]">
            Historical trend tracking coming soon — this is the latest synced figure, not a
            time series.
          </p>
        </div>
      </section>

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

      {/* Curated notes */}
      <section>
        <h2 className="app-sec-title">Concierge notes</h2>
        <div className="glass-card divide-y divide-[hsl(var(--line))] p-0">
          {notes.length === 0 && (
            <div className="p-8 text-center text-sm text-[hsl(var(--text-dim))]">
              No curated notes yet for {dao.name}. Notes on {organization.name}&apos;s other DAOs
              appear on their own dashboards.
            </div>
          )}
          {notes.map((n) => (
            <div key={n.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs mono text-[hsl(var(--text-faint))]">
                <Badge variant="secondary">{n.subjectType}</Badge>
                <span>{n.subjectLabel}</span>
                <span>·</span>
                <span>{timeAgo(n.createdAt)}</span>
                <span>·</span>
                <span>{n.authorName ?? n.authorEmail}</span>
              </div>
              <p className="mt-2 text-sm">{n.note}</p>
            </div>
          ))}
        </div>
        {unresolvedNotesNotice && (
          <p className="mt-2 text-xs text-[hsl(var(--text-faint))]">{unresolvedNotesNotice}</p>
        )}
        <p className="mt-2 text-xs text-[hsl(var(--text-faint))]">
          Notes are curated by the DAO Sentinel concierge team and added via direct database
          access for now — there is no in-app authoring UI in this pass.
        </p>
      </section>

      {/* Active proposals */}
      <section>
        <h2 className="app-sec-title">Active proposals</h2>
        <div className="grid gap-3">
          {active.length === 0 && (
            <div className="glass-card py-10 text-center text-sm text-[hsl(var(--text-dim))]">
              No active proposals.
            </div>
          )}
          {staleActiveCount > 0 && (
            <p className="text-xs text-[hsl(var(--text-dim))]">
              {staleActiveCount}{' '}
              {staleActiveCount === 1
                ? 'proposal still flagged active past its deadline was'
                : 'proposals still flagged active past their deadline were'}{' '}
              excluded — awaiting the next sync.
            </p>
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
                  {/* `ended`, not the raw `active` the sync has not updated
                      yet — otherwise this list contradicts the panel above,
                      which has already excluded the same proposal. */}
                  {isStaleActive(p.state, p.endTimestamp, now) ? (
                    <Badge variant="secondary">ended</Badge>
                  ) : (
                    <Badge variant={p.state === 'active' ? 'success' : 'secondary'}>{p.state}</Badge>
                  )}
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
