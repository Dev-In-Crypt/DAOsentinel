import Link from 'next/link';
import { db } from '@/server/db';
import { delegates } from '@/server/db/schema';
import { desc } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatNumber, shortenAddress } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DelegatesPage() {
  const rows = await db
    .select()
    .from(delegates)
    .orderBy(desc(delegates.totalVotesCast))
    .limit(100);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Cross-DAO power"
        title="Delegate"
        highlight="Leaderboard"
        description="Cross-DAO activity, participation, and consistency for the most active delegates."
      />

      <div className="glass-card divide-y divide-[hsl(var(--line))] p-0">
        {rows.length === 0 && (
          <div className="p-12 text-center text-sm text-[hsl(var(--text-dim))]">
            No delegates yet — they materialise after the first vote sync.
          </div>
        )}
        {rows.map((d, i) => (
          <Link
            key={d.id}
            href={`/delegates/${d.address}`}
            className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-[hsl(var(--accent)/0.4)]"
          >
            <div className="flex items-center gap-4">
              <span
                className="w-8 text-lg font-bold text-[hsl(var(--text-faint))]"
                style={{ fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace' }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <div className="mono font-medium">{d.ensName ?? shortenAddress(d.address)}</div>
                <div className="text-xs text-[hsl(var(--text-dim))]">
                  {d.totalDaosActive ?? 0} DAOs · {formatNumber(d.totalVotesCast ?? 0)} votes cast
                </div>
              </div>
            </div>
            <Badge variant="outline">
              {(Number(d.participationRate ?? 0) * 100).toFixed(0)}% participation
            </Badge>
          </Link>
        ))}
      </div>
    </div>
  );
}
