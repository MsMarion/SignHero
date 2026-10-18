import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { z } from "zod";
import { resolveScoreIdentity } from "~/server/score-identity";

const createPlayerSchema = z.object({
  name: z.string().min(1).max(20),
  score: z.number().int().min(0),
  avgReactionTime: z.number().min(0),
  mistakesMade: z.number().int().min(0),
  correctHits: z.number().int().min(0),
});

const addMistakeSchema = z.object({
  playerId: z.string(),
  key1: z.string().length(1),
  key2: z.string().length(1),
});

const updateFinalStatsSchema = z.object({
  playerId: z.string(),
  score: z.number().int().min(0).optional(),
  avgReactionTime: z.number().min(0),
  mistakesMade: z.number().int().min(0),
  correctHits: z.number().int().min(0),
});

type CommonMistake = {
  key1: string;
  key2: string;
  hits: number;
};

export const playerRouter = createTRPCRouter({
  create: publicProcedure
    .input(createPlayerSchema)
    .mutation(async ({ input, ctx }) => {
      // Signed-in players always play under their claimed hero name; guests cannot take a claimed one.
      const identity = await resolveScoreIdentity(ctx.session, input.name);
      try {
        const player = await db.player.create({
          data: {
            name: identity.name.toUpperCase(),
            score: input.score,
            avgReactionTime: input.avgReactionTime,
            mistakesMade: input.mistakesMade,
            correctHits: input.correctHits,
            commonMistakes: [],
          },
        });
        
        return player;
      } catch (error) {
        console.error("Error creating player:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create player",
        });
      }
    }),

  addMistake: publicProcedure
    .input(addMistakeSchema)
    .mutation(async ({ input }) => {
      try {
        const player = await db.player.findUnique({
          where: { id: input.playerId },
        });

        if (!player) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Player not found",
          });
        }

        const mistakes = player.commonMistakes as CommonMistake[];
        const existingIndex = mistakes.findIndex(
          (m) => m.key1 === input.key1 && m.key2 === input.key2
        );

        let updatedMistakes: CommonMistake[];
        
        if (existingIndex !== -1) {
          updatedMistakes = [...mistakes];
          const existing = updatedMistakes[existingIndex]!;
          updatedMistakes[existingIndex] = {
            ...existing,
            hits: existing.hits + 1,
          };
        } else {
          updatedMistakes = [
            ...mistakes,
            { key1: input.key1, key2: input.key2, hits: 1 },
          ];
        }

        const updatedPlayer = await db.player.update({
          where: { id: input.playerId },
          data: { commonMistakes: updatedMistakes },
        });

        return updatedPlayer;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to add mistake",
        });
      }
    }),

  updateFinalStats: publicProcedure
    .input(updateFinalStatsSchema)
    .mutation(async ({ input }) => {
      try {
        const updateData: {
          avgReactionTime: number;
          mistakesMade: number;
          correctHits: number;
          score?: number;
        } = {
          avgReactionTime: input.avgReactionTime,
          mistakesMade: input.mistakesMade,
          correctHits: input.correctHits,
        };

        if (input.score !== undefined) {
          updateData.score = input.score;
        }

        const player = await db.player.update({
          where: { id: input.playerId },
          data: updateData,
        });
        
        return player;
      } catch (error) {
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

        return player;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch player",
        });
      }
    }),
});