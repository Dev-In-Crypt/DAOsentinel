import { eq, and, lt, gt, isNull, desc, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { alerts, proposals, votes, daos } from '../db/schema';
import {
  WHALE_VP_PCT_THRESHOLD,
  WHALE_CRITICAL_PCT,
  WHALE_WARNING_PCT,
  QUORUM_RISK_THRESHOLD,
} from '@/lib/constants';
import { shortenAddress, formatNumber } from '@/lib/utils';
import { publishAlert } from './notifier';

/**
 * Scan recent votes and emit alerts for any whale vote that has not yet
 * produced an alert. Idempotent: dedup by (proposal_id, voter_address, type).
 */
export async function processNewWhaleVotes(): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);

  const recentWhales = await db
    .select({
      vote: votes,
      proposal: proposals,
      dao: daos,
    })
    .from(votes)
    .innerJoin(proposals, eq(proposals.id, votes.proposalId))
    .innerJoin(daos, eq(daos.id, votes.daoId))
    .where(and(eq(votes.isWhale, true), gt(votes.createdAt, since)))
    .orderBy(desc(votes.createdAt))
    .limit(500);

  // Batch dedup: ONE query for all candidate proposals instead of one
  // JSONB-scan per whale vote (was up to 500 queries per tick).
  const proposalIds = [...new Set(recentWhales.map((r) => r.proposal.id))];
  const existingAlerts = proposalIds.length
    ? await db
        .select({
          proposalId: alerts.proposalId,
          voter: sql<string>`${alerts.data} ->> 'voter'`,
        })
        .from(alerts)
        .where(and(eq(alerts.type, 'whale_vote'), inArray(alerts.proposalId, proposalIds)))
    : [];
  const seen = new Set(existingAlerts.map((e) => `${e.proposalId}:${e.voter}`));

  let created = 0;
  for (const row of recentWhales) {
    const { vote, proposal, dao } = row;
    const dedupKey = `${proposal.id}:${vote.voterAddress.toLowerCase()}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey); // also guards against duplicates within this batch

    const vpPct = Number(vote.votingPowerPct ?? 0);
    const severity =
      vpPct > WHALE_CRITICAL_PCT ? 'critical' : vpPct > WHALE_WARNING_PCT ? 'warning' : 'info';

    const choiceLabel =
      (proposal.choices && proposal.choices[vote.choice - 1]) ?? `choice ${vote.choice}`;

    const [newAlert] = await db
      .insert(alerts)
      .values({
        daoId: dao.id,
        proposalId: proposal.id,
        type: 'whale_vote',
        severity,
        title: `🐳 Whale vote on ${dao.name}: ${vpPct.toFixed(1)}% VP`,
        description: `Address ${shortenAddress(vote.voterAddress)} cast ${formatNumber(Number(vote.votingPower))} VP (${vpPct.toFixed(1)}% of total) for "${choiceLabel}" on "${proposal.title}".`,
        data: {
          voter: vote.voterAddress.toLowerCase(),
          vp: Number(vote.votingPower),
          vpPct,
          choice: vote.choice,
          choiceLabel,
          proposalTitle: proposal.title,
          proposalId: proposal.externalId,
        },
      })
      .returning();

    created++;

    if (newAlert) {
      await publishAlert(newAlert.id).catch((e) => console.error(e));
    }

    // Mark proposal flag
    if (!proposal.hasWhaleVote) {
      await db
        .update(proposals)
        .set({ hasWhaleVote: true })
        .where(eq(proposals.id, proposal.id));
    }

    // Last-minute whale -> swing candidate, additionally check
    if (vote.isLastMinute) {
      await checkSwing(proposal.id);
    }
  }

  // Independent quorum-risk scan
  created += await scanQuorumRisks();

  return created;
}

async function checkSwing(proposalId: string) {
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!proposal) return;

  const oneHourAgo = new Date(Date.now() - 3600 * 1000);
  const prior = await db
    .select()
    .from(votes)
    .where(and(eq(votes.proposalId, proposalId), lt(votes.createdAt, oneHourAgo)));

  if (prior.length < 5) return;

  const priorLeader = computeLeadingChoice(prior, (proposal.choices ?? []).length);
  const allVotes = await db.select().from(votes).where(eq(votes.proposalId, proposalId));
  const currentLeader = computeLeadingChoice(allVotes, (proposal.choices ?? []).length);

  if (priorLeader !== currentLeader && proposal.hasLastMinuteSwing !== true) {
    const [a] = await db
      .insert(alerts)
      .values({
        daoId: proposal.daoId,
        proposalId: proposal.id,
        type: 'last_minute_swing',
        severity: 'critical',
        title: `⚡ Vote swing detected on ${proposal.title}`,
        description: `Result flipped from "${proposal.choices?.[priorLeader] ?? priorLeader}" to "${proposal.choices?.[currentLeader] ?? currentLeader}" in the final hours.`,
        data: { previousLeader: priorLeader, currentLeader, scores: proposal.scores },
      })
      .returning();

    await db
      .update(proposals)
      .set({ hasLastMinuteSwing: true, isControversial: true })
      .where(eq(proposals.id, proposal.id));

    if (a) await publishAlert(a.id).catch((e) => console.error(e));
  }
}

// Exported for unit testing. Pure: sums voting power per (1-indexed) choice
// and returns the 0-indexed leading choice. Used to detect last-minute swings.
export function computeLeadingChoice(voteRows: { choice: number; votingPower: string }[], choicesLen: number): number {
  const totals = new Array(Math.max(choicesLen, 1)).fill(0) as number[];
  for (const v of voteRows) {
    const idx = v.choice - 1;
    if (idx >= 0 && idx < totals.length) totals[idx] += Number(v.votingPower);
  }
  let max = -1;
  let bestIdx = 0;
  totals.forEach((t, i) => {
    if (t > max) {
      max = t;
      bestIdx = i;
    }
  });
  return bestIdx;
}

async function scanQuorumRisks(): Promise<number> {
  const now = Date.now();
  const active = await db.select().from(proposals).where(eq(proposals.state, 'active'));
  let created = 0;
  for (const p of active) {
    if (!p.quorum || Number(p.quorum) <= 0) continue;
    const total = Number(p.scoresTotal ?? 0);
    const quorum = Number(p.quorum);
    if (total / quorum >= QUORUM_RISK_THRESHOLD) continue; // safe
    const start = p.startTimestamp.getTime();
    const end = p.endTimestamp.getTime();
    const dur = end - start;
    if (dur <= 0) continue;
    const progress = (now - start) / dur;
    if (progress < 0.75) continue; // only alert in final 25%

    // Dedup
    const [dup] = await db
      .select()
      .from(alerts)
      .where(and(eq(alerts.proposalId, p.id), eq(alerts.type, 'quorum_risk')))
      .limit(1);
    if (dup) continue;

    const [a] = await db
      .insert(alerts)
      .values({
        daoId: p.daoId,
        proposalId: p.id,
        type: 'quorum_risk',
        severity: 'warning',
        title: `⚠ Quorum risk: ${p.title}`,
        description: `Proposal is at ${((total / quorum) * 100).toFixed(0)}% of quorum with ${Math.round((1 - progress) * 100)}% of the voting window left.`,
        data: { total, quorum, progress },
      })
      .returning();
    created++;
    if (a) await publishAlert(a.id).catch(() => undefined);
  }
  return created;
}

// Re-export for backwards-compat
export { sql };
export { isNull };
