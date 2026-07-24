import { z } from 'zod';
import { desc, eq, sql } from 'drizzle-orm';
import { router, publicProcedure } from '../trpc';
import { delegates, delegateDaoActivity, daos } from '../../db/schema';
import { scoreDelegate } from '../../services/delegate-recommendations';
import { scoreSilentPower } from '../../services/delegate-inactivity';

export const delegatesRouter = router({
  list: publicProcedure
    .input(
      z
        .object({
          limit: z.number().max(100).default(50),
          offset: z.number().default(0),
        })
        .optional()
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(delegates)
        .orderBy(desc(delegates.totalVotesCast))
        .limit(input.limit)
        .offset(input.offset);
    }),

  byAddress: publicProcedure
    .input(z.object({ address: z.string() }))
    .query(async ({ ctx, input }) => {
      const addr = input.address.toLowerCase();
      const [delegate] = await ctx.db
        .select()
        .from(delegates)
        .where(eq(delegates.address, addr))
        .limit(1);
      if (!delegate) return null;

      const activity = await ctx.db
        .select({ activity: delegateDaoActivity, dao: daos })
        .from(delegateDaoActivity)
        .innerJoin(daos, eq(daos.id, delegateDaoActivity.daoId))
        .where(eq(delegateDaoActivity.delegateId, delegate.id));

      return { delegate, activity };
    }),

  topForDao: publicProcedure
    .input(z.object({ daoSlug: z.string(), limit: z.number().max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const [dao] = await ctx.db.select().from(daos).where(eq(daos.slug, input.daoSlug)).limit(1);
      if (!dao) return [];

      return ctx.db
        .select({ activity: delegateDaoActivity, delegate: delegates })
        .from(delegateDaoActivity)
        .innerJoin(delegates, eq(delegates.id, delegateDaoActivity.delegateId))
        .where(eq(delegateDaoActivity.daoId, dao.id))
        .orderBy(desc(delegateDaoActivity.votingPower))
        .limit(input.limit);
    }),

  /**
   * Voters who appear in >= minDaos distinct DAOs. The "cross-DAO bloc"
   * leaderboard — addresses present in multiple governance forums often act
   * as coordinated voting blocs, professional delegate firms, or governance
   * service providers.
   */
  overlapAnalysis: publicProcedure
    .input(
      z
        .object({
          minDaos: z.number().min(2).max(20).default(3),
          limit: z.number().min(1).max(200).default(100),
        })
        .optional()
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.execute(sql`
        WITH voter_summary AS (
          SELECT
            v.voter_address,
            count(DISTINCT v.dao_id)::int AS dao_count,
            count(*)::int AS total_votes,
            array_agg(DISTINCT d.slug) AS dao_slugs
          FROM votes v
          JOIN daos d ON d.id = v.dao_id
          GROUP BY v.voter_address
          HAVING count(DISTINCT v.dao_id) >= ${input.minDaos}
        )
        SELECT
          vs.voter_address AS address,
          vs.dao_count,
          vs.total_votes,
          vs.dao_slugs,
          del.ens_name,
          del.karma_score::numeric AS karma_score
        FROM voter_summary vs
        LEFT JOIN delegates del ON del.address = vs.voter_address
        ORDER BY vs.dao_count DESC, vs.total_votes DESC
        LIMIT ${input.limit}
      `);
      return rows as unknown as Array<{
        address: string;
        dao_count: number;
        total_votes: number;
        dao_slugs: string[];
        ens_name: string | null;
        karma_score: string | null;
      }>;
    }),

  /**
   * Top co-voters: addresses that voted on the same proposal with the same
   * choice as the target address, sorted by overlap count.
   */
  blocFor: publicProcedure
    .input(
      z.object({
        address: z.string(),
        limit: z.number().min(1).max(50).default(15),
      }),
    )
    .query(async ({ ctx, input }) => {
      const addr = input.address.toLowerCase();
      const rows = await ctx.db.execute(sql`
        WITH target_votes AS (
          SELECT proposal_id, choice
          FROM votes
          WHERE voter_address = ${addr}
        ),
        co_voters AS (
          SELECT
            v.voter_address,
            count(*)::int AS co_votes
          FROM votes v
          JOIN target_votes t
            ON t.proposal_id = v.proposal_id AND t.choice = v.choice
          WHERE v.voter_address <> ${addr}
          GROUP BY v.voter_address
        )
        SELECT
          c.voter_address AS address,
          c.co_votes,
          (SELECT count(*) FROM target_votes)::int AS target_total,
          del.ens_name,
          del.karma_score::numeric AS karma_score
        FROM co_voters c
        LEFT JOIN delegates del ON del.address = c.voter_address
        ORDER BY c.co_votes DESC
        LIMIT ${input.limit}
      `);
      return rows as unknown as Array<{
        address: string;
        co_votes: number;
        target_total: number;
        ens_name: string | null;
        karma_score: string | null;
      }>;
    }),

  /**
   * Ranked list of delegates by scoreDelegate() — a transparent weighted
   * formula over signals we already collect (participation, Karma
   * reputation, cross-DAO activity, response time). See
   * docs/specs/delegate-recommendation-engine.md. Global list for now;
   * per-DAO scoping can be added later if there's demand.
   */
  recommended: publicProcedure
    .input(
      z
        .object({ limit: z.number().min(1).max(100).default(20) })
        .optional()
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      // Scoring happens in JS, not SQL — bound the candidate set rather
      // than loading every delegate row.
      const rows = await ctx.db.select().from(delegates).limit(500);

      const scored = rows
        .map((d) => {
          const participationRate = d.participationRate != null ? Number(d.participationRate) : null;
          const karmaScore = d.karmaScore != null ? Number(d.karmaScore) : null;
          const avgResponseTimeHours =
            d.avgResponseTimeHours != null ? Number(d.avgResponseTimeHours) : null;
          const score = scoreDelegate({
            participationRate,
            karmaScore,
            totalDaosActive: d.totalDaosActive,
            avgResponseTimeHours,
          });
          return { delegate: d, score, participationRate, karmaScore, avgResponseTimeHours };
        })
        // Exclude delegates with no usable signal at all — a 0 score from
        // missing data is not the same as a 0 score from poor performance.
        .filter(
          ({ delegate: d, participationRate, karmaScore, avgResponseTimeHours }) =>
            participationRate != null ||
            karmaScore != null ||
            d.totalDaosActive != null ||
            avgResponseTimeHours != null,
        );

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, input.limit);
    }),

  /**
   * "Silent power" — delegates ranked by scoreSilentPower(): voting power
   * they hold (their strongest DAO position) times how long since they last
   * showed up to vote anywhere. A high-VP delegate gone quiet is a bigger
   * governance risk than a whale who votes in the open — their power is
   * real but unaccountable. Voting power is normalized relative to the max
   * in this candidate set (raw VP units aren't comparable across DAOs).
   */
  silentPower: publicProcedure
    .input(
      z
        .object({ limit: z.number().min(1).max(100).default(20) })
        .optional()
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.execute(sql`
        SELECT
          d.id, d.address, d.ens_name, d.avatar_url,
          max(da.voting_power::numeric) AS max_voting_power,
          (SELECT max(v.created_at) FROM votes v WHERE v.voter_address = d.address) AS last_vote_at
        FROM delegates d
        JOIN delegate_dao_activity da ON da.delegate_id = d.id
        GROUP BY d.id
        HAVING max(da.voting_power::numeric) > 0
        ORDER BY max(da.voting_power::numeric) DESC
        LIMIT 500
      `);
      const candidates = rows as unknown as Array<{
        id: string;
        address: string;
        ens_name: string | null;
        avatar_url: string | null;
        max_voting_power: string;
        last_vote_at: string | null;
      }>;
      if (candidates.length === 0) return [];

      const maxVp = Math.max(...candidates.map((c) => Number(c.max_voting_power)));
      const now = Date.now();

      const scored = candidates.map((c) => {
        const votingPower = Number(c.max_voting_power);
        const daysSinceLastVote = c.last_vote_at
          ? (now - new Date(c.last_vote_at).getTime()) / (1000 * 60 * 60 * 24)
          : null;
        const score = scoreSilentPower({
          votingPowerNorm: maxVp > 0 ? votingPower / maxVp : 0,
          daysSinceLastVote,
        });
        return {
          id: c.id,
          address: c.address,
          ensName: c.ens_name,
          avatarUrl: c.avatar_url,
          votingPower,
          daysSinceLastVote,
          score,
        };
      });

      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, input.limit);
    }),
});
