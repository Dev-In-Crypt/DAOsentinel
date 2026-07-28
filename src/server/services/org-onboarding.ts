import { Resend } from 'resend';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { organizations, daos } from '../db/schema';
import { renderOrgOnboarding } from '../email/render';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'DAO Sentinel <noreply@daosentinel.xyz>';
const APP_BASE = process.env.NEXTAUTH_URL || 'https://www.daosentinel.xyz';

export interface DaoLink {
  daoName: string;
  daoSlug: string;
  url: string;
}

/**
 * Pure builder for the per-DAO dashboard links an onboarding email lists —
 * extracted so the URL-building/ordering logic is unit-testable without a
 * live DB, same discipline as `digestScope`/`resolveSyncTargets`.
 *
 * An "all DAOs" org (`daoSlugs: []`, TODO-062) has no single dashboard route
 * to link to (only `/org/[orgId]/[daoSlug]` exists, no `/org/[orgId]`
 * landing page) — callers should treat an empty result as "skip sending",
 * not as an error.
 */
export function buildDaoLinks(
  organizationId: string,
  daoSlugs: string[],
  daoRows: Array<{ slug: string; name: string }>,
): DaoLink[] {
  const nameBySlug = new Map(daoRows.map((d) => [d.slug, d.name]));
  return daoSlugs
    .filter((slug) => nameBySlug.has(slug))
    .map((slug) => ({
      daoName: nameBySlug.get(slug)!,
      daoSlug: slug,
      url: `${APP_BASE}/org/${organizationId}/${slug}`,
    }));
}

/**
 * Sends the "your dashboard is ready" onboarding email to a newly-added org
 * member. Follows the same `resend ? send : dry-run-log` guard used
 * throughout this codebase (auth.ts, notifier.ts, digest-generator.ts) —
 * single recipient, no batching needed.
 */
export async function sendOrgOnboardingEmail(
  organizationId: string,
  memberEmail: string,
): Promise<{ sent: boolean; dryRun: boolean; reason?: string }> {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!org) {
    return { sent: false, dryRun: false, reason: 'organization not found' };
  }

  if (org.daoSlugs.length === 0) {
    console.log(
      `[org-onboarding] org ${organizationId} has no daoSlugs scoped — skipping onboarding email (no per-DAO link to send)`,
    );
    return { sent: false, dryRun: false, reason: 'org has no daoSlugs (all-DAOs org — no per-DAO link to send)' };
  }

  const daoRows = await db
    .select({ slug: daos.slug, name: daos.name })
    .from(daos)
    .where(inArray(daos.slug, org.daoSlugs));

  const daoLinks = buildDaoLinks(organizationId, org.daoSlugs, daoRows);
  if (daoLinks.length === 0) {
    console.log(
      `[org-onboarding] org ${organizationId}'s daoSlugs did not resolve to any known DAO — skipping onboarding email`,
    );
    return { sent: false, dryRun: false, reason: 'daoSlugs did not resolve to any known DAO' };
  }

  const html = await renderOrgOnboarding({
    organizationName: org.name,
    brandingDisplayName: org.brandingDisplayName,
    daoLinks,
  });

  if (!resend) {
    console.warn(
      `[org-onboarding] RESEND_API_KEY missing — dry run only. org=${organizationId} to=${memberEmail}`,
    );
    return { sent: false, dryRun: true };
  }

  const subject = `Your ${org.brandingDisplayName ?? org.name} dashboard is ready`;
  await resend.emails.send({ from: EMAIL_FROM, to: memberEmail, subject, html });
  return { sent: true, dryRun: false };
}
