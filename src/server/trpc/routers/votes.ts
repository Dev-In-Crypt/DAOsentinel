import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { router, publicProcedure } from '../trpc';
import { votes } from '../../db/schema';

export const votesRouter = router({
  forProposal: publicProcedure
    .input(z.object({ proposalId: z.string().uuid(), limit: z.number().max(500).default(100) }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(votes)
        .where(eq(votes.proposalId, input.proposalId))
        .orderBy(desc(votes.votingPower))
        .limit(input.limit);
    }),

  byVoter: publicProcedure
    .input(z.object({ address: z.string(), limit: z.number().max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(votes)
        .where(eq(votes.voterAddress, input.address.toLowerCase()))
        .orderBy(desc(votes.createdAt))
        .limit(input.limit);
    }),
});
