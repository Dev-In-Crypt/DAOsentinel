import { generatePendingSummaries } from '../services/ai-summary';

export async function runSummaryJob() {
  const t = Date.now();
  const done = await generatePendingSummaries(50);
  console.log(`[generate-summaries] processed=${done} (${Date.now() - t}ms)`);
  return { done };
}

if (require.main === module) {
  runSummaryJob()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
