import { unstable_cache } from 'next/cache';
import { desc, eq, gt, sql, and } from 'drizzle-orm';
import { db } from './db';
import { daos, proposals, alerts, scoreHistory } from './db/schema';
import type { OrbitalDao } from '@/components/orbital/Planet';
import { TRACKED_DAOS } from '@/lib/constants';

const DAO_PALETTE: Record<string, { color: string; glow: string; mono: string }> = {
  uniswap: { color: '#FF2D78', glow: 'rgba(255,45,120,0.6)', mono: 'UNI' },
  optimism: { color: '#FF4654', glow: 'rgba(255,70,84,0.6)', mono: 'OP' },
  ens: { color: '#5298FF', glow: 'rgba(82,152,255,0.6)', mono: 'ENS' },
  lido: { color: '#54B6F0', glow: 'rgba(84,182,240,0.6)', mono: 'LDO' },
  arbitrum: { color: '#29A3F0', glow: 'rgba(41,163,240,0.6)', mono: 'ARB' },
  gitcoin: { color: '#12B981', glow: 'rgba(18,185,129,0.6)', mono: 'GTC' },
  aave: { color: '#B6509E', glow: 'rgba(182,80,158,0.6)', mono: 'AAVE' },
  curve: { color: '#F7C948', glow: 'rgba(247,201,72,0.55)', mono: 'CRV' },
  makerdao: { color: '#1AAB9B', glow: 'rgba(26,171,155,0.6)', mono: 'SKY' },
  safe: { color: '#12B886', glow: 'rgba(18,184,134,0.6)', mono: 'SAFE' },
  compound: { color: '#00D395', glow: 'rgba(0,211,149,0.6)', mono: 'COMP' },
  apecoin: { color: '#0066FF', glow: 'rgba(0,102,255,0.6)', mono: 'APE' },
};

const FALLBACK_COLORS = [
  '#FF2D78', '#29A3F0', '#12B981', '#FBBF24', '#F43F5E', '#22D3EE', '#818CF8', '#B6509E',
];

function paletteFor(slug: string, token: string | null, idx: number) {
  if (DAO_PALETTE[slug]) return DAO_PALETTE[slug];
  const color = FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
  return {
    color,
    glow: color + '99',
    mono: (token ?? slug.slice(0, 4)).toUpperCase().slice(0, 4),
  };
}

function tagFor(score: number): { tag: 'good' | 'watch' | 'risk'; label: string } {
  if (score >= 70) return { tag: 'good', label: 'Healthy' };
  if (score >= 55) return { tag: 'watch', label: 'Watch' };
  return { tag: 'risk', label: 'At Risk' };
}

