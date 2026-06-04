import { z } from 'zod';
import { desc, asc, ilike, or, sql, eq } from 'drizzle-orm';
import { router, publicProcedure } from '../trpc';
import { daos, proposals } from '../../db/schema';

export const daosRouter = router({
  list: publicProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          sort: z.enum(['score', 'name', 'proposals']).default('score'),
          order: z.enum(['asc', 'desc']).default('desc'),
          chain: z.string().optional(),
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        })
        .optional()
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const { search, sort, order, chain, limit, offset } = input;

      const conditions = [] as ReturnType<typeof ilike>[];
      if (search) {
        conditions.push(ilike(daos.name, `%${search}%`));
      }

      const orderBy =
        sort === 'name'
          ? order === 'asc'
            ? asc(daos.name)
            : desc(daos.name)
          : sort === 'proposals'
            ? order === 'asc'
              ? asc(daos.totalProposals)
              : desc(daos.totalProposals)
            : order === 'asc'
              ? asc(daos.democracyScore)
              : desc(daos.democracyScore);

      const rows = await ctx.db
        .select()
        .from(daos)
        .where(
          chain
            ? sql`${daos.chain} = ${chain}${search ? sql` AND ${daos.name} ILIKE ${'%' + search + '%'}` : sql``}`
            : search
              ? ilike(daos.name, `%${search}%`)
              : undefined,
        )
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);

      return rows;
    }),

  bySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const [dao] = await ctx.db.select().from(daos).where(eq(daos.slug, input.slug)).limit(1);
      if (!dao) return null;

      const activeProposals = await ctx.db
        .select()
        .from(proposals)
        .where(sql`${proposals.daoId} = ${dao.id} AND ${proposals.state} = 'active'`)
        .orderBy(desc(proposals.endTimestamp))
        .limit(10);

      const recentProposals = await ctx.db
        .select()
        .from(proposals)
        .where(eq(proposals.daoId, dao.id))
        .orderBy(desc(proposals.createdAt))
        .limit(20);

      return { dao, activeProposals, recentProposals };
    }),

  topByScore: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }).optional().default({}))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(daos).orderBy(desc(daos.democracyScore)).limit(input.limit);
    }),

  bottomByScore: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }).optional().default({}))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(daos).orderBy(asc(daos.democracyScore)).limit(input.limit);
    }),
});
