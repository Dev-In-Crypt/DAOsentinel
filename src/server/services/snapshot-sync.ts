import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db';
import { daos, proposals, votes } from '../db/schema';
import {
  PROPOSALS_QUERY,
  VOTES_QUERY,
  snapshotRequest,
  type SnapshotProposal,
  type SnapshotVote,
} from '@/lib/snapshot-client';
import {
  WHALE_VP_PCT_THRESHOLD,
  LAST_MINUTE_WINDOW_PCT,
} from '@/lib/constants';

interface SyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  errors: number;
}

/**
 * Fetches active + recently-closed proposals for all tracked DAOs and upserts
 * them into the proposals table. Idempotent.
 */
export async function syncProposals(): Promise<SyncResult> {
  const result: SyncResult = { fetched: 0, inserted: 0, updated: 0, errors: 0 };

  const allDaos = await db.select().from(daos);
  if (!allDaos.length) return result;

  const daoBySpace = new Map(allDaos.map((d) => [d.snapshotSpaceId ?? '', d]));
  const spaceIds = allDaos.map((d) => d.snapshotSpaceId).filter((s): s is string => Boolean(s));

  // Snapshot caps queries at ~50 spaces, batch.
  const batches = chunk(spaceIds, 40);

  for (const batchSpaces of batches) {
    for (const state of ['active', 'closed'] as const) {
      const first = state === 'active' ? 100 : 50;
      try {
        const data = await snapshotRequest<{ proposals: SnapshotProposal[] }>(PROPOSALS_QUERY, {
          spaces: batchSpaces,
          state,
          first,
          skip: 0,
        });

        for (const p of data.proposals) {
          result.fetched++;
          const dao = daoBySpace.get(p.space.id);
          if (!dao) continue;

          // Filter recently-closed to last 24h to keep payload small
          if (state === 'closed') {
            const ageSec = Math.floor(Date.now() / 1000) - p.end;
            if (ageSec > 86_400) continue;
          }

          try {
            await db
              .insert(proposals)
              .values({
                daoId: dao.id,
                externalId: p.id,
                source: 'snapshot',
                title: p.title,
                body: p.body,
                discussion: p.discussion,
                author: p.author,
                choices: p.choices,
                state: p.state,
                votingType: p.type,
                startTimestamp: new Date(p.start * 1000),
                endTimestamp: new Date(p.end * 1000),
                snapshotBlock: p.snapshot,
                quorum: p.quorum != null ? String(p.quorum) : null,
                scores: p.scores ?? [],
                scoresTotal: p.scores_total != null ? String(p.scores_total) : null,
                votesCount: p.votes,
                quorumReached: p.quorum > 0 ? (p.scores_total ?? 0) >= p.quorum : false,
              })
              .onConflictDoUpdate({
                target: [proposals.daoId, proposals.externalId, proposals.source],
                set: {
                  state: p.state,
                  discussion: p.discussion, // backfill on existing rows
                  scores: p.scores ?? [],
                  scoresTotal: p.scores_total != null ? String(p.scores_total) : null,
                  votesCount: p.votes,
                  quorumReached: p.quorum > 0 ? (p.scores_total ?? 0) >= p.quorum : false,
                  updatedAt: new Date(),
                },
              });
            result.updated++;
          } catch (err) {
            console.error('Proposal upsert failed', p.id, err);
            result.errors++;
          }
        }
      } catch (err) {
        console.error(`Snapshot proposals fetch failed (state=${state})`, err);
        result.errors++;
      }
    }
  }

  return result;
}

/**
 * Sync votes for a single proposal. Paginated.
 * Returns the number of votes newly inserted.
 */
