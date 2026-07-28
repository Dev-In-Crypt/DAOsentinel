import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { daos } from '../db/schema';
import { resolveSyncTargets } from './sync-targets';

/**
 * Free, no-key DeFiLlama endpoints we can use:
 *   https://api.llama.fi/protocol/<slug>   — full TVL + treasury history
 *   https://api.llama.fi/treasury/<slug>   — treasury snapshot
 *
 * Slug mapping needs hints; for the seed list we map DAO.slug → llama-slug.
 */
const LLAMA_SLUG_MAP: Record<string, string> = {
  uniswap: 'uniswap',
  aave: 'aave',
  ens: 'ens',
  arbitrum: 'arbitrum-dao', // 'arbitrum-foundation' 400s on /treasury endpoint
  optimism: 'optimism-collective', // 'optimism' 400s on /treasury endpoint
  gitcoin: 'gitcoin',
  apecoin: 'apecoin-dao',
  balancer: 'balancer',
  curve: 'curve-dao',
  lido: 'lido',
  sushi: 'sushi',
  decentraland: 'decentraland',
  gnosis: 'gnosis',
  safe: 'safe',
  compound: 'compound',
  '1inch': '1inch-network',
  'rocket-pool': 'rocket-pool',
  convex: 'convex-finance',
  frax: 'frax',
  olympus: 'olympus-v2',
  instadapp: 'instadapp',
  dydx: 'dydx',
  synthetix: 'synthetix',
  makerdao: 'makerdao',
  velodrome: 'velodrome-v2',
  yearn: 'yearn-finance',
  // Second pass — extend coverage to less-mainstream DAOs that exist on DeFiLlama.
  stargate: 'stargate-finance',
  redacted: 'redacted-cartel',
  radiant: 'radiant-capital',
  starknet: 'starknet',
  chainflip: 'chainflip',
  nftx: 'nftx',
  truefi: 'truefi',
  paladin: 'paladin',
  gearbox: 'gearbox',
  'aave-dao': 'aave', // duplicate Snapshot space, same protocol
  'ens-security': 'ens', // ENS Security Council shares ENS treasury
};

/**
 * DeFiLlama /treasury/{slug} returns a protocol-shaped object:
 *   { id, name, currentChainTvls: { ethereum: 123, polygon: 45, ... },
 *     tvl: [{ date, totalLiquidityUSD }, ...], ... }
 *
 * The "treasury" value is the current sum of currentChainTvls — that's the
 * real-time USD across all chains. tvl[] is daily historical snapshots we
 * use as a fallback if currentChainTvls is missing.
 */
interface TreasuryResponse {
  currentChainTvls?: Record<string, number>;
  tvl?: Array<{ date?: number; totalLiquidityUSD?: number }>;
}

async function fetchTreasury(llamaSlug: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.llama.fi/treasury/${llamaSlug}`, {
      headers: { 'user-agent': 'daosentinel/0.1' },
      // Llama has no auth but is sometimes slow.
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) {
      console.warn(`[treasury] ${llamaSlug} HTTP ${r.status}`);
      return null;
    }
    const data = (await r.json()) as TreasuryResponse;

    // Preferred: sum current per-chain TVLs (real-time, no staleness).
    if (data.currentChainTvls && Object.keys(data.currentChainTvls).length > 0) {
      const total = Object.values(data.currentChainTvls).reduce(
        (s, v) => s + (Number(v) || 0),
        0,
      );
      if (total > 0) return total;
    }

    // Fallback: latest snapshot from the historical series.
    const last = data.tvl?.at(-1)?.totalLiquidityUSD;
    if (typeof last === 'number' && last > 0) return last;

    return null;
  } catch (err) {
    console.warn(`[treasury] ${llamaSlug} fetch failed`, (err as Error).message);
    return null;
  }
}

/**
 * `daoIds` (TODO-056, priority sync path) is an OPTIONAL filter. When omitted
 * (every existing caller today), behavior is byte-for-byte identical to
 * before this parameter existed: the same unfiltered `db.select().from(daos)`
 * query runs, with no `where` clause added. When provided:
 *   - a non-empty array narrows the scan to just those DAO ids (via `inArray`).
 *   - an explicit empty array is a no-op — it means "sync these zero DAOs,"
 *     never "no filter," and returns immediately without touching the DB.
 */
export async function syncTreasuries(daoIds?: string[]): Promise<{
  scanned: number;
  updated: number;
  unmapped: number;
}> {
  // Explicit empty list = sync zero DAOs. Never fall through to "sync everything".
  if (daoIds && daoIds.length === 0) {
    return { scanned: 0, updated: 0, unmapped: 0 };
  }

  const rawDaos =
    daoIds && daoIds.length > 0
      ? await db.select().from(daos).where(inArray(daos.id, daoIds))
      : await db.select().from(daos);
  const all = resolveSyncTargets(rawDaos, daoIds);
  let updated = 0;
  let unmapped = 0;

  for (const dao of all) {
    const llamaSlug = LLAMA_SLUG_MAP[dao.slug];
    if (!llamaSlug) {
      unmapped++;
      continue;
    }
    const usd = await fetchTreasury(llamaSlug);
    if (usd == null) continue;

    await db
      .update(daos)
      .set({ treasuryUsd: usd.toFixed(2), updatedAt: sql`now()` })
      .where(eq(daos.id, dao.id));
    updated++;
  }

  return { scanned: all.length, updated, unmapped };
}
