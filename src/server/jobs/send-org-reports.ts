import { eq } from 'drizzle-orm';
import { db } from '../db';
import { organizations } from '../db/schema';
import { sendOrgDigestToMembers } from '../services/digest-generator';

/**
 * TODO-073: the scheduled weekly run across every active organization.
 *
 * Until now the paid report had no schedule at all — the only trigger was a
 * human curling /api/cron/send-org-digest with one org id and one DAO slug, so
 * "weekly report" was a promise the system did not keep on its own.
 *
 * Distinct from `runDigestJob` (the public newsletter, one document broadcast
 * to every subscriber) and from `runOrgDigestJob` (one org, one DAO, manual):
 * this walks every active org's `daoSlugs` and produces one report per pair.
 *
 * Two properties matter more than throughput here, because the output is email
 * to paying customers:
 *
 *  - **Idempotent.** Each send goes through `sendOrgDigestToMembers`, which
 *    skips a week already marked sent. A retried workflow, an overlapping
 *    schedule tick, or a manual re-trigger the same week costs nothing and
 *    mails nobody twice.
 *  - **Isolated.** One organization's failure — a DAO slug no longer in the
 *    catalogue, a Resend outage — is caught per pair and reported, never
 *    allowed to abort the orgs after it in the loop.
 */

export interface OrgReportRunItem {
  organizationId: string;
  organizationName: string;
  daoSlug: string;
  status: 'sent' | 'skipped' | 'dry_run' | 'error';
  sent?: number;
  recipientCount?: number;
  reportId?: string;
  weekStart?: string;
  error?: string;
}

export interface OrgReportRunResult {
  organizations: number;
  pairs: number;
  sent: number;
  skipped: number;
  dryRun: number;
  errors: number;
  items: OrgReportRunItem[];
}

export interface RunAllOrgReportsOptions {
  /** The clock, threaded through so the whole run describes one week. */
  now?: Date;
  /** Re-send weeks already marked sent. Never set by the schedule. */
  force?: boolean;
  /** Limit the run to one organization — used by the manual route. */
  organizationId?: string;
}

export async function runAllOrgReportsJob(
  opts: RunAllOrgReportsOptions = {},
): Promise<OrgReportRunResult> {
  const startedAt = Date.now();
  const now = opts.now ?? new Date();

  const orgs = await db
    .select({ id: organizations.id, name: organizations.name, daoSlugs: organizations.daoSlugs })
    .from(organizations)
    .where(eq(organizations.active, true));

  const scoped = opts.organizationId ? orgs.filter((o) => o.id === opts.organizationId) : orgs;

  const items: OrgReportRunItem[] = [];

  // Sequential on purpose. Each pair runs six DB sweeps plus an LLM call and
  // then hands a batch to Resend; fanning that out across every customer at
  // once would spike the connection pool and the mail provider's rate limit to
  // save minutes on a job that runs once a week.
  for (const org of scoped) {
    for (const daoSlug of org.daoSlugs) {
      try {
        const r = await sendOrgDigestToMembers(org.id, daoSlug, { now, force: opts.force });
        items.push({
          organizationId: org.id,
          organizationName: org.name,
          daoSlug,
          status: r.skipped ? 'skipped' : r.dryRun ? 'dry_run' : 'sent',
          sent: r.sent,
          recipientCount: r.recipientCount,
          reportId: r.reportId,
          weekStart: r.weekStart,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[send-org-reports] org=${org.id} dao=${daoSlug} failed:`, err);
        items.push({
          organizationId: org.id,
          organizationName: org.name,
          daoSlug,
          status: 'error',
          error: message,
        });
      }
    }
  }

  const result: OrgReportRunResult = {
    organizations: scoped.length,
    pairs: items.length,
    sent: items.filter((i) => i.status === 'sent').length,
    skipped: items.filter((i) => i.status === 'skipped').length,
    dryRun: items.filter((i) => i.status === 'dry_run').length,
    errors: items.filter((i) => i.status === 'error').length,
    items,
  };

  console.log(
    `[send-org-reports] orgs=${result.organizations} pairs=${result.pairs} sent=${result.sent} skipped=${result.skipped} dryRun=${result.dryRun} errors=${result.errors} (${Date.now() - startedAt}ms)`,
  );

  return result;
}
