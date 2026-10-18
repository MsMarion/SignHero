import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { createTRPCRouter, publicProcedure, rateLimit } from "../trpc";
import { z } from "zod";
import { resolveScoreIdentity } from "~/server/score-identity";
import { getClientKey } from "~/server/rate-limit";
import { isObjectId } from "~/server/ids";
import { ownsPlayer, validateFinalStats } from "~/server/score-validation";

const createPlayerSchema = z.object({
  name: z.string().min(1).max(20),
});

const updateFinalStatsSchema = z.object({
  playerId: z.string().regex(/^[0-9a-f]{24}$/, "Invalid player id"),
  score: z.number().int().min(0),
  avgReactionTime: z.number().min(0),
  mistakesMade: z.number().int().min(0),
  correctHits: z.number().int().min(0),
  practice: z.boolean().optional(),
});

/** Never send the owner id or address fields to browsers. */
function publicPlayer<T extends { userId: string | null; ipKey: string | null }>(player: T) {
  const { userId: _userId, ipKey: _ipKey, ...rest } = player;
  return rest;
}

export const playerRouter = createTRPCRouter({
  /**
   * Starts a game. The row is the server's record of "this caller started a game at this time": the score
   * is not accepted here, only at the end through updateFinalStats.
   */
  create: publicProcedure
    .use(rateLimit({ limit: 20, windowMs: 60_000 }))
    .input(createPlayerSchema)
    .mutation(async ({ input, ctx }) => {
      // Signed-in players always play under their claimed hero name; guests cannot take a claimed one.
      const identity = await resolveScoreIdentity(ctx.session, input.name);
      try {
        const player = await db.player.create({
          data: {
            name: identity.name.toUpperCase(),
            score: 0,
            avgReactionTime: 0,
            mistakesMade: 0,
            correctHits: 0,
            commonMistakes: [],
            userId: identity.userId,
            ipKey: getClientKey(ctx.headers),
          },
        });

        return publicPlayer(player);
      } catch (error) {
        console.error("Error creating player:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create player",
        });
      }
    }),

  /**
   * Finishes a game, once. Checks the caller owns the row and the result is one a real game could produce,
   * then records it and writes the leaderboard entry from the stored values (the client no longer submits
   * leaderboard scores for Whack-A-Sign).
   */
  updateFinalStats: publicProcedure
    .use(rateLimit({ limit: 20, windowMs: 60_000 }))
    .input(updateFinalStatsSchema)
    .mutation(async ({ input, ctx }) => {
      const player = await db.player.findUnique({ where: { id: input.playerId } });
      if (!player) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Player not found" });
      }

      const caller = { userId: ctx.session?.user?.id ?? null, ipKey: getClientKey(ctx.headers) };
      if (!ownsPlayer(player, caller)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This game belongs to someone else" });
      }
      if (player.finalizedAt) {
        throw new TRPCError({ code: "CONFLICT", message: "This game has already been submitted" });
      }

      // (tsconfig is not strict, so zod infers these as optional; the schema guarantees they are present.)
      const stats = {
        score: input.score as number,
        correctHits: input.correctHits as number,
        mistakesMade: input.mistakesMade as number,
        avgReactionTime: input.avgReactionTime as number,
      };
      const problem = validateFinalStats(stats, player.createdAt);
      if (problem) {
        throw new TRPCError({ code: "BAD_REQUEST", message: problem });
      }

      try {
        // Claim the single finish atomically so two simultaneous submissions cannot both win.
        const claimed = await db.player.updateMany({
          where: {
            id: player.id,
            OR: [{ finalizedAt: null }, { finalizedAt: { isSet: false } }],
          },
          data: {
            ...stats,
            practice: input.practice === true,
            finalizedAt: new Date(),
          },
        });
        if (claimed.count === 0) {
          throw new TRPCError({ code: "CONFLICT", message: "This game has already been submitted" });
        }

        // Tap-to-score games (phones) are practice: the player keeps the report, but only camera games are ranked.
        if (input.practice !== true) {
          await db.leaderboardEntry.create({
            data: {
              name: player.name,
              score: stats.score,
              playerId: player.id,
              userId: player.userId,
            },
          });
        }

        return publicPlayer(await db.player.findUniqueOrThrow({ where: { id: player.id } }));
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("Error updating final stats:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update final stats",
        });
      }
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      if (!isObjectId(input.id)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Player not found" });
      }
      try {
        const player = await db.player.findUnique({
          where: { id: input.id },
        });

        if (!player) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Player not found",
          });
        }

        return publicPlayer(player);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch player",
        });
      }
    }),
});
