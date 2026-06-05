import { eq, isNotNull } from 'drizzle-orm';
import { db } from '../db';
import { daos, proposals } from '../db/schema';
import {
  fetchTallyProposals,
  mapTallyState,
  tallyTsToDate,
  type TallyProposalRaw,
} from '@/lib/tally-client';
import { TRACKED_DAOS } from '@/lib/constants';

/**
 * Mirror TRACKED_DAOS.tallyOrgId into the daos row on first run, so we don't
 * need a separate manual reseed when this feature ships to an existing DB.
 */
async function backfillTallyOrgIds(): Promise<number> {
  let touched = 0;
  for (const t of TRACKED_DAOS) {
    if (!t.tallyOrgId) continue;
    const res = await db
      .update(daos)
      .set({ tallyOrgId: t.tallyOrgId })
      .where(eq(daos.slug, t.slug))
      .returning({ id: daos.id });
    if (res.length) touched++;
  }
  return touched;
}

interface TallySyncResult {
  daos: number;
  fetched: number;
  upserted: number;
  skipped: number;
  errors: number;
  skipReason?: string;
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
      await backfillTallyOrgIds();
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
        const rawTitle = p.metadata?.title?.trim() ?? '';
        const body = p.metadata?.description ?? null;
        // On-chain Governors (esp. Compound) sometimes store stub titles like
        // "0x0" or "Proposal" — fall back to the first meaningful line of the
        // description, then to a derived "{DAO} proposal #onchainId" label.
        const isStubTitle =
          !rawTitle ||
          rawTitle.length < 6 ||
          /^(0x[0-9a-f]*|proposal|untitled)$/i.test(rawTitle);
        const firstDescLine = (body ?? '')
          .replace(/^[#\s>*_-]+/gm, '')
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => l.length >= 8 && l.length <= 200);
        const title = (
          isStubTitle
            ? firstDescLine ?? `${dao.name} proposal #${p.onchainId ?? p.id}`
            : rawTitle
        ).slice(0, 500);
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
export { eq };
