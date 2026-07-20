import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, publicProcedure } from '../trpc';
import { daos } from '../../db/schema';
import { loadClosedProposalsForSimulation, simulateProposal } from '../../services/simulator';

export const simulatorRouter = router({
  /**
   * Historical replay for one DAO: runs simulateProposal() over every
   * closed proposal in the trailing `sinceDays` window. Read-only, public
   * — matches the rest of the free public-good API surface (no auth).
   * See docs/specs/voting-power-simulator.md.
   */
  run: publicProcedure
    .input(
      z.object({
        daoSlug: z.string(),
        hypotheticalVp: z.number().positive(),
        sinceDays: z.number().min(1).max(730).default(365),
        excludeVoter: z.string().trim().min(1).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [dao] = await ctx.db.select().from(daos).where(eq(daos.slug, input.daoSlug)).limit(1);
      if (!dao) return null;

      const loadedProposals = await loadClosedProposalsForSimulation(dao.id, input.sinceDays);
      const results = loadedProposals.map((p) =>
        simulateProposal(p, input.hypotheticalVp, input.excludeVoter),
      );

      return {
        daoName: dao.name,
        totalProposals: results.length,
        swungCount: results.filter((r) => r.wouldHaveSwungOutcome).length,
        results,
      };
    }),
});
