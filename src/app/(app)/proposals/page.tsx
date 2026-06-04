import Link from 'next/link';
import { db } from '@/server/db';
import { proposals, daos } from '@/server/db/schema';
import { desc, eq, and } from 'drizzle-orm';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RiskBadge } from '@/components/proposals/RiskBadge';
import { formatNumber, timeAgo, timeRemaining } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; risk?: string }>;
}) {
  const sp = await searchParams;
  const state = (sp.state ?? 'active') as 'active' | 'closed' | 'pending';
  const risk = sp.risk;

  const where = [eq(proposals.state, state)];
  if (risk) where.push(eq(proposals.aiRiskLevel, risk));

  const rows = await db
    .select({ proposal: proposals, dao: daos })
    .from(proposals)
    .innerJoin(daos, eq(daos.id, proposals.daoId))
    .where(and(...where))
    .orderBy(desc(proposals.createdAt))
    .limit(60);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold">Proposals</h1>
          <p className="text-muted-foreground">{rows.length} {state} proposals.</p>
        </div>
        <form className="flex gap-2 text-sm">
          <select name="state" defaultValue={state} className="h-9 rounded-md border bg-background px-2">
            <option value="active">Active</option>
            <option value="closed">Closed</option>
            <option value="pending">Pending</option>
          </select>
          <select name="risk" defaultValue={risk ?? ''} className="h-9 rounded-md border bg-background px-2">
            <option value="">Any risk</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </form>
      </div>

      <div className="grid gap-3">
        {rows.map(({ proposal: p, dao }) => (
          <Link key={p.id} href={`/proposals/${p.id}`} className="group">
            <Card className="transition-colors group-hover:border-primary/50">
              <CardContent className="space-y-2 py-4">
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>{dao.name}</span>
                  <span>
                    {state === 'active' ? timeRemaining(p.endTimestamp) : timeAgo(p.endTimestamp)}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div className="font-medium">{p.title}</div>
                  <RiskBadge level={p.aiRiskLevel} />
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {p.aiSummary ?? 'Summary pending…'}
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">{formatNumber(p.votesCount ?? 0)} votes</Badge>
                  {p.hasWhaleVote && <Badge variant="warning">🐳 whale</Badge>}
                  {p.hasLastMinuteSwing && <Badge variant="destructive">⚡ swing</Badge>}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