export async function syncVotesForProposal(proposalExternalId: string): Promise<number> {
  const [proposal] = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.externalId, proposalExternalId), eq(proposals.source, 'snapshot')))
    .limit(1);
  if (!proposal) return 0;

  const totalSec =
    (proposal.endTimestamp.getTime() - proposal.startTimestamp.getTime()) / 1000;
  const scoresTotal = Number(proposal.scoresTotal ?? 0);
  let inserted = 0;
  let skip = 0;
  const pageSize = 1000;

  while (true) {
    let page: SnapshotVote[] = [];
    try {
      const data = await snapshotRequest<{ votes: SnapshotVote[] }>(VOTES_QUERY, {
        proposal: proposalExternalId,
        first: pageSize,
        skip,
      });
      page = data.votes;
    } catch (err) {
      console.error('votes fetch failed', proposalExternalId, err);
      break;
    }
    if (!page.length) break;

    for (const v of page) {
      const vpPct = scoresTotal > 0 ? (v.vp / scoresTotal) * 100 : 0;
      const timeFromEndSec = proposal.endTimestamp.getTime() / 1000 - v.created;
      const isLastMinute = totalSec > 0 ? timeFromEndSec / totalSec < LAST_MINUTE_WINDOW_PCT : false;
      const isWhale = vpPct > WHALE_VP_PCT_THRESHOLD;
      const choiceIdx = normaliseChoice(v.choice);

      try {
        const ins = await db
          .insert(votes)
          .values({
            proposalId: proposal.id,
            daoId: proposal.daoId,
            voterAddress: v.voter.toLowerCase(),
            choice: choiceIdx,
            votingPower: String(v.vp),
            votingPowerPct: vpPct.toFixed(4),
            reason: v.reason ?? null,
            isWhale,
            isLastMinute,
            createdAt: new Date(v.created * 1000),
          })
          .onConflictDoNothing()
          .returning({ id: votes.id });
        // Empty array → row already existed; one row → fresh insert.
        if (ins.length > 0) inserted++;
      } catch (err) {
        console.error('vote insert failed', err);
      }
    }

    if (page.length < pageSize) break;
    skip += pageSize;
  }

  // Bubble flags up to the proposal
  if (inserted > 0) {
    const hasWhale = await db.query.votes.findFirst({
      where: and(eq(votes.proposalId, proposal.id), eq(votes.isWhale, true)),
    });
    await db
      .update(proposals)
      .set({ hasWhaleVote: !!hasWhale, updatedAt: new Date() })
      .where(eq(proposals.id, proposal.id));
  }

  return inserted;
}

/**
 * Sync votes for active proposals. Paginated: process at most `limit`
 * proposals starting at `offset` (ordered deterministically by id).
 * Each call must fit Vercel's 300s function timeout; the cron workflow
 * walks pages until `done: true`.
 */
export async function syncAllActiveVotes(
  opts: { offset?: number; limit?: number } = {},
): Promise<{ proposals: number; votes: number; done: boolean; offset: number; limit: number }> {
  const limit = opts.limit ?? 5;
  const offset = opts.offset ?? 0;
  const active = await db
    .select()
    .from(proposals)
    .where(eq(proposals.state, 'active'))
    .orderBy(proposals.id)
    .limit(limit)
    .offset(offset);

  let totalVotes = 0;
  for (const p of active) {
    totalVotes += await syncVotesForProposal(p.externalId);
  }
  return {
    proposals: active.length,
    votes: totalVotes,
    done: active.length < limit,
    offset,
    limit,
  };
}

export async function syncRecentlyClosedVotes(): Promise<{ proposals: number; votes: number }> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const closed = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.state, 'closed')));
  let totalVotes = 0;
  let processed = 0;
  for (const p of closed) {
    if (p.endTimestamp >= since) {
      totalVotes += await syncVotesForProposal(p.externalId);
      processed++;
    }
  }
  return { proposals: processed, votes: totalVotes };
}

function normaliseChoice(choice: SnapshotVote['choice']): number {
  if (typeof choice === 'number') return choice;
  if (Array.isArray(choice)) return choice[0] ?? 0;
  if (choice && typeof choice === 'object') {
    // approval / weighted return objects: take dominant key
    const entries = Object.entries(choice as Record<string, number>);
    entries.sort((a, b) => b[1] - a[1]);
    return Number(entries[0]?.[0] ?? 0);
  }
  return 0;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export { inArray };
