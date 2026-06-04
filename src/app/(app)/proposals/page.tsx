import Link from 'next/link';
import { db } from '@/server/db';
import { proposals, daos } from '@/server/db/schema';
import { desc, eq, and } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { RiskBadge } from '@/components/proposals/RiskBadge';
import { PageHeader } from '@/components/layout/PageHeader';
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
    <div className="space-y-8">
      <PageHeader
        eyebrow="The signal"
        title="Governance"
        highlight="Proposals"
        description={
          <>
            <span className="mono text-[hsl(var(--cyan))]">{rows.length}</span> {state} proposals across monitored DAOs.
          </>
        }
        right={
          <form className="flex gap-2 text-sm">
            <select
              name="state"
              defaultValue={state}
              className="h-10 rounded-md bg-[hsl(var(--text-dim)/0.05)] px-3 shadow-[inset_0_0_0_1px_hsl(var(--line))] mono"
            >
              <option value="active">Active</option>
              <option value="closed">Closed</option>
              <option value="pending">Pending</option>
            </select>
            <select
              name="risk"
              defaultValue={risk ?? ''}
              className="h-10 rounded-md bg-[hsl(var(--text-dim)/0.05)] px-3 shadow-[inset_0_0_0_1px_hsl(var(--line))] mono"
            >
              <option value="">Any risk</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </form>
        }
      />

      <div className="grid gap-3">
        {rows.map(({ proposal: p, dao }) => (
          <Link key={p.id} href={`/proposals/${p.id}`} className="group">
            <div className="glass-card space-y-3 py-4">
              <div className="flex items-center justify-between gap-3 text-xs mono text-[hsl(var(--text-dim))]">
                <span>{dao.name}</span>
                <span>
                  {state === 'active' ? timeRemaining(p.endTimestamp) : timeAgo(p.endTimestamp)}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div
                  className="font-semibold leading-snug"
                  style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}
                >
                  {p.title}
                </div>
                <RiskBadge level={p.aiRiskLevel} />
              </div>
              <p className="line-clamp-2 text-sm text-[hsl(var(--text-dim))]">
                {p.aiSummary ?? 'Summary pending…'}
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">{formatNumber(p.votesCount ?? 0)} votes</Badge>
                {p.hasWhaleVote && <Badge variant="warning">🐳 whale</Badge>}
                {p.hasLastMinuteSwing && <Badge variant="destructive">⚡ swing</Badge>}
              </div>
            </div>
          </Link>
        ))}
        {!rows.length && (
          <div className="glass-card py-12 text-center text-sm text-[hsl(var(--text-dim))]">
            No proposals match the current filter.
          </div>
        )}
      </div>
    </div>
  );
}
