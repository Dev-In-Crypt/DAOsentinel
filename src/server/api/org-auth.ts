import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { organizationMembers, organizations } from '../db/schema';
import type { Organization } from '../db/schema';

/**
 * Pure matching logic, deliberately extracted from `requireOrgAccess` so it
 * can be unit-tested with plain fixture data instead of mocking the Drizzle
 * query chain. Given every organization a user belongs to (regardless of
 * `active`/scope), returns the first one that is active AND has `daoSlug`
 * within its `daoSlugs` scope — or null if none qualify.
 */
export function findAccessibleOrg(orgs: Organization[], daoSlug: string): Organization | null {
  for (const org of orgs) {
    if (org.active && org.daoSlugs.includes(daoSlug)) {
      return org;
    }
  }
  return null;
}

export async function requireOrgAccess(
  userId: string,
  daoSlug: string,
): Promise<{ ok: true; organization: Organization } | { ok: false; response: Response }> {
  const rows = await db
    .select({ organization: organizations })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(eq(organizationMembers.userId, userId));

  const match = findAccessibleOrg(
    rows.map((r) => r.organization),
    daoSlug,
  );

  if (!match) {
    // Fail closed. Deliberately do not distinguish "no orgs", "org inactive",
    // and "daoSlug out of scope" in the response — that would leak
    // information about org state to an unauthorized caller.
    return {
      ok: false,
      response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    };
  }

  return { ok: true, organization: match };
}
