/**
 * Voting-power simulator — see docs/specs/voting-power-simulator.md.
 *
 * Historical replay: "if I delegate N tokens to address X, how often over
 * the last 12 months would that have swung the outcome of a vote in this
 * DAO?" This module is split into a data-loading half (this file's
 * exported function, TODO-009) and a pure calculation half (TODO-010,
 * not yet implemented).
 */

import { and, eq, gt, inArray } from 'drizzle-orm';
import { db } from '../db';
import { proposals, votes } from '../db/schema';

export interface SimulatorProposal {
  proposalId: string;
  title: string;
  choices: string[];
  quorum: number | null;
  votes: Array<{ voterAddress: string; choice: number; votingPower: number }>;
}

/**
 * Loads closed proposals for one DAO within the trailing `sinceDays`
 * window, each with its full vote list. Read-only, no migration — reuses
 * the existing idx_proposals_dao (daoId, createdAt) and idx_votes_proposal
 * indexes; no new index needed at expected proposal-per-DAO volumes
 * (tens to low hundreds per the spec).
 */
export async function loadClosedProposalsForSimulation(
  daoId: string,
  sinceDays: number,
): Promise<SimulatorProposal[]> {
  const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000);

  const closedProposals = await db
    .select({
      id: proposals.id,
      title: proposals.title,
      choices: proposals.choices,
      quorum: proposals.quorum,
    })
    .from(proposals)
    .where(and(eq(proposals.daoId, daoId), eq(proposals.state, 'closed'), gt(proposals.createdAt, since)));

  if (!closedProposals.length) return [];

  const proposalIds = closedProposals.map((p) => p.id);
  const voteRows = await db
    .select({
      proposalId: votes.proposalId,
      voterAddress: votes.voterAddress,
      choice: votes.choice,
      votingPower: votes.votingPower,
    })
    .from(votes)
    .where(inArray(votes.proposalId, proposalIds));

  const votesByProposal = new Map<string, SimulatorProposal['votes']>();
  for (const v of voteRows) {
    const bucket = votesByProposal.get(v.proposalId) ?? [];
    bucket.push({ voterAddress: v.voterAddress, choice: v.choice, votingPower: Number(v.votingPower) });
    votesByProposal.set(v.proposalId, bucket);
  }

  return closedProposals.map((p) => ({
    proposalId: p.id,
    title: p.title,
    choices: p.choices,
    quorum: p.quorum != null ? Number(p.quorum) : null,
    votes: votesByProposal.get(p.id) ?? [],
  }));
}
