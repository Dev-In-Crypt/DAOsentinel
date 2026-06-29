import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { users } from '../../db/schema';
import { generateApiKey } from '../../api/auth-key';
import { isValidDiscordWebhook, sendDiscordAlert } from '@/lib/discord';

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

  setDiscordWebhook: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const url = input.url.trim();
      if (!isValidDiscordWebhook(url)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That does not look like a Discord webhook URL.',
        });
      }
      // Confirm the webhook actually works before saving it.
      const ok = await sendDiscordAlert(url, {
        title: '✅ Connected to DAO Sentinel',
        description:
          'Governance alerts for the DAOs on your watchlist will arrive here.',
        severity: 'info',
      });
      if (!ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Could not post to that webhook — check the URL and try again.',
        });
      }
      const email = ctx.session!.user!.email!;
      await ctx.db.update(users).set({ discordWebhookUrl: url }).where(eq(users.email, email));
      return { ok: true };
    }),

  clearDiscordWebhook: protectedProcedure.mutation(async ({ ctx }) => {
    const email = ctx.session!.user!.email!;
    await ctx.db.update(users).set({ discordWebhookUrl: null }).where(eq(users.email, email));
    return { ok: true };
  }),

  disconnectTelegram: protectedProcedure.mutation(async ({ ctx }) => {
    const email = ctx.session!.user!.email!;
    await ctx.db
      .update(users)
      .set({ telegramChatId: null, alertTelegram: false })
      .where(eq(users.email, email));
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
