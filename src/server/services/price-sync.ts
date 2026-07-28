import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { daos } from '../db/schema';
import { resolveSyncTargets } from './sync-targets';

/**
 * Free CoinGecko endpoint: /api/v3/simple/price?ids=...&vs_currencies=usd
 * Up to ~50 ids per call without an API key. We batch to one request per run.
 */
const COINGECKO_ENDPOINT = 'https://api.coingecko.com/api/v3/simple/price';

/**
 * Map DAO.slug → CoinGecko coin id. Token symbols on CoinGecko don't always
 * match the on-chain ticker (e.g. UNI = "uniswap"), so we explicitly enumerate.
 * DAOs not in this map keep `tokenPriceUsd` null.
 */
const COINGECKO_ID_MAP: Record<string, string> = {
  uniswap: 'uniswap',
  aave: 'aave',
  'aave-dao': 'aave',
  ens: 'ethereum-name-service',
  'ens-security': 'ethereum-name-service',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  gitcoin: 'gitcoin',
  apecoin: 'apecoin',
  balancer: 'balancer',
  curve: 'curve-dao-token',
  lido: 'lido-dao',
  sushi: 'sushi',
  decentraland: 'decentraland',
  gnosis: 'gnosis',
  safe: 'safe',
  compound: 'compound-governance-token',
  '1inch': '1inch',
  'rocket-pool': 'rocket-pool',
  convex: 'convex-finance',
  frax: 'frax-share',
  olympus: 'olympus',
  instadapp: 'instadapp',
  dydx: 'dydx-chain',
  synthetix: 'havven',
  makerdao: 'maker',
  velodrome: 'velodrome-finance',
  yearn: 'yearn-finance',
  stargate: 'stargate-finance',
  starknet: 'starknet',
  radiant: 'radiant-capital',
  aavegotchi: 'aavegotchi',
};

/**
 * `daoIds` (TODO-056, priority sync path) is an OPTIONAL filter. When omitted
 * (every existing caller today), behavior is byte-for-byte identical to
 * before this parameter existed: the same unfiltered `db.select().from(daos)`
 * query runs, with no `where` clause added. When provided:
 *   - a non-empty array narrows the scan to just those DAO ids (via `inArray`).
 *   - an explicit empty array is a no-op — it means "sync these zero DAOs,"
 *     never "no filter," and returns immediately without touching the DB.
 */
export async function syncPrices(daoIds?: string[]): Promise<{
  scanned: number;
  updated: number;
  unmapped: number;
  noPrice: number;
}> {
  // Explicit empty list = sync zero DAOs. Never fall through to "sync everything".
  if (daoIds && daoIds.length === 0) {
    return { scanned: 0, updated: 0, unmapped: 0, noPrice: 0 };
  }

  const rawDaos =
    daoIds && daoIds.length > 0
      ? await db.select().from(daos).where(inArray(daos.id, daoIds))
      : await db.select().from(daos);
  const all = resolveSyncTargets(rawDaos, daoIds);
  let updated = 0;
  let unmapped = 0;
  let noPrice = 0;

  // Build the unique set of CoinGecko ids we need
  const idMap: Record<string, string> = {}; // dao.slug → coingecko id
  for (const dao of all) {
    const cgId = COINGECKO_ID_MAP[dao.slug];
    if (cgId) {
      idMap[dao.slug] = cgId;
    } else {
      unmapped++;
    }
  }
  const uniqueIds = Array.from(new Set(Object.values(idMap)));
  if (uniqueIds.length === 0) {
    return { scanned: all.length, updated: 0, unmapped, noPrice: 0 };
  }

  let prices: Record<string, { usd?: number }> = {};
  try {
    const url = `${COINGECKO_ENDPOINT}?ids=${uniqueIds.join(',')}&vs_currencies=usd`;
    const r = await fetch(url, {
      headers: { 'user-agent': 'daosentinel/0.1', accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) {
      console.warn(`[prices] CoinGecko HTTP ${r.status}`);
      return { scanned: all.length, updated: 0, unmapped, noPrice: 0 };
    }
    prices = (await r.json()) as Record<string, { usd?: number }>;
  } catch (err) {
    console.warn('[prices] CoinGecko fetch failed', (err as Error).message);
    return { scanned: all.length, updated: 0, unmapped, noPrice: 0 };
  }

  for (const dao of all) {
    const cgId = idMap[dao.slug];
    if (!cgId) continue;
    const usd = prices[cgId]?.usd;
    if (typeof usd !== 'number') {
      noPrice++;
      continue;
    }
    await db
      .update(daos)
      .set({ tokenPriceUsd: usd.toFixed(8), updatedAt: sql`now()` })
      .where(eq(daos.id, dao.id));
    updated++;
  }

  return { scanned: all.length, updated, unmapped, noPrice };
}
