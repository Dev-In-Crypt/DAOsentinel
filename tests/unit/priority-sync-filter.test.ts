import { describe, it, expect } from 'vitest';
import { resolveSyncTargets } from '@/server/services/sync-targets';

/**
 * TODO-056: proves the additive/backward-compatible guarantee for the
 * optional `daoIds` filter added to syncProposals / syncTreasuries /
 * syncPrices. Each of those functions delegates the "which DAOs should this
 * sync run over" decision to `resolveSyncTargets`, so exercising that one
 * pure function here is sufficient to prove the contract for all three —
 * without needing to mock Snapshot GraphQL, DeFiLlama, or CoinGecko.
 */
describe('resolveSyncTargets (additive daoIds filter — no-regression guarantee)', () => {
  const allDaos = [
    { id: 'dao-1', slug: 'uniswap' },
    { id: 'dao-2', slug: 'aave' },
    { id: 'dao-3', slug: 'ens' },
  ];

  it('returns all DAOs unchanged when daoIds is omitted (today\'s exact behavior)', () => {
    const result = resolveSyncTargets(allDaos);
    expect(result).toBe(allDaos); // same reference: zero transformation applied
    expect(result).toEqual(allDaos);
  });

  it('returns all DAOs unchanged when daoIds is explicitly undefined', () => {
    const result = resolveSyncTargets(allDaos, undefined);
    expect(result).toEqual(allDaos);
  });

  it('returns only the matching subset when daoIds is a non-empty array', () => {
    const result = resolveSyncTargets(allDaos, ['dao-2']);
    expect(result).toEqual([{ id: 'dao-2', slug: 'aave' }]);
  });

  it('returns multiple matches in original order when daoIds lists several ids out of order', () => {
    const result = resolveSyncTargets(allDaos, ['dao-3', 'dao-1']);
    expect(result).toEqual([
      { id: 'dao-1', slug: 'uniswap' },
      { id: 'dao-3', slug: 'ens' },
    ]);
  });

  it('ignores unknown ids in daoIds without throwing', () => {
    const result = resolveSyncTargets(allDaos, ['dao-2', 'does-not-exist']);
    expect(result).toEqual([{ id: 'dao-2', slug: 'aave' }]);
  });

  it('THE FOOTGUN: an explicit empty array returns an empty array, NOT all DAOs', () => {
    const result = resolveSyncTargets(allDaos, []);
    expect(result).toEqual([]);
    expect(result).not.toEqual(allDaos);
  });

  it('an explicit empty array on an empty allDaos list is still an empty array', () => {
    expect(resolveSyncTargets([], [])).toEqual([]);
  });

  it('undefined vs. empty array produce different results on the same input (the whole point)', () => {
    const withUndefined = resolveSyncTargets(allDaos, undefined);
    const withEmpty = resolveSyncTargets(allDaos, []);
    expect(withUndefined).toEqual(allDaos);
    expect(withEmpty).toEqual([]);
    expect(withUndefined).not.toEqual(withEmpty);
  });
});
