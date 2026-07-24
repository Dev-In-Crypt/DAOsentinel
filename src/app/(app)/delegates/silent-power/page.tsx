import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { shortenAddress, formatNumber } from '@/lib/utils';
import { scoreSilentPower } from '@/server/services/delegate-inactivity';

// Dynamic: this no-param page queries the DB per request. ISR would force a
// build-time prerender that hits the database — which fails in CI (no DB).
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Silent Power — DAO Sentinel',
  description:
    'Delegates ranked by voting power sitting idle — high-VP addresses that have gone quiet.',
};

interface SilentPowerRow {
  id: string;
  address: string;
  ens_name: string | null;
  max_voting_power: string;
  last_vote_at: string | null;
}

export default async function SilentPowerPage() {
  const rows = await db.execute(sql`
    SELECT
      d.id, d.address, d.ens_name,
      max(da.voting_power::numeric) AS max_voting_power,
      (SELECT max(v.created_at) FROM votes v WHERE v.voter_address = d.address) AS last_vote_at
    FROM delegates d
    JOIN delegate_dao_activity da ON da.delegate_id = d.id
    GROUP BY d.id
    HAVING max(da.voting_power::numeric) > 0
    ORDER BY max(da.voting_power::numeric) DESC
    LIMIT 500
  `);
  const candidates = rows as unknown as SilentPowerRow[];
  const maxVp = candidates.length > 0 ? Math.max(...candidates.map((c) => Number(c.max_voting_power))) : 0;
  const now = Date.now();

  const scored = candidates
    .map((c) => {
      const votingPower = Number(c.max_voting_power);
      const daysSinceLastVote = c.last_vote_at
        ? (now - new Date(c.last_vote_at).getTime()) / (1000 * 60 * 60 * 24)
        : null;
      const score = scoreSilentPower({
        votingPowerNorm: maxVp > 0 ? votingPower / maxVp : 0,
        daysSinceLastVote,
      });
      return {
        id: c.id,
        address: c.address,
        ensName: c.ens_name,
        votingPower,
        daysSinceLastVote,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 100);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Power without accountability"
        title="Silent"
        highlight="Power"
        description="Delegates ranked by voting power × time since their last vote — a high-VP address gone quiet is a bigger risk than a whale who shows up. Not an accusation, a transparency signal."
      />

      <div className="glass-card divide-y divide-[hsl(var(--line))] p-0">
        {scored.length === 0 && (
          <div className="p-12 text-center text-sm text-[hsl(var(--text-dim))]">
            Not enough delegate data yet — check back after the next rebuild.
          </div>
        )}
        {scored.map((r, i) => (
          <Link
            key={r.id}
            href={`/delegates/${r.address}`}
            title={`Voting power: ${formatNumber(r.votingPower)} · ${
              r.daysSinceLastVote != null
                ? `last voted ${Math.floor(r.daysSinceLastVote)}d ago`
                : 'no recorded vote'
            }`}
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
                <div className="mono font-medium">{r.ensName ?? shortenAddress(r.address)}</div>
                <div className="text-xs text-[hsl(var(--text-dim))]">
                  {formatNumber(r.votingPower)} VP ·{' '}
                  {r.daysSinceLastVote != null
                    ? `silent ${Math.floor(r.daysSinceLastVote)}d`
                    : 'no recorded vote'}
                </div>
              </div>
            </div>
            <Badge variant={r.score > 0.66 ? 'destructive' : r.score > 0.33 ? 'secondary' : 'outline'}>
              {(r.score * 100).toFixed(0)} silent
            </Badge>
          </Link>
        ))}
      </div>
    </div>
  );
}
