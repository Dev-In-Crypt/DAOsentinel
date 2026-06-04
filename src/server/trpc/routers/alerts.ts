import { z } from 'zod';
import { desc, eq, and } from 'drizzle-orm';
import { router, publicProcedure } from '../trpc';
import { alerts, daos } from '../../db/schema';

export const alertsRouter = router({
  feed: publicProcedure
    .input(
      z
        .object({
          type: z
            .enum(['whale_vote', 'last_minute_swing', 'quorum_risk', 'score_drop', 'coordinated_voting'])
            .optional(),
          severity: z.enum(['info', 'warning', 'critical']).optional(),
          daoSlug: z.string().optional(),
          limit: z.number().max(100).default(30),
        })
        .optional()
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const where = [] as ReturnType<typeof eq>[];
      if (input.type) where.push(eq(alerts.type, input.type));
      if (input.severity) where.push(eq(alerts.severity, input.severity));
      if (input.daoSlug) {
        const [dao] = await ctx.db.select().from(daos).where(eq(daos.slug, input.daoSlug)).limit(1);
        if (!dao) return [];
        where.push(eq(alerts.daoId, dao.id));
      }

      return ctx.db
        .select({ alert: alerts, dao: daos })
        .from(alerts)
        .innerJoin(daos, eq(daos.id, alerts.daoId))
        .where(where.length ? and(...where) : undefined)
        .orderBy(desc(alerts.createdAt))
        .limit(input.limit);
    }),
});
