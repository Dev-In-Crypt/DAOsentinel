import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { proposals, daos, votes } from '@/server/db/schema';
import { asc, desc, eq } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { RiskBadge } from '@/components/proposals/RiskBadge';
import { VoteBreakdown } from '@/components/proposals/VoteBreakdown';
import { VoteTimeline } from '@/components/proposals/VoteTimeline';
import { QuorumBar } from '@/components/proposals/QuorumBar';
import { ProposalBody } from '@/components/proposals/ProposalBody';
import { SimilarProposals } from '@/components/proposals/SimilarProposals';
import { formatNumber, formatUsdValue, shortenAddress, timeAgo, timeRemaining } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [row] = await db
    .select({ title: proposals.title, dao: daos.name })
    .from(proposals)
    .innerJoin(daos, eq(daos.id, proposals.daoId))
    .where(eq(proposals.id, id))
    .limit(1);
  if (!row) return { title: 'Proposal — DAO Sentinel' };
  // Keep total under ~70 chars for browser tabs
  const shortTitle = row.title.length > 50 ? row.title.slice(0, 50) + '…' : row.title;
  return { title: `${shortTitle} · ${row.dao} — DAO Sentinel` };
}

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

  const [allVotes, timelineVotes] = await Promise.all([
    db
      .select()
      .from(votes)
      .where(eq(votes.proposalId, p.id))
      .orderBy(desc(votes.votingPower))
      .limit(200),
    db
      .select({
        createdAt: votes.createdAt,
        choice: votes.choice,
        votingPower: votes.votingPower,
      })
      .from(votes)
      .where(eq(votes.proposalId, p.id))
      .orderBy(asc(votes.createdAt))
      .limit(2000),
  ]);

  const whaleVotes = allVotes.filter((v) => v.isWhale).slice(0, 12);
  const total = Number(p.scoresTotal ?? 0);
  const risk = p.aiRiskLevel ? RISK_TONE[p.aiRiskLevel] : null;
  const tokenPrice = dao.tokenPriceUsd ? Number(dao.tokenPriceUsd) : null;
  const totalUsd = formatUsdValue(total, tokenPrice);

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
          {p.discussion && (
            <>
              <span className="text-[hsl(var(--text-faint))]">·</span>
              <a
                href={p.discussion}
                target="_blank"
                rel="noreferrer"
                className="text-[hsl(var(--indigo-bright))] hover:underline"
              >
                Discussion ↗
              </a>
            </>
          )}
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
          {totalUsd && (
            <div className="mt-1 text-xs mono text-[hsl(var(--text-faint))]">{totalUsd}</div>
          )}
        </div>
        <div className="stat-cell">
          <div className="lab">Token price</div>
          <div className="val">
            {tokenPrice != null ? (
              <span className="accent">
                ${tokenPrice >= 100 ? tokenPrice.toFixed(0) : tokenPrice.toFixed(2)}
              </span>
            ) : (
              <span className="text-[hsl(var(--text-faint))]">—</span>
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
              {(() => {
                const isTally = p.source === 'tally';
                const href = isTally
                  ? `https://www.tally.xyz/gov/${dao.tallyOrgId ?? ''}/proposal/${p.externalId}`
                  : `https://snapshot.org/#/${dao.snapshotSpaceId}/proposal/${p.externalId}`;
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-mc btn-mc-ghost"
                    style={{ padding: '10px 18px', fontSize: 14 }}
                  >
                    Read full proposal on {isTally ? 'Tally' : 'Snapshot'} ↗
                  </a>
                );
              })()}
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
        <div className="glass-card space-y-6">
          {p.quorum && Number(p.quorum) > 0 && (
            <QuorumBar
              current={total}
              target={Number(p.quorum)}
              unit={dao.governanceToken ?? undefined}
            />
          )}
          <VoteBreakdown
            choices={p.choices ?? []}
            scores={(p.scores as number[]) ?? []}
            total={total}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs mono text-[hsl(var(--text-dim))]" style={{ borderColor: 'hsl(var(--line))' }}>
            <span>
              {formatNumber(total)} {dao.governanceToken ?? 'tokens'}
              {totalUsd && <span className="text-[hsl(var(--text-faint))]"> · {totalUsd}</span>} ·{' '}
              {p.votesCount ?? 0} voters
            </span>
            {p.snapshotBlock && (
              <span className="text-[hsl(var(--text-faint))]">block {p.snapshotBlock}</span>
            )}
          </div>
        </div>
      </section>

      {/* Vote timeline */}
      {timelineVotes.length >= 5 && (
        <section>
          <h2 className="app-sec-title">Votes over time</h2>
          <div className="glass-card">
            <VoteTimeline
              votes={timelineVotes.map((v) => ({
                createdAt: v.createdAt,
                choice: v.choice,
                votingPower: v.votingPower,
              }))}
              choices={p.choices ?? []}
              startTimestamp={p.startTimestamp}
              endTimestamp={p.endTimestamp}
            />
            <p className="mt-3 text-xs text-[hsl(var(--text-faint))] mono">
              x-axis = % of voting window elapsed · y-axis = cumulative VP per choice
            </p>
          </div>
        </section>
      )}

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
                    {(() => {
                      const usd = formatUsdValue(Number(v.votingPower), tokenPrice);
                      return usd ? (
                        <div className="text-xs mono text-[hsl(var(--text-faint))]">{usd}</div>
                      ) : null;
                    })()}
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

      {/* Similar past proposals (semantic match via embeddings) */}
      <section>
        <h2 className="app-sec-title">📚 Similar past proposals</h2>
        <SimilarProposals proposalId={p.id} />
      </section>
    </div>
  );
}
