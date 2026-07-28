import { timeAgo } from './utils';

/**
 * TODO-057: "Priority sync" visible badge — a proof-of-value UI signal shown
 * to paying priority-tier customers on their private org dashboard
 * (src/app/(app)/org/[orgId]/[daoSlug]/page.tsx).
 *
 * Pure decision/formatting logic, deliberately extracted from the page
 * component so it can be unit-tested without rendering React or hitting the
 * DB — mirrors the pattern used for findAccessibleOrg in
 * src/server/api/org-auth.ts.
 */

/** The subset of `Organization` this module actually needs. */
export interface PrioritySyncBadgeOrg {
  tier: string;
  active: boolean | null;
}

/**
 * Whether the priority-sync badge should be shown for the org viewing this
 * dashboard. Mirrors the exact predicate the priority-sync cron route
 * (src/app/api/cron/sync-priority/route.ts) uses to select which
 * organizations' DAOs get the faster sync cadence
 * (`tier = 'priority' AND active = true`) — the badge should only ever
 * appear for orgs that are actually covered by that job.
 */
export function shouldShowPrioritySyncBadge(org: PrioritySyncBadgeOrg): boolean {
  return org.tier === 'priority' && org.active === true;
}

/**
 * Formats the badge label, e.g. "⚡ Priority sync — updated 5s ago".
 *
 * `lastSyncedAt` should be `daos.updatedAt`, not `daos.scoreUpdatedAt`: of
 * the three sync functions the priority-sync cron route calls
 * (syncProposals, syncTreasuries, syncPrices — see
 * src/server/services/{snapshot-sync,treasury-sync,price-sync}.ts),
 * syncTreasuries and syncPrices both write `updatedAt: sql\`now()\`` directly
 * onto the `daos` row on every run. `scoreUpdatedAt` is only bumped by the
 * unrelated democracy-score recompute job (src/server/services/
 * democracy-score.ts), which the priority-sync route never calls, so it
 * would not move in response to priority sync activity at all.
 */
export function formatPrioritySyncBadgeLabel(lastSyncedAt: Date | string | number): string {
  return `⚡ Priority sync — updated ${timeAgo(lastSyncedAt)}`;
}
