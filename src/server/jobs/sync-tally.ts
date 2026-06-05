import { syncTallyProposals } from '../services/tally-sync';

export async function runTallySyncJob(opts: { offset?: number; limit?: number } = {}) {
  const started = Date.now();
  const result = await syncTallyProposals(opts);
  console.log(`[sync-tally] done in ${Date.now() - started}ms`, result);
  return result;
}

if (require.main === module) {
  runTallySyncJob()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
