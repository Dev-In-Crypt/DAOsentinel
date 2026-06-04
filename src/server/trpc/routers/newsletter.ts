import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, publicProcedure } from '../trpc';
import { newsletterSubscribers } from '../../db/schema';

export const newsletterRouter = router({
  subscribe: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(newsletterSubscribers)
        .values({ email: input.email.toLowerCase() })
        .onConflictDoUpdate({
          target: newsletterSubscribers.email,
          set: { isActive: true, unsubscribedAt: null },
        });
      return { ok: true };
    }),

  unsubscribe: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(newsletterSubscribers)
        .set({ isActive: false, unsubscribedAt: new Date() })
        .where(eq(newsletterSubscribers.email, input.email.toLowerCase()));
      return { ok: true };
    }),
});
