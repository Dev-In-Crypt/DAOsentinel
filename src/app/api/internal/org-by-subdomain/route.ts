import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/server/db';
import { organizations } from '@/server/db/schema';

// Node runtime (not Edge): this is the only place allowed to touch Postgres
// for the white-label subdomain flow (TODO-058) — see src/middleware.ts for
// why the lookup can't happen in middleware itself.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Internal-only lookup used by src/middleware.ts to resolve a white-label
 * subdomain's org branding. Not documented publicly, not linked from
 * /api-docs, and takes no auth: the data returned (branding + which DAOs are
 * in scope) is exactly what's meant to be publicly visible on the branded
 * subdomain itself, so there's nothing here worth gating. Deliberately keeps
 * the response minimal — no stripeCustomerId, billing email, etc.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const subdomain = url.searchParams.get('subdomain')?.trim().toLowerCase();

  if (!subdomain) {
    return NextResponse.json({ error: 'missing subdomain' }, { status: 400 });
  }

  const [org] = await db
    .select({
      name: organizations.name,
      daoSlugs: organizations.daoSlugs,
      brandingLogoUrl: organizations.brandingLogoUrl,
      brandingPrimaryColor: organizations.brandingPrimaryColor,
      brandingDisplayName: organizations.brandingDisplayName,
    })
    .from(organizations)
    .where(and(eq(organizations.subdomain, subdomain), eq(organizations.active, true)))
    .limit(1);

  if (!org) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return NextResponse.json(org, {
    headers: { 'Cache-Control': 'private, max-age=30' },
  });
}
