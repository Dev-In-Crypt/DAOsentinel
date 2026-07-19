/**
 * Voting-power simulator — see docs/specs/voting-power-simulator.md.
 *
 * Historical replay: "if I delegate N tokens to address X, how often over
 * the last 12 months would that have swung the outcome of a vote in this
 * DAO?" This module is split into a data-loading half
 * (`loadClosedProposalsForSimulation`, TODO-009) and a pure calculation
 * half (`simulateProposal`, TODO-010).
 */

import { and, eq, gt, inArray } from 'drizzle-orm';
import { db } from '../db';
import { proposals, votes } from '../db/schema';
import { computeLeadingChoice } from './whale-detector';

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

export interface SwingResult {
  proposalId: string;
  title: string;
  wouldHaveSwungOutcome: boolean;
  wouldHaveMetQuorum: boolean; // only meaningful if the proposal originally missed quorum
  originalLeader: number; // choice index (0-indexed)
  newLeader: number;
}

/**
 * Historical replay for one proposal: what if `hypotheticalVp` had also
 * voted? Pure — no I/O, operates on an already-loaded
 * `SimulatorProposal` (the shape `loadClosedProposalsForSimulation`
 * returns; called `LoadedProposal` in the spec).
 *
 * Reuses whale-detector.ts's `computeLeadingChoice` for the tally-by-choice
 * math rather than reimplementing it, per the spec.
 *
 * Assumptions (documented, not "fixed" — see spec):
 * - The hypothetical VP is added to whichever choice is currently the
 *   runner-up (second-highest tally) — the best case for flipping the
 *   outcome. A real voter could vote any way; this reports the best case,
 *   not a prediction. The UI must state this plainly.
 * - No delegation cascades modeled — only direct VP, matching how
 *   `votes.votingPower` is already recorded (final, resolved VP).
 */
export function simulateProposal(
  proposal: SimulatorProposal,
  hypotheticalVp: number,
  excludeVoter?: string,
): SwingResult {
  const excluded = excludeVoter?.toLowerCase();
  const baseVotes = excluded
    ? proposal.votes.filter((v) => v.voterAddress.toLowerCase() !== excluded)
    : proposal.votes;

  const choicesLen = proposal.choices.length;
  const originalLeader = computeLeadingChoice(
    baseVotes.map((v) => ({ choice: v.choice, votingPower: String(v.votingPower) })),
    choicesLen,
  );

  const totals = tallyByChoice(baseVotes, choicesLen);
  const runnerUp = pickRunnerUp(totals, originalLeader);

  const boostedVotes = [
    ...baseVotes,
    { voterAddress: '__hypothetical__', choice: runnerUp + 1, votingPower: hypotheticalVp },
  ];
  const newLeader = computeLeadingChoice(
    boostedVotes.map((v) => ({ choice: v.choice, votingPower: String(v.votingPower) })),
    choicesLen,
  );

  const totalVpBefore = baseVotes.reduce((s, v) => s + v.votingPower, 0);
  const totalVpAfter = totalVpBefore + hypotheticalVp;
  const wouldHaveMetQuorum =
    proposal.quorum != null && totalVpBefore < proposal.quorum && totalVpAfter >= proposal.quorum;

  return {
    proposalId: proposal.proposalId,
    title: proposal.title,
    wouldHaveSwungOutcome: newLeader !== originalLeader,
    wouldHaveMetQuorum,
    originalLeader,
    newLeader,
  };
}

function tallyByChoice(voteRows: SimulatorProposal['votes'], choicesLen: number): number[] {
  const totals = new Array(Math.max(choicesLen, 1)).fill(0) as number[];
  for (const v of voteRows) {
    const idx = v.choice - 1;
    if (idx >= 0 && idx < totals.length) totals[idx] += v.votingPower;
  }
  return totals;
}

/**
 * The choice we boost with hypothetical VP: the current runner-up
 * (second-highest tally), which is the best-case flip target. Falls back
 * to the next choice index if every non-leading choice has zero votes
 * (e.g. a proposal with only one real voter so far) or if there's only
 * one choice at all (nothing to swing to — returns the leader itself).
 */
function pickRunnerUp(totals: number[], leaderIdx: number): number {
  if (totals.length <= 1) return leaderIdx;
  let max = -1;
  let idx = -1;
  totals.forEach((t, i) => {
    if (i === leaderIdx) return;
    if (t > max) {
      max = t;
      idx = i;
    }
  });
  return idx === -1 ? (leaderIdx + 1) % totals.length : idx;
}
