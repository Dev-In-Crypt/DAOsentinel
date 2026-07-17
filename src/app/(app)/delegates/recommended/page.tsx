import Link from 'next/link';
import { db } from '@/server/db';
import { delegates } from '@/server/db/schema';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { shortenAddress } from '@/lib/utils';
import { scoreDelegate } from '@/server/services/delegate-recommendations';

// Dynamic: this no-param page queries the DB per request. ISR would force a
// build-time prerender that hits the database — which fails in CI (no DB).
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Recommended Delegates — DAO Sentinel',
  description:
    'Delegates ranked by a transparent formula over participation, Karma reputation, cross-DAO activity, and response time.',
};

export default async function RecommendedDelegatesPage() {
  const rows = await db.select().from(delegates).limit(500);

  const scored = rows
    .map((d) => {
      const participationRate = d.participationRate != null ? Number(d.participationRate) : null;
      const karmaScore = d.karmaScore != null ? Number(d.karmaScore) : null;
      const totalDaosActive = d.totalDaosActive;
      const avgResponseTimeHours =
        d.avgResponseTimeHours != null ? Number(d.avgResponseTimeHours) : null;
      const score = scoreDelegate({
        participationRate,
        karmaScore,
        totalDaosActive,
        avgResponseTimeHours,
      });
      return { delegate: d, score, participationRate, karmaScore, totalDaosActive, avgResponseTimeHours };
    })
    // Exclude delegates with no usable signal at all — a 0 score from
    // missing data reads very differently from a 0 score from poor
    // performance, so we don't want to rank them side by side.
    .filter(
      (r) =>
        r.participationRate != null ||
        r.karmaScore != null ||
        r.totalDaosActive != null ||
        r.avgResponseTimeHours != null,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 100);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Based on public activity signals"
        title="Recommended"
        highlight="Delegates"
        description="Ranked by a transparent formula — participation, Karma reputation, cross-DAO activity, and response time. Not financial advice, not an endorsement."
      />

      <div className="glass-card divide-y divide-[hsl(var(--line))] p-0">
        {scored.length === 0 && (
          <div className="p-12 text-center text-sm text-[hsl(var(--text-dim))]">
            Not enough delegate data yet — check back after the next rebuild.
          </div>
        )}
        {scored.map((r, i) => {
          const breakdown = [
            r.participationRate != null ? `participation ${(r.participationRate * 100).toFixed(0)}%` : null,
            r.karmaScore != null ? `Karma ${r.karmaScore.toFixed(0)}` : null,
            r.totalDaosActive != null ? `${r.totalDaosActive} DAOs active` : null,
            r.avgResponseTimeHours != null ? `~${r.avgResponseTimeHours.toFixed(1)}h response` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <Link
              key={r.delegate.id}
              href={`/delegates/${r.delegate.address}`}
              title={`Score breakdown: ${breakdown || 'limited data'}`}
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
                  <div className="mono font-medium">
                    {r.delegate.ensName ?? shortenAddress(r.delegate.address)}
                  </div>
                  <div className="text-xs text-[hsl(var(--text-dim))]">
                    {breakdown || 'Limited data'}
                  </div>
                </div>
              </div>
              <Badge variant="outline">{(r.score * 100).toFixed(0)} score</Badge>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
