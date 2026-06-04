import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { proposals, daos, votes } from '@/server/db/schema';
import { desc, eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RiskBadge } from '@/components/proposals/RiskBadge';
import { VoteBreakdown } from '@/components/proposals/VoteBreakdown';
import { ProposalBody } from '@/components/proposals/ProposalBody';
import { formatNumber, shortenAddress, timeAgo, timeRemaining } from '@/lib/utils';

export const dynamic = 'force-dynamic';

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

  return (
    <div className="space-y-6">
      <Link href={`/daos/${dao.slug}`} className="text-sm text-primary hover:underline">
        ← Back to {dao.name}
      </Link>

      <div>
        <h1 className="text-2xl font-bold">{p.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>By {shortenAddress(p.author)}</span>
          <span>·</span>
          <span>{p.state === 'active' ? timeRemaining(p.endTimestamp) : `ended ${timeAgo(p.endTimestamp)}`}</span>
          <RiskBadge level={p.aiRiskLevel} />
          {p.hasLastMinuteSwing && <Badge variant="destructive">⚡ swing detected</Badge>}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI Summary</CardTitle>
          <CardDescription>Plain-English read of the proposal — link to the full text below.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {p.aiSummary ? (
            <>
              <p>{p.aiSummary}</p>
              {p.aiImpact && (
                <p>
                  <span className="font-medium">Impact: </span>
                  {p.aiImpact}
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">Summary pending — generation runs every 10 minutes.</p>
          )}
          <Button asChild variant="outline" size="sm">
            <a
              href={`https://snapshot.org/#/${dao.snapshotSpaceId}/proposal/${p.externalId}`}
              target="_blank"
              rel="noreferrer"
            >
              Read full proposal on Snapshot ↗
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Full proposal</CardTitle>
          <CardDescription>Original markdown from {dao.name}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProposalBody body={p.body} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Voting results</CardTitle>
            {quorumPct != null && (
              <CardDescription>
                Quorum: {quorumPct.toFixed(0)}% {quorumPct >= 100 ? '✓' : ''}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <VoteBreakdown
              choices={p.choices ?? []}
              scores={(p.scores as number[]) ?? []}
              total={total}
            />
            <div className="text-xs text-muted-foreground">
              {formatNumber(total)} {dao.governanceToken} voted · {p.votesCount ?? 0} voters
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>🐳 Whale votes</CardTitle>
            <CardDescription>{whaleVotes.length} votes &gt; 5% VP</CardDescription>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {whaleVotes.length === 0 && (
              <div className="p-4 text-center text-sm text-muted-foreground">No whale votes.</div>
            )}
            {whaleVotes.map((v) => {
              const label =
                (p.choices && p.choices[v.choice - 1]) ?? `choice ${v.choice}`;
              return (
                <div key={v.id} className="flex items-center justify-between gap-2 p-3 text-xs">
                  <div>
                    <div className="font-mono">{shortenAddress(v.voterAddress)}</div>
                    <div className="text-muted-foreground">{timeAgo(v.createdAt)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatNumber(Number(v.votingPower))}</div>
                    <div className="text-muted-foreground">
                      {Number(v.votingPowerPct ?? 0).toFixed(1)}% · {label}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
