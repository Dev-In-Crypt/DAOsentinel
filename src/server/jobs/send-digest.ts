import { generateDigest, sendDigestToSubscribers } from '../services/digest-generator';

export async function runDigestJob() {
  const t = Date.now();
  const digest = await generateDigest();
  if (!digest) return { sent: 0 };
  const sent = await sendDigestToSubscribers(digest.id);
  console.log(`[send-digest] id=${digest.id} sent=${sent} (${Date.now() - t}ms)`);
  return { digestId: digest.id, sent };
}

if (require.main === module) {
  runDigestJob()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
