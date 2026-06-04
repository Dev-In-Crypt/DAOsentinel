import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { router, publicProcedure } from '../trpc';
import { scoreHistory, daos } from '../../db/schema';

export const scoresRouter = router({
  history: publicProcedure
    .input(z.object({ daoSlug: z.string(), limit: z.number().max(365).default(90) }))
    .query(async ({ ctx, input }) => {
      const [dao] = await ctx.db.select().from(daos).where(eq(daos.slug, input.daoSlug)).limit(1);
      if (!dao) return [];
      return ctx.db
        .select()
        .from(scoreHistory)
        .where(eq(scoreHistory.daoId, dao.id))
        .orderBy(desc(scoreHistory.computedAt))
        .limit(input.limit);
    }),
});
