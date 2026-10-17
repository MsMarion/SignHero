import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { z } from "zod";
import { resolveScoreIdentity } from "~/server/score-identity";

const createEntrySchema = z.object({
    name: z.string().min(1, "Name is required").max(20, "Name too long"),
    score: z.number().int().min(0, "Score must be non-negative"),
    playerId: z.string().optional(),
    songId: z.string().optional(),
});

export const leaderboardRouter = createTRPCRouter({
    getAll: publicProcedure.query(async () => {
        try {
            const entries = await db.leaderboardEntry.findMany({
                orderBy: {
                    score: "desc",
                },
                take: 100,
            });

            return entries.map((entry, index) => ({
                ...entry,
                rank: index + 1,
            }));
        } catch (error) {
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch leaderboard",
            });
        }
    }),

    getTop: publicProcedure
        .input(z.object({ limit: z.number().int().min(1).max(100).default(10) }))
        .query(async ({ input }) => {
            try {
                const entries = await db.leaderboardEntry.findMany({
                    orderBy: {
                        score: "desc",
                    },
                    take: input.limit,
                });

                return entries.map((entry, index) => ({
                    ...entry,
                    rank: index + 1,
                }));
            } catch (error) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to fetch leaderboard",
                });
            }
        }),

    getBySongId: publicProcedure
        .input(z.object({ songId: z.string(), limit: z.number().int().min(1).max(50).default(10) }))
        .query(async ({ input }) => {
            try {
                const entries = await db.leaderboardEntry.findMany({
                    where: { songId: input.songId },
                    orderBy: { score: "desc" },
                    take: input.limit,
                });

                return entries.map((entry, index) => ({
                    ...entry,
                    rank: index + 1,
                }));
            } catch (error) {
                console.error("Error fetching song leaderboard:", error);
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to fetch song leaderboard",
                });
            }
        }),

    create: publicProcedure
        .input(createEntrySchema)
        .mutation(async ({ input, ctx }) => {
            // Resolve who this score belongs to before the try block, so a refusal is not turned into a 500.
            const identity = await resolveScoreIdentity(ctx.session, input.name);
            try {
                const count = await db.leaderboardEntry.count({
                    where: input.songId ? { songId: input.songId } : {},
                });

                const entry = await db.leaderboardEntry.create({
                    data: {
                        name: identity.name.toUpperCase(),
                        score: input.score,
                        playerId: input.playerId,
                        songId: input.songId,
                        userId: identity.userId,
                    },
                });

                const higherScores = await db.leaderboardEntry.count({
                    where: {
                        score: { gt: input.score },
                        ...(input.songId ? { songId: input.songId } : {}),
                    },
                });

                return {
                    ...entry,
                    rank: higherScores + 1,
                };
            } catch (error) {
                console.error("Error creating leaderboard entry:", error);
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to create leaderboard entry",
                });
            }
        }),

    upsert: publicProcedure
        .input(createEntrySchema)
        .mutation(async ({ input, ctx }) => {
            // Resolve who this score belongs to before the try block, so a refusal is not turned into a 500.
            const identity = await resolveScoreIdentity(ctx.session, input.name);
            try {
                const normalizedName = identity.name.toUpperCase();

                // CRITICAL: Use playerId or name, scoped strictly by songId
                const existingEntry = input.playerId 
                    ? await db.leaderboardEntry.findFirst({
                        where: { playerId: input.playerId, songId: input.songId ?? null },
                      })
                    : await db.leaderboardEntry.findFirst({
                        where: { name: normalizedName, songId: input.songId ?? null },
                      });

                let entry;

                if (existingEntry) {
                    // Entry exists - only update if new score is higher
                    if (input.score > existingEntry.score) {
                        entry = await db.leaderboardEntry.update({
                            where: { id: existingEntry.id },
                            data: {
                                score: input.score,
                                name: normalizedName,
                                userId: identity.userId,
                            },
                        });
                        console.log(`✅ Updated ${normalizedName} on song ${input.songId}: ${existingEntry.score} → ${input.score}`);
                    } else {
                        entry = existingEntry;
                        console.log(`ℹ️ Kept high score for ${normalizedName} on song ${input.songId}: ${existingEntry.score}`);
                    }
                } else {
                    // New entry
                    entry = await db.leaderboardEntry.create({
                        data: {
                            name: normalizedName,
                            score: input.score,
                            playerId: input.playerId,
                            songId: input.songId,
                            userId: identity.userId,
                        },
                    });
                    console.log(`✅ Created new entry for ${normalizedName} on song ${input.songId}: ${input.score}`);
                }

                const higherScores = await db.leaderboardEntry.count({
                    where: {
                        score: { gt: entry.score },
                        ...(input.songId ? { songId: input.songId } : {}),
                    },
                });

                return {
                    ...entry,
                    rank: higherScores + 1,
                };
            } catch (error) {
                console.error("Error upserting leaderboard entry:", error);
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to upsert leaderboard entry",
                });
            }
        }),
});