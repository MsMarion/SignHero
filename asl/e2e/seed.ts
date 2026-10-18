import { PrismaClient } from "../generated/prisma/index.js";
import { DATABASE_URL } from "./support/env";
import { SEED } from "./support/seed-ids";

/**
 * Wipes the dedicated e2e database and plants known rows. It refuses to run against anything whose name
 * does not contain "e2e", because it deletes everything.
 */
async function main() {
  if (!/e2e/i.test(new URL(DATABASE_URL.replace("mongodb://", "http://")).pathname)) {
    throw new Error(`Refusing to wipe ${DATABASE_URL}: the database name must contain "e2e".`);
  }
  const db = new PrismaClient({ datasourceUrl: DATABASE_URL });
  try {
    await db.leaderboardEntry.deleteMany({});
    await db.player.deleteMany({});
    await db.heroName.deleteMany({});
    await db.user.deleteMany({});
    await db.song.deleteMany({});

    const seeded = await db.user.create({ data: { email: "e2e-seeded@example.test" } });
    await db.heroName.create({ data: { key: "e2ealpha", name: SEED.seededUserName, userId: seeded.id } });

    const base = { commonMistakes: [], v: 0 };
    await db.player.create({ data: { ...base, id: SEED.reportPlayer, name: "E2E REPORT", score: 9600, avgReactionTime: 850, mistakesMade: 3, correctHits: 12, finalizedAt: new Date() } });
    await db.player.create({ data: { ...base, id: SEED.emptyPlayer, name: "E2E EMPTY", score: 0, avgReactionTime: 0, mistakesMade: 0, correctHits: 0, finalizedAt: new Date() } });
    await db.player.create({ data: { ...base, id: SEED.flawlessPlayer, name: "E2E FLAWLESS", score: 4000, avgReactionTime: 600, mistakesMade: 0, correctHits: 5, finalizedAt: new Date() } });
    await db.player.create({
      data: { ...base, id: SEED.mistakesPlayer, name: "E2E MISTAKES", score: 3000, avgReactionTime: 900, mistakesMade: 4, correctHits: 4, commonMistakes: [{ key1: "M", key2: "N", hits: 3 }, { key1: "A", key2: "E", hits: 1 }], finalizedAt: new Date() },
    });

    // Scores above anything a real 30 s game can reach, so the seeded rows are always the top of the board.
    await db.leaderboardEntry.create({ data: { name: SEED.seededUserName, score: 99000, userId: seeded.id } });
    await db.leaderboardEntry.create({ data: { name: "E2E BRAVO", score: 98000 } });
    await db.leaderboardEntry.create({ data: { name: "E2E CHARLIE", score: 97000 } });
    await db.leaderboardEntry.create({ data: { name: "E2E DELTA", score: 96000 } });
  } finally {
    await db.$disconnect();
  }
}

await main();
console.log("[e2e] database seeded");
