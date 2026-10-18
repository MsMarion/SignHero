import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { createTRPCRouter, publicProcedure, rateLimit } from "../trpc";
import { z } from "zod";
import { resolveScoreIdentity } from "~/server/score-identity";

// Song-mode scores are computed by the client and are not verified yet; this only stops absurd values.
// Whack-A-Sign scores no longer come through here: player.updateFinalStats validates and records them.
const MAX_SONG_SCORE = 1_000_000;

const createEntrySchema = z.object({
    name: z.string().min(1, "Name is required").max(20, "Name too long"),
    score: z.number().int().min(0, "Score must be non-negative").max(MAX_SONG_SCORE, "Score too high"),
    // Required: a score with no song would land on the Whack-A-Sign board, which only the server may write.
    songId: z.string().regex(/^[0-9a-f]{24}$/, "Invalid song id"),
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
        .use(rateLimit({ limit: 10, windowMs: 60_000 }))
        .input(createEntrySchema)
        .mutation(async ({ input, ctx }) => {
            // Resolve who this score belongs to before the try block, so a refusal is not turned into a 500.
            const identity = await resolveScoreIdentity(ctx.session, input.name);
            try {
                const song = await db.song.findUnique({ where: { id: input.songId }, select: { id: true } });
                if (!song) {
                    throw new TRPCError({ code: "NOT_FOUND", message: "Song not found" });
                }

                const entry = await db.leaderboardEntry.create({
                    data: {
                        name: identity.name.toUpperCase(),
                        score: input.score,
                        songId: input.songId,
                        userId: identity.userId,
                    },
                });

                const higherScores = await db.leaderboardEntry.count({
                    where: {
                        score: { gt: input.score },
                        songId: input.songId,
                    },
                });

                return {
                    ...entry,
                    rank: higherScores + 1,
                };
            } catch (error) {
                if (error instanceof TRPCError) throw error;
                console.error("Error creating leaderboard entry:", error);
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to create leaderboard entry",
                });
            }
        }),
});
