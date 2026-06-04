import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { daos } from '../db/schema';

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
  arbitrum: 'arbitrum-foundation',
  optimism: 'optimism',
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
};

interface TreasuryResponse {
  // Llama treasury endpoint returns an array of token holdings; we sum USD value.
  tokensInUsd?: Array<{ date?: number; tokens?: Record<string, number> }>;
  currentTreasuryUsd?: number;
}

async function fetchTreasury(llamaSlug: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.llama.fi/treasury/${llamaSlug}`, {
      headers: { 'user-agent': 'daosentinel/0.1' },
      // Llama has no auth but is sometimes slow.
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return null;
    const data = (await r.json()) as TreasuryResponse;
    if (typeof data.currentTreasuryUsd === 'number') return data.currentTreasuryUsd;
    const last = data.tokensInUsd?.at(-1)?.tokens;
    if (!last) return null;
    return Object.values(last).reduce((s, v) => s + (Number(v) || 0), 0);
  } catch {
    return null;
  }
}

export async function syncTreasuries(): Promise<{
  scanned: number;
  updated: number;
  unmapped: number;
}> {
  const all = await db.select().from(daos);
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