function formatTreasury(usd: number | null | string): string {
  const v = Number(usd ?? 0);
  if (!Number.isFinite(v) || v === 0) return '—';
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${(v / 1e3).toFixed(0)}K`;
}

export interface LandingData {
  daos: OrbitalDao[];
  aggregateScore: number;
  scoreTrend: number;
  stats: {
    treasuryUsd: number;
    proposalsTracked: number;
    whaleAlerts24h: number;
    networkHealth: number;
  };
  monitoredCount: number;
  chains: number;
}

const EMPTY_LANDING: LandingData = {
  daos: [],
  aggregateScore: 0,
  scoreTrend: 0,
  stats: { treasuryUsd: 0, proposalsTracked: 0, whaleAlerts24h: 0, networkHealth: 0 },
  monitoredCount: TRACKED_DAOS.length,
  chains: new Set(TRACKED_DAOS.map((d) => d.chain)).size,
};

async function _loadLandingData(): Promise<LandingData> {
  try {
    // Fan out the 3 independent queries in parallel.
    const [allDaos, totalsResult, trendResult] = await Promise.all([
      db.select().from(daos).orderBy(desc(daos.democracyScore)).limit(12),
      db.execute(sql`
        SELECT
          (SELECT count(*) FROM daos)::int AS daos,
          (SELECT count(*) FROM proposals)::int AS proposals,
          (SELECT count(*) FROM alerts
             WHERE type = 'whale_vote' AND created_at > now() - interval '24 hours')::int AS whales24,
          (SELECT coalesce(sum(treasury_usd), 0) FROM daos)::numeric AS treasury
      `),
      db.execute(sql`
        SELECT avg(score::numeric) AS prev FROM score_history
        WHERE computed_at <= now() - interval '30 days'
      `),
    ]);

    if (allDaos.length === 0) return EMPTY_LANDING;

    const totalsArr = totalsResult as unknown as Array<{
      daos: number;
      proposals: number;
      whales24: number;
      treasury: string;
    }>;
    const totals = totalsArr[0];

    const trendArr = trendResult as unknown as Array<{ prev: string | null }>;
    const avgScore =
      allDaos.reduce((s, d) => s + Number(d.democracyScore ?? 0), 0) / Math.max(allDaos.length, 1);
    const prev = Number(trendArr[0]?.prev ?? avgScore);
    const trend = avgScore - prev;

    // ===== Recent proposals: 1 query for ALL 12 DAOs instead of N+1 =====
    // Postgres LATERAL with a per-DAO limit-3 sub-select. ~10x faster than
    // 12 sequential round-trips through the Supabase pooler.
    const daoIds = allDaos.map((d) => d.id);
    const recentRows = (await db.execute(sql`
      SELECT
        rp.dao_id,
        rp.title,
        rp.state,
        rp.quorum_reached,
        rp.votes_count
      FROM unnest(${sql.raw(`ARRAY[${daoIds.map((id) => `'${id}'::uuid`).join(',')}]`)}) AS d(dao_id)
      CROSS JOIN LATERAL (
        SELECT title, state, quorum_reached, votes_count, dao_id
        FROM proposals
        WHERE dao_id = d.dao_id
        ORDER BY created_at DESC
        LIMIT 3
      ) rp
    `)) as unknown as Array<{
      dao_id: string;
      title: string;
      state: string;
      quorum_reached: boolean | null;
      votes_count: number | null;
    }>;

    const recentByDao = new Map<string, typeof recentRows>();
    for (const row of recentRows) {
      const arr = recentByDao.get(row.dao_id) ?? [];
      arr.push(row);
      recentByDao.set(row.dao_id, arr);
    }

    const placed: OrbitalDao[] = allDaos.map((d, i) => {
      const palette = paletteFor(d.slug, d.governanceToken, i);
      const score = Number(d.democracyScore ?? 0);
      const tagInfo = tagFor(score);
      const breakdown = (d.scoreBreakdown ?? {}) as Record<string, number>;
      const recent = recentByDao.get(d.id) ?? [];

      return {
        id: d.id,
        slug: d.slug,
        name: d.name,
        mono: palette.mono,
        color: palette.color,
        glow: palette.glow,
        score,
        tag: tagInfo.tag,
        tagLabel: tagInfo.label,
        turnout: breakdown.participation ?? 0,
        proposals30: d.totalProposals ?? 0,
        treasury: formatTreasury(d.treasuryUsd),
        holders: d.totalVoters ? `${(d.totalVoters / 1000).toFixed(0)}K` : '—',
        breakdown,
        recentProposals: recent.map((p) => ({
          title: p.title,
          status:
            p.state === 'active'
              ? ('live' as const)
              : p.quorum_reached
                ? ('pass' as const)
                : ('fail' as const),
          sub:
            p.state === 'active'
              ? 'live vote'
              : p.quorum_reached
                ? `${p.votes_count ?? 0} voters`
                : 'no quorum',
        })),
      };
    });

    return {
      daos: placed,
      aggregateScore: avgScore || 0,
      scoreTrend: trend || 0,
      stats: {
        treasuryUsd: Number(totals?.treasury ?? 0),
        proposalsTracked: totals?.proposals ?? 0,
        whaleAlerts24h: totals?.whales24 ?? 0,
        networkHealth: avgScore || 0,
      },
      monitoredCount: totals?.daos ?? TRACKED_DAOS.length,
      chains: new Set(TRACKED_DAOS.map((d) => d.chain)).size,
    };
  } catch (err) {
    console.warn('landing data fallback (DB unavailable)', err);
    return EMPTY_LANDING;
  }
}

/**
 * Cached wrapper — landing data is the same for every visitor and refreshes
 * every 60 s. The expensive UNNEST + LATERAL query only runs once per minute
 * regardless of traffic.
 */
export const loadLandingData = unstable_cache(_loadLandingData, ['landing-data-v1'], {
  revalidate: 60,
  tags: ['landing'],
});
