import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { proposals, daos, votes } from '@/server/db/schema';
import { desc, eq } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { RiskBadge } from '@/components/proposals/RiskBadge';
import { VoteBreakdown } from '@/components/proposals/VoteBreakdown';
import { ProposalBody } from '@/components/proposals/ProposalBody';
import { formatNumber, shortenAddress, timeAgo, timeRemaining } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const RISK_TONE: Record<string, { color: string; label: string }> = {
  high: { color: 'hsl(var(--rose))', label: 'HIGH RISK' },
  medium: { color: 'hsl(var(--amber))', label: 'MEDIUM RISK' },
  low: { color: 'hsl(var(--mint))', label: 'LOW RISK' },
};

export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [row] = await db
    .select({ proposal: proposals, dao: daos })
    .from(proposals)
    .innerJoin(daos, eq(daos.id, proposals.daoId))
    .where(eq(proposals.id, id))
    .limit(1);

  if (!row) notFound();
  const { proposal: p, dao } = row;

  const allVotes = await db
    .select()
    .from(votes)
    .where(eq(votes.proposalId, p.id))
    .orderBy(desc(votes.votingPower))
    .limit(200);

  const whaleVotes = allVotes.filter((v) => v.isWhale).slice(0, 12);
  const total = Number(p.scoresTotal ?? 0);
  const quorumPct = p.quorum && Number(p.quorum) > 0 ? (total / Number(p.quorum)) * 100 : null;
  const risk = p.aiRiskLevel ? RISK_TONE[p.aiRiskLevel] : null;

  return (
    <div className="space-y-10">
      {/* Breadcrumb */}
      <Link
        href={`/daos/${dao.slug}`}
        className="inline-flex items-center gap-2 text-sm text-[hsl(var(--indigo-bright))] hover:underline"
      >
        ← Back to {dao.name}
      </Link>

      {/* Hero */}
      <div>
        <span className="eyebrow mb-3">
          {dao.name} · {p.state} proposal
        </span>
        <h1
          className="mt-4 text-3xl font-semibold leading-tight md:text-4xl"
          style={{
            fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
            letterSpacing: '-0.02em',
          }}
        >
          {p.title}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[hsl(var(--text-dim))]">
          <span className="mono">{shortenAddress(p.author)}</span>
          <span className="text-[hsl(var(--text-faint))]">·</span>
          <span className="mono">
            {p.state === 'active' ? timeRemaining(p.endTimestamp) : `ended ${timeAgo(p.endTimestamp)}`}
          </span>
          {risk && (
            <>
              <span className="text-[hsl(var(--text-faint))]">·</span>
              <span
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] uppercase tracking-wider mono"
                style={{
                  background: `${risk.color}1f`,
                  color: risk.color,
                  boxShadow: `inset 0 0 0 1px ${risk.color}55`,
                }}
              >
                ● {risk.label}
              </span>
            </>
          )}
          {p.hasLastMinuteSwing && <Badge variant="destructive">⚡ Swing detected</Badge>}
          {p.hasWhaleVote && <Badge variant="warning">🐳 Whale activity</Badge>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="stat-cell">
          <div className="lab">Voters</div>
          <div className="val">{p.votesCount?.toLocaleString() ?? 0}</div>
        </div>
        <div className="stat-cell">
          <div className="lab">{dao.governanceToken ?? 'tokens'} voted</div>
          <div className="val">
            <span className="accent">{formatNumber(total)}</span>
          </div>
        </div>
        <div className="stat-cell">
          <div className="lab">Quorum</div>
          <div className="val">
            {quorumPct != null ? (
              <>
                <span
                  className={quorumPct >= 100 ? 'accent' : 'accent-warn'}
                >
                  {quorumPct.toFixed(0)}%
                </span>
                <span style={{ fontSize: 14, color: 'hsl(var(--text-dim))' }}>
                  {' '}
                  {quorumPct >= 100 ? '✓ met' : 'short'}
                </span>
              </>
            ) : (
              '—'
            )}
          </div>
        </div>
      </div>

      {/* AI Summary */}
      <section>
        <h2 className="app-sec-title">AI summary</h2>
        <div className="glass-card space-y-4 leading-relaxed">
          {p.aiSummary ? (
            <>
              <p className="text-base">{p.aiSummary}</p>
              {p.aiImpact && (
                <div
                  className="border-t pt-4"
                  style={{ borderColor: 'hsl(var(--line))' }}
                >
                  <div className="mb-1 text-xs uppercase tracking-wider mono text-[hsl(var(--text-faint))]">
                    Impact
                  </div>
                  <p className="text-base text-[hsl(var(--text))]">{p.aiImpact}</p>
                </div>
              )}
              <a
                href={`https://snapshot.org/#/${dao.snapshotSpaceId}/proposal/${p.externalId}`}
                target="_blank"
                rel="noreferrer"
                className="btn-mc btn-mc-ghost"
                style={{ padding: '10px 18px', fontSize: 14 }}
              >
                Read full proposal on Snapshot ↗
              </a>
            </>
          ) : (
            <p className="text-sm text-[hsl(var(--text-dim))]">
              Summary pending — generation runs every 15 minutes.
            </p>
          )}
        </div>
      </section>

      {/* Voting results */}
      <section>
        <h2 className="app-sec-title">Voting results</h2>
        <div className="glass-card space-y-5">
          <VoteBreakdown
            choices={p.choices ?? []}
            scores={(p.scores as number[]) ?? []}
            total={total}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs mono text-[hsl(var(--text-dim))]" style={{ borderColor: 'hsl(var(--line))' }}>
            <span>
              {formatNumber(total)} {dao.governanceToken ?? 'tokens'} ·{' '}
              {p.votesCount ?? 0} voters
            </span>
            {p.snapshotBlock && (
              <span className="text-[hsl(var(--text-faint))]">block {p.snapshotBlock}</span>
            )}
          </div>
        </div>
      </section>

      {/* Whale votes */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="app-sec-title">🐳 Whale votes</h2>
          <span className="text-xs mono text-[hsl(var(--text-dim))]">
            {whaleVotes.length} {whaleVotes.length === 1 ? 'vote' : 'votes'} &gt; 5% VP
          </span>
        </div>
        {whaleVotes.length === 0 ? (
          <div className="glass-card py-10 text-center text-sm text-[hsl(var(--text-dim))]">
            No whale votes on this proposal.
          </div>
        ) : (
          <div className="glass-card divide-y divide-[hsl(var(--line))] p-0">
            {whaleVotes.map((v) => {
              const label = (p.choices && p.choices[v.choice - 1]) ?? `choice ${v.choice}`;
              const pct = Number(v.votingPowerPct ?? 0);
              const tone =
                pct > 20
                  ? 'hsl(var(--rose))'
                  : pct > 10
                    ? 'hsl(var(--amber))'
                    : 'hsl(var(--indigo-bright))';
              return (
                <div
                  key={v.id}
                  className="flex items-center justify-between gap-4 p-4"
                >
                  <div>
                    <div className="mono font-medium">
                      {shortenAddress(v.voterAddress)}
                    </div>
                    <div className="text-xs text-[hsl(var(--text-dim))] mono">
                      {timeAgo(v.createdAt)} · voted{' '}
                      <span className="text-[hsl(var(--text))]">{label}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className="mono font-semibold"
                      style={{ fontSize: 16, color: tone }}
                    >
                      {pct.toFixed(1)}%
                    </div>
                    <div className="text-xs mono text-[hsl(var(--text-dim))]">
                      {formatNumber(Number(v.votingPower))} VP
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Full markdown body */}
      <section>
        <h2 className="app-sec-title">Full proposal</h2>
        <div className="glass-card">
          <div className="mb-4 text-xs uppercase tracking-wider mono text-[hsl(var(--text-faint))]">
            Original markdown · {dao.name}
          </div>
          <ProposalBody body={p.body} />
        </div>
      </section>
    </div>
  );
}
