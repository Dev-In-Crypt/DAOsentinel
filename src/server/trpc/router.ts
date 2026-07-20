import { router } from './trpc';
import { daosRouter } from './routers/daos';
import { proposalsRouter } from './routers/proposals';
import { votesRouter } from './routers/votes';
import { delegatesRouter } from './routers/delegates';
import { alertsRouter } from './routers/alerts';
import { scoresRouter } from './routers/scores';
import { newsletterRouter } from './routers/newsletter';
import { userRouter } from './routers/user';
import { simulatorRouter } from './routers/simulator';

export const appRouter = router({
  daos: daosRouter,
  proposals: proposalsRouter,
  votes: votesRouter,
  delegates: delegatesRouter,
  alerts: alertsRouter,
  scores: scoresRouter,
  newsletter: newsletterRouter,
  user: userRouter,
  simulator: simulatorRouter,
});

export type AppRouter = typeof appRouter;
