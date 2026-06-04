import { rebuildDelegateProfiles, resolveDelegateEns } from '../services/delegate-tracker';

export async function runRebuildDelegatesJob() {
  const t = Date.now();
  const r = await rebuildDelegateProfiles();
  // Best-effort ENS resolve on the most active 100 delegates so the leaderboard
  // shows nice names instead of bare addresses.
  const resolved = await resolveDelegateEns(100);
  console.log(
    `[rebuild-delegates] delegates=${r.delegates} activities=${r.activities} ens=${resolved} (${Date.now() - t}ms)`,
  );
  return { ...r, ensResolved: resolved };
}

if (require.main === module) {
  runRebuildDelegatesJob()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
