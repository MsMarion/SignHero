import { db } from "~/server/db";

export const HERO_NAME_MIN = 3;
export const HERO_NAME_MAX = 16;

/** Names nobody may claim: the guest default and anything that could pass for staff or the game. */
const RESERVED_KEYS = new Set([
  "GUEST", "GUESTHERO", "ADMIN", "ADMINISTRATOR", "MODERATOR", "MOD", "SYSTEM", "SIGNHERO",
  "SUPPORT", "OFFICIAL", "STAFF", "ROOT", "NULL", "UNDEFINED", "ANONYMOUS", "YOU", "PLAYER",
]);

/**
 * A deliberately small filter for unambiguous abuse. It is not moderation; it only stops the
 * most obvious names from being claimed permanently. Matched against the key after lookalike digits
 * are mapped back to letters.
 */
const BLOCKED_FRAGMENTS = [
  "FUCK", "SHIT", "CUNT", "BITCH", "NIGGA", "NIGGER", "FAGGOT", "RETARD", "RAPIST", "NAZI", "HITLER", "WHORE",
];

const LOOKALIKES: Record<string, string> = { "0": "O", "1": "I", "3": "E", "4": "A", "5": "S", "7": "T" };

/** Trim and collapse runs of whitespace, so "  Sign   Master " becomes "Sign Master". */
export function cleanHeroName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * The uniqueness key: uppercase with spaces, underscores and hyphens removed, so "Sign Master",
 * "sign_master" and "SIGNMASTER" are all the same name.
 */
export function heroNameKey(raw: string): string {
  return cleanHeroName(raw).toUpperCase().replace(/[\s_-]+/g, "");
}

// Results use a string `status` tag rather than a boolean: this project builds with `strict: false`,
// where TypeScript does not narrow unions on boolean discriminants.
export type HeroNameValidation =
  | { status: "ok"; name: string; key: string }
  | { status: "invalid"; reason: string };

export function validateHeroName(raw: string): HeroNameValidation {
  const name = cleanHeroName(raw);
  if (name.length < HERO_NAME_MIN) return { status: "invalid", reason: `Use at least ${HERO_NAME_MIN} characters.` };
  if (name.length > HERO_NAME_MAX) return { status: "invalid", reason: `Use at most ${HERO_NAME_MAX} characters.` };
  if (!/^[A-Za-z0-9][A-Za-z0-9 _-]*[A-Za-z0-9]$/.test(name)) {
    return { status: "invalid", reason: "Use letters, numbers, spaces, - or _, starting and ending with a letter or number." };
  }
  const key = heroNameKey(name);
  if (RESERVED_KEYS.has(key)) return { status: "invalid", reason: "That name is reserved." };
  const readable = key.replace(/[0-9]/g, (d) => LOOKALIKES[d] ?? d);
  if (BLOCKED_FRAGMENTS.some((word) => readable.includes(word))) {
    return { status: "invalid", reason: "Please choose a different name." };
  }
  return { status: "ok", name, key };
}

export async function getHeroName(userId: string) {
  return db.heroName.findUnique({ where: { userId } });
}

export async function isHeroNameTaken(key: string): Promise<boolean> {
  return (await db.heroName.findUnique({ where: { key }, select: { id: true } })) !== null;
}

/** True when a signed-out player is trying to use a name an account has claimed (or a reserved one). */
export async function guestNameIsClaimed(rawName: string): Promise<boolean> {
  const key = heroNameKey(rawName);
  if (!key) return false;
  // The guest default is the one reserved name guests are allowed to use.
  if (key === "GUESTHERO") return false;
  if (RESERVED_KEYS.has(key)) return true;
  return isHeroNameTaken(key);
}

export type ClaimResult =
  | { status: "claimed"; name: string }
  | { status: "invalid" | "taken" | "already_has_name"; message: string };

function prismaCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null ? (err as { code?: string }).code : undefined;
}

function isUniqueViolation(err: unknown): boolean {
  return prismaCode(err) === "P2002";
}

/** MongoDB aborts the loser of two concurrent transactions touching the same key; retrying resolves it. */
function isWriteConflict(err: unknown): boolean {
  return prismaCode(err) === "P2034";
}

/**
 * Claims a hero name for a user, permanently. The name row and the user's display name are written
 * in one transaction; the unique key makes the claim safe against two people racing for the same name.
 */
export async function claimHeroName(userId: string, raw: string): Promise<ClaimResult> {
  const checked = validateHeroName(raw);
  if (checked.status === "invalid") return { status: "invalid", message: checked.reason };

  if (await getHeroName(userId)) {
    return { status: "already_has_name", message: "This account already has a hero name, and it cannot be changed." };
  }

  for (let attempt = 1; ; attempt++) {
    try {
      await db.$transaction([
        db.heroName.create({ data: { key: checked.key, name: checked.name, userId } }),
        db.user.update({ where: { id: userId }, data: { displayName: checked.name } }),
      ]);
      return { status: "claimed", name: checked.name };
    } catch (err) {
      if (isWriteConflict(err) && attempt < 4) {
        // We lost a race with another transaction; retry and the unique key will give the real answer.
        await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
        continue;
      }
      if (isUniqueViolation(err) || isWriteConflict(err)) {
        // Either someone else just took the name, or this same user raced themselves.
        if (await getHeroName(userId)) {
          return { status: "already_has_name", message: "This account already has a hero name, and it cannot be changed." };
        }
        return { status: "taken", message: "That name is already taken." };
      }
      throw err;
    }
  }
}
