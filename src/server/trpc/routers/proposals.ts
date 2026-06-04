import { z } from 'zod';
import { desc, eq, and, sql } from 'drizzle-orm';
import { router, publicProcedure } from '../trpc';
import { proposals, daos, votes } from '../../db/schema';

export const proposalsRouter = router({
  list: publicProcedure
    .input(
      z
        .object({
          state: z.enum(['active', 'closed', 'pending']).optional(),
          daoSlug: z.string().optional(),
          riskLevel: z.enum(['low', 'medium', 'high']).optional(),
          limit: z.number().min(1).max(100).default(20),
          offset: z.number().min(0).default(0),
        })
        .optional()
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const whereParts = [] as ReturnType<typeof eq>[];
      if (input.state) whereParts.push(eq(proposals.state, input.state));
      if (input.riskLevel) whereParts.push(eq(proposals.aiRiskLevel, input.riskLevel));
      if (input.daoSlug) {
        const [dao] = await ctx.db.select().from(daos).where(eq(daos.slug, input.daoSlug)).limit(1);
        if (!dao) return [];
        whereParts.push(eq(proposals.daoId, dao.id));
      }

      const rows = await ctx.db
        .select({
          proposal: proposals,
          dao: daos,
        })
        .from(proposals)
        .innerJoin(daos, eq(daos.id, proposals.daoId))
        .where(whereParts.length ? and(...whereParts) : undefined)
        .orderBy(desc(proposals.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return rows;
    }),

  byId: publicProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .select({ proposal: proposals, dao: daos })
      .from(proposals)
      .innerJoin(daos, eq(daos.id, proposals.daoId))
      .where(eq(proposals.id, input.id))
      .limit(1);

    if (!row) return null;

    const proposalVotes = await ctx.db
      .select()
      .from(votes)
      .where(eq(votes.proposalId, row.proposal.id))
      .orderBy(desc(votes.votingPower))
      .limit(200);

    const whaleVotes = proposalVotes.filter((v) => v.isWhale);

    return { ...row, votes: proposalVotes, whaleVotes };
  }),

  trending: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(10) }).optional().default({}))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select({ proposal: proposals, dao: daos })
        .from(proposals)
        .innerJoin(daos, eq(daos.id, proposals.daoId))
        .where(eq(proposals.state, 'active'))
        .orderBy(desc(proposals.votesCount))
        .limit(input.limit);
    }),

  recentlyClosed: publicProcedure
    .input(z.object({ days: z.number().min(1).max(30).default(7) }).optional().default({}))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.days * 86400_000);
      return ctx.db
        .select({ proposal: proposals, dao: daos })
        .from(proposals)
        .innerJoin(daos, eq(daos.id, proposals.daoId))
        .where(
          and(eq(proposals.state, 'closed'), sql`${proposals.endTimestamp} >= ${since.toISOString()}`),
        )
        .orderBy(desc(proposals.endTimestamp))
        .limit(50);
    }),
});
