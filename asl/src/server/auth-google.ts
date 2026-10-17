import { db } from "~/server/db";

/** The subset of Google's OpenID profile that we use. */
export interface GoogleProfileLike {
  email?: string | null;
  email_verified?: boolean;
  name?: string | null;
  given_name?: string | null;
  picture?: string | null;
}

/**
 * Finds the user for a Google-verified email, or creates one.
 *
 * An existing account with the same email (for example one registered with a password) is reused,
 * so the same person keeps one account, one leaderboard history and one Gemini key. Returns null
 * when Google did not verify the email, because linking on an unverified address would let someone
 * take over another person's account.
 */
export async function upsertGoogleUser(profile: GoogleProfileLike) {
  const email = profile.email ?? undefined;
  if (!email || profile.email_verified !== true) return null;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    if (!existing.image && profile.picture) {
      return db.user.update({ where: { id: existing.id }, data: { image: profile.picture } });
    }
    return existing;
  }

  try {
    // No display name here: the player picks a hero name (once, permanently) on their first sign-in.
    return await db.user.create({
      data: {
        email,
        image: profile.picture ?? undefined,
      },
    });
  } catch (err) {
    // Two first-time sign-ins racing: the other request created the row (unique email), so use it.
    const created = await db.user.findUnique({ where: { email } });
    if (created) return created;
    throw err;
  }
}
