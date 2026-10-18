/**
 * Server-side checks for a finished Whack-A-Sign game. The client computes the score, so the server only
 * accepts results that a real 30 s game could produce. This stops console/curl faking, not a custom client
 * that plays a plausible game.
 *
 * Game rules (see hooks/useWhackAMoleGame.ts): 3 s countdown, 30 s timer, every hit is worth
 * 500 + floor(max(0, 2000 - reactionMs) / 4) = 500..1000 points, and each hit is followed by a 1 s cooldown.
 */
export const MIN_GAME_SECONDS = 30; // countdown + timer is 33 s; a little slack for clock rounding
export const MAX_HITS = 32;
export const MIN_POINTS_PER_HIT = 500;
export const MAX_POINTS_PER_HIT = 1000;
export const MAX_MISSES = 10_000;
export const MAX_AVG_REACTION_MS = 30_000;

export type FinalStats = {
  score: number;
  correctHits: number;
  mistakesMade: number;
  avgReactionTime: number;
};

/** Returns a reason the result is impossible, or null if it is plausible. */
export function validateFinalStats(stats: FinalStats, startedAt: Date, now: Date = new Date()): string | null {
  const { score, correctHits, mistakesMade, avgReactionTime } = stats;
  if (![score, correctHits, mistakesMade].every(Number.isInteger)) return "Stats must be whole numbers";
  if (score < 0 || correctHits < 0 || mistakesMade < 0) return "Stats cannot be negative";
  if (!Number.isFinite(avgReactionTime) || avgReactionTime < 0 || avgReactionTime > MAX_AVG_REACTION_MS) {
    return "Reaction time out of range";
  }
  if (mistakesMade > MAX_MISSES) return "Too many misses";
  if (correctHits > MAX_HITS) return "Too many hits for one game";

  const elapsedSeconds = (now.getTime() - startedAt.getTime()) / 1000;
  if (elapsedSeconds < MIN_GAME_SECONDS) return "Game was submitted before it could have finished";

  if (correctHits === 0) {
    return score === 0 ? null : "Score without any hits";
  }
  if (score < correctHits * MIN_POINTS_PER_HIT || score > correctHits * MAX_POINTS_PER_HIT) {
    return "Score does not match the number of hits";
  }
  return null;
}

/** Who may finish a player row: the signed-in user who started it, or the same guest address. */
export function ownsPlayer(
  player: { userId: string | null; ipKey: string | null },
  caller: { userId: string | null; ipKey: string },
): boolean {
  if (player.userId) return caller.userId === player.userId;
  return !caller.userId && player.ipKey === caller.ipKey;
}
