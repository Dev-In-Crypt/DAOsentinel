import Link from 'next/link';
import { db } from '@/server/db';
import { daos } from '@/server/db/schema';
import { desc, asc, ilike } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { ScoreGauge } from '@/components/charts/ScoreGauge';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatNumber, formatUSD } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DaosPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const search = params.search ?? '';
  const sort = params.sort ?? 'score';

  const orderBy =
    sort === 'name'
      ? asc(daos.name)
      : sort === 'proposals'
        ? desc(daos.totalProposals)
        : desc(daos.democracyScore);

  const rows = await db
    .select()
    .from(daos)
    .where(search ? ilike(daos.name, `%${search}%`) : undefined)
    .orderBy(orderBy)
    .limit(100);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="The leaderboard"
        title="DAO Governance"
        highlight="Explorer"
        description={
          <>
            {rows.length} DAOs monitored. Sorted by{' '}
            <span className="text-[hsl(var(--indigo-bright))] mono">
              {sort === 'name' ? 'name' : sort === 'proposals' ? 'activity' : 'Democracy Score'}
            </span>
            .
          </>
        }
      />

      <form className="flex flex-wrap gap-3" action="" method="get">
        <Input name="search" defaultValue={search} placeholder="Search DAOs…" className="max-w-md" />
        <select
          name="sort"
          defaultValue={sort}
          className="h-11 rounded-md bg-[hsl(var(--text-dim)/0.05)] px-3 text-sm shadow-[inset_0_0_0_1px_hsl(var(--line))] mono"
        >
          <option value="score">Sort: Democracy Score</option>
          <option value="name">Sort: Name</option>
          <option value="proposals">Sort: Activity</option>
        </select>
      </form>

      <div className="grid gap-3">
        {rows.map((d, i) => (
          <Link key={d.id} href={`/daos/${d.slug}`} className="group">
            <div className="glass-card flex items-center gap-5 py-4">
              <span
                className="w-8 text-2xl font-bold text-[hsl(var(--text-faint))]"
                style={{ fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace' }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <ScoreGauge score={Number(d.democracyScore ?? 0)} size="sm" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="text-lg font-semibold"
                    style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}
                  >
                    {d.name}
                  </span>
                  <Badge variant="outline">{d.chain}</Badge>
                  {d.governanceToken && <Badge variant="secondary">{d.governanceToken}</Badge>}
                </div>
                <div className="mt-1 text-xs mono text-[hsl(var(--text-dim))]">
                  {formatNumber(d.totalProposals ?? 0)} proposals ·{' '}
                  {(Number(d.avgParticipationRate ?? 0) * 100).toFixed(2)}% participation
                  {d.treasuryUsd ? ` · ${formatUSD(Number(d.treasuryUsd))} treasury` : ''}
                </div>
              </div>
              <div className="text-right">
                <div
                  className="text-2xl font-bold"
                  style={{ fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace' }}
                >
                  {Number(d.democracyScore ?? 0).toFixed(0)}
                  <span style={{ fontSize: 13, color: 'hsl(var(--text-dim))' }}>/100</span>
                </div>
                <div className="text-[10px] uppercase tracking-wider mono text-[hsl(var(--text-faint))]">
                  Democracy
                </div>
              </div>
            </div>
          </Link>
        ))}
        {!rows.length && (
          <div className="glass-card py-12 text-center text-sm text-[hsl(var(--text-dim))]">
            No DAOs found.
          </div>
        )}
      </div>
    </div>
  );
}
