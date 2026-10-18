import { TRPCError } from "@trpc/server";
import type { Session } from "next-auth";
import { getHeroName, guestNameIsClaimed } from "~/server/hero-name";

/**
 * Decides which name (and account) a player or leaderboard row is saved under. The client's name is
 * never trusted for signed-in users:
 *  - signed in: the permanently claimed hero name and the account id; no hero name yet means no scores;
 *  - guest: whatever name they sent, unless an account has claimed it.
 */
export async function resolveScoreIdentity(
  session: Session | null,
  requestedName: string,
): Promise<{ name: string; userId?: string }> {
  const userId = session?.user?.id;
  if (userId) {
    const hero = await getHeroName(userId);
    if (!hero) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Choose a hero name before saving scores." });
    }
    return { name: hero.name, userId };
  }

  if (await guestNameIsClaimed(requestedName)) {
    throw new TRPCError({ code: "CONFLICT", message: "That name is reserved or belongs to a registered hero. Sign in to use your own, or pick another name." });
  }
  return { name: requestedName };
}
