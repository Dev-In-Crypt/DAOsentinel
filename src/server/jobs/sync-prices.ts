import { syncPrices } from '../services/price-sync';

export async function runPriceSyncJob() {
  const t = Date.now();
  const r = await syncPrices();
  console.log(`[sync-prices] ${JSON.stringify(r)} (${Date.now() - t}ms)`);
  return r;
}

if (require.main === module) {
  runPriceSyncJob()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
