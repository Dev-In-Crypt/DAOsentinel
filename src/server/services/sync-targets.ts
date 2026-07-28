/**
 * Shared, pure decision logic for "which DAOs should this sync run over" —
 * used by syncProposals / syncTreasuries / syncPrices (TODO-056: priority
 * sync path). Extracted into its own pure function (no DB, no network) so
 * the additive/backward-compatible contract has exactly one implementation
 * that can be unit-tested directly, instead of being re-implemented (and
 * potentially diverging) across three separate sync files.
 *
 * Contract:
 *   - `daoIds` omitted (undefined)     -> returns `allDaos` unchanged. This is
 *     the only path every existing caller (today's cron routes) exercises,
 *     so it must be provably a no-op.
 *   - `daoIds` a non-empty array       -> returns only the DAOs whose `id` is
 *     in the list, preserving `allDaos`' original order.
 *   - `daoIds` an explicit empty array -> returns an empty array. This is
 *     deliberately NOT the same as "all DAOs" — an empty array means "sync
 *     these zero specific DAOs," never "no filter was requested."
 */
export function resolveSyncTargets<T extends { id: string }>(
  allDaos: T[],
  daoIds?: string[],
): T[] {
  if (daoIds === undefined) return allDaos;
  if (daoIds.length === 0) return [];
  const idSet = new Set(daoIds);
  return allDaos.filter((dao) => idSet.has(dao.id));
}
