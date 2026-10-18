import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { 
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  rateLimit,
} from "../trpc";
import { devmodeEnabled } from "~/server/devmode-guard";

import { z } from "zod";
import { songMediaUrl } from "~/lib/s3";

const createSongSchema = z.object({
  songName: z.string().min(1, "Song name is required").max(200, "Song name too long"),
  albumName: z.string().min(1, "Album name is required").max(200, "Album name too long"),
  thumbnailName: z.string().optional(),
  thumbnailUrl: z.string().url().optional(),
  audioUrl: z.string().url().optional(),
  isCommunity: z.boolean().optional().default(false),
  interactions: z.array(
    z.object({
      key: z.string().min(1, "Interaction key is required"),
      timeElapsed: z.number().min(0, "Time elapsed must be non-negative"),
    })
  ).optional().default([]),
});

export const songRouter = createTRPCRouter({
  getAll: publicProcedure.query(async () => {
    try {
      const songs = await db.song.findMany({
        orderBy: {
          createdAt: "desc",
        },
      });
      return songs.map(song => ({
        ...song,
        thumbnailUrl: songMediaUrl(song.thumbnailUrl),
        audioUrl: songMediaUrl(song.audioUrl),
      }));
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch songs",
      });
    }
  }),

  getCommunitySongs: publicProcedure.query(async () => {
    try {
      const songs = await db.song.findMany({
        where: {
          isCommunity: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
      return songs.map(song => ({
        ...song,
        thumbnailUrl: songMediaUrl(song.thumbnailUrl),
        audioUrl: songMediaUrl(song.audioUrl),
      }));
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch community songs",
      });
    }
  }),

  getOfficialSongs: publicProcedure.query(async () => {
    try {
      const songs = await db.song.findMany({
        where: {
          isCommunity: false,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
      return songs.map(song => ({
        ...song,
        thumbnailUrl: songMediaUrl(song.thumbnailUrl),
        audioUrl: songMediaUrl(song.audioUrl),
      }));
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch official songs",
      });
    }
  }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      try {
        const song = await db.song.findUnique({
          where: { id: input.id },
        });

        if (!song) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Song not found",
          });
        }

        // Sort interactions by timeElapsed before returning
        if (song.interactions) {
          song.interactions.sort((a: { timeElapsed: number }, b: { timeElapsed: number }) => a.timeElapsed - b.timeElapsed);
        }

        return {
          ...song,
          thumbnailUrl: songMediaUrl(song.thumbnailUrl),
          audioUrl: songMediaUrl(song.audioUrl),
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch song",
        });
      }
    }),

  // Song import is off in production until songs are reworked (see server/devmode-guard.ts); signed-in only otherwise.
  create: protectedProcedure
    .use(rateLimit({ limit: 10, windowMs: 60_000 }))
    .input(createSongSchema)
    .mutation(async ({ input }) => {
      if (!devmodeEnabled()) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Song creation is disabled" });
      }
      try {
        // For embedded documents (types), just assign the array directly
        // Explicitly type the interactions to match Prisma's expected type
        const interactions: { key: string; timeElapsed: number }[] = 
          input.interactions?.map(i => ({
            key: i.key,
            timeElapsed: i.timeElapsed,
          })) || [];

        const song = await db.song.create({
          data: {
            songName: input.songName,
            isCommunity: true, // Security Enforcement: All public uploads must be community songs
            albumName: input.albumName,
            thumbnailName: input.thumbnailName,
            thumbnailUrl: input.thumbnailUrl,
            audioUrl: input.audioUrl,
            interactions,
          },
        });
        return song;
      } catch (error) {
        console.error("Error creating song:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create song",
        });
      }
    }),
});