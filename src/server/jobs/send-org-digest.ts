import { sendOrgDigestToMembers } from '../services/digest-generator';

/**
 * TODO-055: Org-scoped private weekly report job.
 *
 * Mirrors `runDigestJob` (src/server/jobs/send-digest.ts, the PUBLIC digest
 * path) in shape, but scoped to a single organization + DAO and delivered to
 * that org's member emails rather than `newsletterSubscribers`. Does not
 * modify or call into the public digest job — this is a fully separate path.
 */
export async function runOrgDigestJob(
  organizationId: string,
  daoSlug: string,
  opts: { force?: boolean } = {},
) {
  const t = Date.now();
  const result = await sendOrgDigestToMembers(organizationId, daoSlug, opts);
  console.log(
    `[send-org-digest] org=${organizationId} dao=${daoSlug} sent=${result.sent} skipped=${result.skipped} dryRun=${result.dryRun} (${Date.now() - t}ms)`,
  );
  return result;
}
