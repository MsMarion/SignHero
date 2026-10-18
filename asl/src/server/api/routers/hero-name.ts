import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { claimHeroName, getHeroName, isHeroNameTaken, validateHeroName } from "~/server/hero-name";

export const heroNameRouter = createTRPCRouter({
  /** The signed-in user's claimed hero name, or null if they have not chosen one yet. */
  getMine: protectedProcedure.query(async ({ ctx }) => {
    const mine = await getHeroName(ctx.session.user.id);
    return { name: mine?.name ?? null };
  }),

  /** Live feedback while typing: is this name valid, and is it free? */
  check: protectedProcedure
    .input(z.object({ name: z.string().max(64) }))
    .query(async ({ input }) => {
      const checked = validateHeroName(input.name);
      if (checked.status === "invalid") return { valid: false as const, available: false, reason: checked.reason };
      const taken = await isHeroNameTaken(checked.key);
      return {
        valid: true as const,
        available: !taken,
        name: checked.name,
        reason: taken ? "That name is already taken." : null,
      };
    }),

  /** Claims a hero name permanently. There is intentionally no way to change it afterwards. */
  claim: protectedProcedure
    .input(z.object({ name: z.string().max(64) }))
    .mutation(async ({ input, ctx }) => {
      const result = await claimHeroName(ctx.session.user.id, input.name);
      if (result.status === "claimed") return { name: result.name };
      throw new TRPCError({
        code: result.status === "invalid" ? "BAD_REQUEST" : "CONFLICT",
        message: result.message,
      });
    }),
});
