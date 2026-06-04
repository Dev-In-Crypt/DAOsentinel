import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { router, publicProcedure } from '../trpc';
import { delegates, delegateDaoActivity, daos } from '../../db/schema';

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
});
