import { eq, sql, and, desc } from 'drizzle-orm';
import { db } from '../db';
import { delegates, delegateDaoActivity, votes, proposals, daos } from '../db/schema';

/**
 * Materialise delegate profiles from the votes table.
 * For every distinct voter we ensure a delegates row, then rebuild the
 * per-DAO activity rollup.
 */
export async function rebuildDelegateProfiles(limitVoters = 5000): Promise<{
  delegates: number;
  activities: number;
}> {
  // Discover top voters by total votes cast
  const topVoters = await db
    .select({
      address: votes.voterAddress,
      voteCount: sql<number>`count(*)::int`,
    })
    .from(votes)
    .groupBy(votes.voterAddress)
    .orderBy(sql`count(*) desc`)
    .limit(limitVoters);

  let delegateCount = 0;
  let activityCount = 0;

  for (const v of topVoters) {
    // Upsert delegate row
    await db
      .insert(delegates)
      .values({ address: v.address })
      .onConflictDoNothing({ target: delegates.address });

    const [delegate] = await db
      .select()
      .from(delegates)
      .where(eq(delegates.address, v.address))
      .limit(1);
    if (!delegate) continue;

    // Aggregate cross-DAO totals (avg response time in hours from proposal start to vote)
    const totalsRows = await db.execute(sql`
      SELECT
        avg(extract(epoch from v.created_at - p.start_timestamp) / 3600) AS avg_response_hours
      FROM votes v
      JOIN proposals p ON p.id = v.proposal_id
      WHERE v.voter_address = ${v.address}
    `);
    const t = (totalsRows as unknown as Array<{ avg_response_hours: number | null }>)[0];

    // Aggregate per-DAO activity
    const perDao = await db
      .select({
        daoId: votes.daoId,
        votesCast: sql<number>`count(distinct ${votes.proposalId})::int`,
        votingPower: sql<number>`max(${votes.votingPower}::numeric)`,
      })
      .from(votes)
      .where(eq(votes.voterAddress, v.address))
      .groupBy(votes.daoId);

    let activeDaos = 0;
    for (const d of perDao) {
      const [totalProps] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(proposals)
        .where(eq(proposals.daoId, d.daoId));
      const available = totalProps?.c ?? 0;
      const participation = available > 0 ? d.votesCast / available : 0;

      await db
        .insert(delegateDaoActivity)
        .values({
          delegateId: delegate.id,
          daoId: d.daoId,
          votingPower: String(d.votingPower ?? 0),
          votesCast: d.votesCast,
          proposalsAvailable: available,
          participationRate: participation.toFixed(4),
        })
        .onConflictDoUpdate({
          target: [delegateDaoActivity.delegateId, delegateDaoActivity.daoId],
          set: {
            votingPower: String(d.votingPower ?? 0),
            votesCast: d.votesCast,
            proposalsAvailable: available,
            participationRate: participation.toFixed(4),
            updatedAt: new Date(),
          },
        });
      activityCount++;
      activeDaos++;
    }

    // Compute overall participation as weighted average
    const overall = await db
      .select({ avg: sql<number>`avg(participation_rate::numeric)` })
      .from(delegateDaoActivity)
      .where(eq(delegateDaoActivity.delegateId, delegate.id));

    await db
      .update(delegates)
      .set({
        totalDaosActive: activeDaos,
        totalVotesCast: v.voteCount,
        participationRate: overall[0]?.avg ? String(overall[0].avg) : '0',
        avgResponseTimeHours: t?.avg_response_hours
          ? String(Math.max(0, Number(t.avg_response_hours)))
          : null,
        updatedAt: new Date(),
      })
      .where(eq(delegates.id, delegate.id));
    delegateCount++;
  }

  return { delegates: delegateCount, activities: activityCount };
}

/**
 * Resolve ENS for delegates that don't have one yet.
 * Uses a public ENS subgraph-like endpoint to avoid RPC cost.
 */
export async function resolveDelegateEns(limit = 100): Promise<number> {
  const needs = await db
    .select()
    .from(delegates)
    .where(sql`${delegates.ensName} IS NULL`)
    .limit(limit);

  let resolved = 0;
  for (const d of needs) {
    try {
      const r = await fetch(`https://api.ensideas.com/ens/resolve/${d.address}`, {
        headers: { 'user-agent': 'daosentinel/0.1' },
      });
      if (!r.ok) continue;
      const data = (await r.json()) as { name?: string; avatar?: string };
      if (!data?.name) continue;
      await db
        .update(delegates)
        .set({ ensName: data.name, name: data.name, avatarUrl: data.avatar ?? null })
        .where(eq(delegates.id, d.id));
      resolved++;
    } catch {
      // ignore single-address failures
    }
  }
  return resolved;
}

export { and, desc };
