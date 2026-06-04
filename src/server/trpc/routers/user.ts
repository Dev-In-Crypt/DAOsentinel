import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { users } from '../../db/schema';
import { generateApiKey } from '../../api/auth-key';

export const userRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const email = ctx.session!.user!.email!;
    const [user] = await ctx.db.select().from(users).where(eq(users.email, email)).limit(1);
    return user ?? null;
  }),

  updateWatchlist: protectedProcedure
    .input(
      z.object({
        watchedDaos: z.array(z.string()).optional(),
        watchedDelegates: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const email = ctx.session!.user!.email!;
      await ctx.db
        .update(users)
        .set({
          ...(input.watchedDaos ? { watchedDaos: input.watchedDaos } : {}),
          ...(input.watchedDelegates ? { watchedDelegates: input.watchedDelegates } : {}),
        })
        .where(eq(users.email, email));
      return { ok: true };
    }),

  rotateApiKey: protectedProcedure.mutation(async ({ ctx }) => {
    const email = ctx.session!.user!.email!;
    const key = generateApiKey();
    await ctx.db.update(users).set({ apiKey: key }).where(eq(users.email, email));
    return { apiKey: key };
  }),

  revokeApiKey: protectedProcedure.mutation(async ({ ctx }) => {
    const email = ctx.session!.user!.email!;
    await ctx.db.update(users).set({ apiKey: null }).where(eq(users.email, email));
    return { ok: true };
  }),

  updateAlertPrefs: protectedProcedure
    .input(
      z.object({
        alertEmail: z.boolean().optional(),
        alertTelegram: z.boolean().optional(),
        telegramChatId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const email = ctx.session!.user!.email!;
      await ctx.db.update(users).set(input).where(eq(users.email, email));
      return { ok: true };
    }),
});
