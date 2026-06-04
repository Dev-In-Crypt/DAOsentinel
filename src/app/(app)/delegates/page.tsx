import Link from 'next/link';
import { db } from '@/server/db';
import { delegates } from '@/server/db/schema';
import { desc } from 'drizzle-orm';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatNumber, shortenAddress } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DelegatesPage() {
  const rows = await db
    .select()
    .from(delegates)
    .orderBy(desc(delegates.totalVotesCast))
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Delegate leaderboard</h1>
        <p className="text-muted-foreground">
          Cross-DAO activity, participation, and consistency.
        </p>
      </div>

      <Card>
        <CardContent className="divide-y p-0">
          {rows.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No delegates yet — they materialise after the first vote sync.
            </div>
          )}
          {rows.map((d) => (
            <Link
              key={d.id}
              href={`/delegates/${d.address}`}
              className="flex items-center justify-between gap-3 p-4 hover:bg-accent"
            >
              <div>
                <div className="font-mono">{d.ensName ?? shortenAddress(d.address)}</div>
                <div className="text-xs text-muted-foreground">
                  {d.totalDaosActive ?? 0} DAOs · {formatNumber(d.totalVotesCast ?? 0)} votes
                </div>
              </div>
              <Badge variant="outline">
                {((Number(d.participationRate ?? 0)) * 100).toFixed(0)}% participation
              </Badge>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
