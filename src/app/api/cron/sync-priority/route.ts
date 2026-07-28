import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/server/db';
import { daos, organizations } from '@/server/db/schema';
import { requireCronAuth } from '@/server/api/cron-auth';
import { syncProposals } from '@/server/services/snapshot-sync';
import { syncTreasuries } from '@/server/services/treasury-sync';
import { syncPrices } from '@/server/services/price-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * TODO-056: Priority sync path.
 *
 * Runs the same three sync functions every other cron route already calls
 * (syncProposals, syncTreasuries, syncPrices), but scoped to just the DAOs
 * covered by active `tier = 'priority'` organizations — the "Priority
 * infrastructure" product described on /for-daos ("materially fresher data
 * for your DAO — a faster sync cadence than the standard public schedule").
 *
 * All three data types are refreshed here (not just proposals/votes) because
 * the product copy promises fresher *data* generally, not just governance
 * activity — a priority customer's treasury/price figures should be just as
 * current as their proposal feed.
 *
 * This route only ever narrows what already-existing cron routes do; it
 * never expands or changes the unfiltered "sync everything" path used by
 * sync-proposals / sync-treasuries / sync-prices.
 */
export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  try {
    const activePriorityOrgs = await db
      .select({ daoSlugs: organizations.daoSlugs })
      .from(organizations)
      .where(and(eq(organizations.tier, 'priority'), eq(organizations.active, true)));

    const prioritySlugs = Array.from(new Set(activePriorityOrgs.flatMap((o) => o.daoSlugs)));

    if (prioritySlugs.length === 0) {
      return NextResponse.json({
        ok: true,
        result: {
          noop: true,
          reason: 'no active priority-tier organizations',
          daoCount: 0,
        },
      });
    }

    const targetDaos = await db
      .select({ id: daos.id })
      .from(daos)
      .where(inArray(daos.slug, prioritySlugs));

    const daoIds = targetDaos.map((d) => d.id);

    if (daoIds.length === 0) {
      // Active priority orgs exist, but their dao_slugs didn't resolve to any
      // known DAO row. This must stay a scoped no-op — an empty daoIds array
      // means "sync these zero DAOs," never "no filter was requested" (which
      // would silently fall through to syncing every DAO for everyone).
      return NextResponse.json({
        ok: true,
        result: {
          noop: true,
          reason: 'priority org dao_slugs did not resolve to any known DAO',
          daoCount: 0,
        },
      });
    }

    const proposalsResult = await syncProposals(daoIds);
    const treasuriesResult = await syncTreasuries(daoIds);
    const pricesResult = await syncPrices(daoIds);

    return NextResponse.json({
      ok: true,
      result: {
        daoCount: daoIds.length,
        proposals: proposalsResult,
        treasuries: treasuriesResult,
        prices: pricesResult,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
