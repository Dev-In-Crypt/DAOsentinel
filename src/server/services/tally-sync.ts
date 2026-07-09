import { and, eq, isNotNull, ne } from 'drizzle-orm';
import { db } from '../db';
import { daos, proposals } from '../db/schema';
import {
  fetchTallyProposals,
  mapTallyState,
  tallyTsToDate,
  deriveTallyTitle,
  type TallyProposalRaw,
} from '@/lib/tally-client';
import { TRACKED_DAOS } from '@/lib/constants';

/**
 * Mirror TRACKED_DAOS.tallyOrgId into the daos row on first run, so we don't
 * need a separate manual reseed when this feature ships to an existing DB.
 *
 * If a DAO already has a tally_org_id but it differs from the constant
 * (i.e. the constant got corrected after we'd already ingested proposals
 * under the wrong org), wipe its source='tally' rows so the next fetch
 * re-populates against the correct organisation. Without this, proposals
 * that originally belonged to org A would stay stuck on the DAO that's now
 * pointed at org B.
 */
async function backfillTallyOrgIds(): Promise<{ touched: number; wiped: number }> {
  let touched = 0;
  let wiped = 0;
  for (const t of TRACKED_DAOS) {
    if (!t.tallyOrgId) continue;
    const [row] = await db
      .select({ id: daos.id, currentOrgId: daos.tallyOrgId })
      .from(daos)
      .where(eq(daos.slug, t.slug))
      .limit(1);
    if (!row) continue;

    if (row.currentOrgId && row.currentOrgId !== t.tallyOrgId) {
      const del = await db
        .delete(proposals)
        .where(and(eq(proposals.daoId, row.id), eq(proposals.source, 'tally')))
        .returning({ id: proposals.id });
      wiped += del.length;
    }

    await db.update(daos).set({ tallyOrgId: t.tallyOrgId }).where(eq(daos.id, row.id));
    touched++;
  }
  return { touched, wiped };
}

interface TallySyncResult {
  daos: number;
  fetched: number;
  upserted: number;
  skipped: number;
  errors: number;
  skipReason?: string;
  wiped?: number;
}

/**
 * For each DAO with a tallyOrgId, pull recent on-chain proposals from Tally
 * and upsert them with source='tally'. Composite unique index
 * (dao_id, external_id, source) keeps Tally and Snapshot rows distinct.
 */
export async function syncTallyProposals(opts: {
  offset?: number;
  limit?: number;
} = {}): Promise<TallySyncResult & { done: boolean; offset: number; limit: number }> {
  const limit = opts.limit ?? 10;
  const offset = opts.offset ?? 0;
  const result: TallySyncResult = {
    daos: 0,
    fetched: 0,
    upserted: 0,
    skipped: 0,
    errors: 0,
  };

  if (!process.env.TALLY_API_KEY) {
    result.skipReason = 'TALLY_API_KEY is not configured';
    return { ...result, done: true, offset, limit };
  }

  // First page also lazily backfills tally_org_id from constants
  if (offset === 0) {
    try {
      const bf = await backfillTallyOrgIds();
      result.wiped = bf.wiped;
      if (bf.wiped) {
        console.log(`[tally-sync] wiped ${bf.wiped} mis-attributed proposals`);
      }
    } catch (e) {
      console.warn('[tally-sync] backfill skipped', (e as Error).message);
    }
  }

  const targetDaos = await db
    .select()
    .from(daos)
    .where(isNotNull(daos.tallyOrgId))
    .orderBy(daos.id)
    .limit(limit)
    .offset(offset);

  result.daos = targetDaos.length;
  if (!targetDaos.length) {
    return { ...result, done: true, offset, limit };
  }

  for (const dao of targetDaos) {
    if (!dao.tallyOrgId) continue;
    let nodes: TallyProposalRaw[] | null = null;
    try {
      nodes = await fetchTallyProposals(dao.tallyOrgId, { limit: 50 });
    } catch (e) {
      console.warn('[tally-sync] fetch failed for', dao.slug, (e as Error).message);
      result.errors++;
      continue;
    }
    if (!nodes) {
      // API key vanished mid-run — bail cleanly
      result.skipReason = 'TALLY_API_KEY missing';
      break;
    }
    result.fetched += nodes.length;

    for (const p of nodes) {
      try {
        const body = p.metadata?.description ?? null;
        const title = deriveTallyTitle(p.metadata?.title, body, dao.name, p.onchainId ?? p.id);
        const state = mapTallyState(p.status);
        const startTs = tallyTsToDate(p.start?.timestamp) ?? new Date(0);
        const endTs = tallyTsToDate(p.end?.timestamp) ?? new Date(0);
        const author = p.proposer?.address?.toLowerCase() ?? '';
        const externalId = p.id;

        // Compute summary vote totals — Tally splits "for/against/abstain"
        // with optional "pending-*" mirrors. We only sum the finalised buckets.
        const buckets = p.voteStats ?? [];
        const scoresFor = bucket(buckets, 'for');
        const scoresAgainst = bucket(buckets, 'against');
        const scoresAbstain = bucket(buckets, 'abstain');
        const scores = [scoresFor, scoresAgainst, scoresAbstain];
        const scoresTotal = scoresFor + scoresAgainst + scoresAbstain;
        const votesCount = (buckets.find((b) => b.type === 'for')?.votersCount ?? 0)
          + (buckets.find((b) => b.type === 'against')?.votersCount ?? 0)
          + (buckets.find((b) => b.type === 'abstain')?.votersCount ?? 0);

        await db
          .insert(proposals)
          .values({
            daoId: dao.id,
            externalId,
            source: 'tally',
            title,
            body,
            discussion: null,
            author,
            choices: ['For', 'Against', 'Abstain'],
            state,
            votingType: 'single-choice',
            startTimestamp: startTs,
            endTimestamp: endTs,
            snapshotBlock: p.block?.timestamp ?? null,
            quorum: null,
            scores,
            scoresTotal: String(scoresTotal),
            votesCount,
            quorumReached: false, // Tally Governor quorum semantics differ — leave false
          })
          .onConflictDoUpdate({
            target: [proposals.daoId, proposals.externalId, proposals.source],
            set: {
              // Update title/body too so the stub-title fallback fix
              // propagates to rows ingested before the heuristic landed.
              title,
              body,
              state,
              scores,
              scoresTotal: String(scoresTotal),
              votesCount,
              updatedAt: new Date(),
            },
          });
        result.upserted++;
      } catch (e) {
        console.error('[tally-sync] upsert failed', p.id, e);
        result.errors++;
      }
    }
  }

  return {
    ...result,
    done: targetDaos.length < limit,
    offset,
    limit,
  };
}

function bucket(stats: Array<{ type: string; votesCount: string }>, type: string): number {
  const b = stats.find((s) => s.type === type);
  return b ? Number(b.votesCount) : 0;
}

// Re-export for callers that need it
export { eq, ne };
