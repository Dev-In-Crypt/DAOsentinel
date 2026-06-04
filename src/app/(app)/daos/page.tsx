import Link from 'next/link';
import { db } from '@/server/db';
import { daos } from '@/server/db/schema';
import { desc, asc, ilike } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScoreGauge } from '@/components/charts/ScoreGauge';
import { Input } from '@/components/ui/input';
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
    sort === 'name' ? asc(daos.name) : sort === 'proposals' ? desc(daos.totalProposals) : desc(daos.democracyScore);

  const rows = await db
    .select()
    .from(daos)
    .where(search ? ilike(daos.name, `%${search}%`) : undefined)
    .orderBy(orderBy)
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">DAO Governance Explorer</h1>
        <p className="text-muted-foreground">
          {rows.length} DAOs monitored · sorted by{' '}
          {sort === 'name' ? 'name' : sort === 'proposals' ? 'activity' : 'Democracy Score'}.
        </p>
      </div>

      <form className="flex flex-wrap gap-2" action="" method="get">
        <Input name="search" defaultValue={search} placeholder="Search DAOs…" className="max-w-md" />
        <select
          name="sort"
          defaultValue={sort}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="score">Sort: Democracy Score</option>
          <option value="name">Sort: Name</option>
          <option value="proposals">Sort: Activity</option>
        </select>
      </form>

      <div className="grid gap-3">
        {rows.map((d) => (
          <Link key={d.id} href={`/daos/${d.slug}`} className="group">
            <Card className="transition-colors group-hover:border-primary/50">
              <CardContent className="flex items-center gap-4 py-4">
                <ScoreGauge score={Number(d.democracyScore ?? 0)} size="sm" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold">{d.name}</span>
                    <Badge variant="outline">{d.chain}</Badge>
                    {d.governanceToken && <Badge variant="secondary">{d.governanceToken}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatNumber(d.totalProposals ?? 0)} proposals ·{' '}
                    {((Number(d.avgParticipationRate ?? 0)) * 100).toFixed(2)}% participation
                    {d.treasuryUsd ? ` · ${formatUSD(Number(d.treasuryUsd))} treasury` : ''}
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className="font-bold">{Number(d.democracyScore ?? 0).toFixed(0)}/100</div>
                  <div className="text-xs text-muted-foreground">Democracy Score</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
        {!rows.length && (
          <Card>
            <CardHeader>
              <CardTitle>No DAOs yet</CardTitle>
            </CardHeader>
            <CardContent>
              Run <code>npm run db:seed</code> after applying migrations.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
