import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { songRouter } from "~/server/api/routers/song";
import { leaderboardRouter } from "~/server/api/routers/leaderboard";
import { playerRouter } from "~/server/api/routers/player";
import { userRouter } from "~/server/api/routers/user";
import { heroNameRouter } from "~/server/api/routers/hero-name";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  song: songRouter,
  leaderboard: leaderboardRouter,
  player: playerRouter,
  user: userRouter,
  heroName: heroNameRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
