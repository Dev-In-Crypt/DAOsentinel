import { eq } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { users } from '@/server/db/schema';
import { requireOrgAccess } from './org-auth';

/**
 * The shared gate for every paid-report surface: the report page, the archive
 * page, and the PDF route.
 *
 * These three had begun to carry byte-identical copies of the same four steps,
 * which is exactly how an authorisation check drifts — one gets a new
 * condition and the others quietly don't. One implementation, one place to
 * change.
 *
 * The fourth step is not redundant: `requireOrgAccess` proves only that *some*
 * organization the caller belongs to covers `daoSlug`, not that it is the
 * organization named in the URL. Without the explicit id comparison, a member
 * of Org A could read Org B's report by swapping the id in the path whenever
 * both orgs happen to watch the same DAO.
 *
 * Returns `null` for every failure — no session, no user row, no access, wrong
 * org — so callers cannot accidentally distinguish "does not exist" from "not
 * yours" in what they render.
 */
export interface OrgReportAccess {
  userId: string;
  organizationId: string;
}

export async function resolveOrgReportAccess(
  orgId: string,
  daoSlug: string,
): Promise<OrgReportAccess | null> {
  const session = await auth();
  if (!session?.user?.email) return null;

  const [user] = await db.select().from(users).where(eq(users.email, session.user.email)).limit(1);
  if (!user) return null;

  const access = await requireOrgAccess(user.id, daoSlug);
  if (!access.ok) return null;
  if (access.organization.id !== orgId) return null;

  return { userId: user.id, organizationId: access.organization.id };
}
