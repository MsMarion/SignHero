import { runTag } from "./env-setup";
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Session } from "next-auth";
import { db } from "~/server/db";
import { createCaller } from "~/server/api/root";
import { claimHeroName } from "~/server/hero-name";

const userIds: string[] = [];
const playerIds: string[] = [];

// Each test uses its own address so the per-address rate limits never interfere with each other.
let n = 0;
const headersFor = (ip: string) => new Headers({ "cf-connecting-ip": ip });
const freshIp = () => `10.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}.${++n}`;
const sessionFor = (id: string, heroName: string) =>
  ({ user: { id, heroName }, expires: "2999-01-01" }) as unknown as Session;
const caller = (ip: string, session: Session | null = null) => createCaller({ db, session, headers: headersFor(ip) });

async function makeHero(label: string, name: string) {
  const user = await db.user.create({ data: { email: `${runTag}-${label}@example.test` } });
  userIds.push(user.id);
  const claim = await claimHeroName(user.id, name);
  assert.equal(claim.status, "claimed");
  return user;
}

/** Pretend the game started `seconds` ago, since a real game takes about 33 s. */
async function backdate(playerId: string, seconds = 40) {
  await db.player.update({ where: { id: playerId }, data: { createdAt: new Date(Date.now() - seconds * 1000) } });
}

const stats = (playerId: string, over: Partial<{ score: number; correctHits: number }> = {}) => ({
  playerId,
  score: 9600,
  correctHits: 12,
  mistakesMade: 2,
  avgReactionTime: 850,
  ...over,
});

after(async () => {
  await db.leaderboardEntry.deleteMany({ where: { playerId: { in: playerIds } } });
  await db.player.deleteMany({ where: { id: { in: playerIds } } });
  await db.heroName.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

async function start(ip: string, name: string, session: Session | null = null) {
  const p = await caller(ip, session).player.create({ name });
  playerIds.push(p.id);
  return p;
}

describe("finishing a game", () => {
  test("a guest's finished game is recorded once and lands on the leaderboard from the stored values", async () => {
    const ip = freshIp();
    const p = await start(ip, `G${runTag}`.slice(0, 20));
    assert.equal(p.score, 0);
    assert.equal("ipKey" in p, false, "owner fields are not sent to browsers");
    await backdate(p.id);
    const done = await caller(ip).player.updateFinalStats(stats(p.id));
    assert.equal(done.score, 9600);
    const entries = await db.leaderboardEntry.findMany({ where: { playerId: p.id } });
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.score, 9600);
    assert.equal(entries[0]!.userId, null);
  });

  test("a practice game (taps on a phone) is recorded for its report but never put on the leaderboard", async () => {
    const ip = freshIp();
    const p = await start(ip, `P${runTag}`.slice(0, 20));
    await backdate(p.id);
    const done = await caller(ip).player.updateFinalStats({ ...stats(p.id), practice: true });
    assert.equal(done.practice, true);
    assert.equal(done.score, 9600);
    assert.equal(await db.leaderboardEntry.count({ where: { playerId: p.id } }), 0);
    // it is still finished once, like any game
    await assert.rejects(caller(ip).player.updateFinalStats({ ...stats(p.id), practice: false }), { code: "CONFLICT" });
  });

  test("a second submission for the same game is refused", async () => {
    const ip = freshIp();
    const p = await start(ip, `H${runTag}`.slice(0, 20));
    await backdate(p.id);
    await caller(ip).player.updateFinalStats(stats(p.id));
    await assert.rejects(caller(ip).player.updateFinalStats(stats(p.id, { score: 12000 })), { code: "CONFLICT" });
    assert.equal(await db.leaderboardEntry.count({ where: { playerId: p.id } }), 1);
  });

  test("two simultaneous submissions produce exactly one result", async () => {
    const ip = freshIp();
    const p = await start(ip, `R${runTag}`.slice(0, 20));
    await backdate(p.id);
    const results = await Promise.allSettled([
      caller(ip).player.updateFinalStats(stats(p.id)),
      caller(ip).player.updateFinalStats(stats(p.id)),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await db.leaderboardEntry.count({ where: { playerId: p.id } }), 1);
  });

  test("somebody else cannot finish or overwrite your game", async () => {
    const ip = freshIp();
    const p = await start(ip, `O${runTag}`.slice(0, 20));
    await backdate(p.id);
    await assert.rejects(caller(freshIp()).player.updateFinalStats(stats(p.id)), { code: "FORBIDDEN" });
    const other = await makeHero("intruder", `Intruder${runTag.slice(-4)}`);
    await assert.rejects(caller(ip, sessionFor(other.id, "x")).player.updateFinalStats(stats(p.id)), {
      code: "FORBIDDEN",
    });
    assert.equal((await db.player.findUniqueOrThrow({ where: { id: p.id } })).finalizedAt, null);
  });

  test("a signed-in player's game is owned by their account, under their hero name", async () => {
    const heroName = `Owner${runTag.slice(-5)}`;
    const hero = await makeHero("owner", heroName);
    const session = sessionFor(hero.id, heroName);
    const ip = freshIp();
    const p = await start(ip, "CLIENT NAME", session);
    assert.equal(p.name, heroName.toUpperCase());
    await backdate(p.id);
    // The same account from a different address is fine; a guest from the same address is not.
    await assert.rejects(caller(ip).player.updateFinalStats(stats(p.id)), { code: "FORBIDDEN" });
    await caller(freshIp(), session).player.updateFinalStats(stats(p.id));
    const entry = await db.leaderboardEntry.findFirstOrThrow({ where: { playerId: p.id } });
    assert.equal(entry.userId, hero.id);
  });

  test("impossible results are refused and leave the game open", async () => {
    const ip = freshIp();
    const p = await start(ip, `I${runTag}`.slice(0, 20));
    await assert.rejects(caller(ip).player.updateFinalStats(stats(p.id)), { code: "BAD_REQUEST" }); // too early
    await backdate(p.id);
    await assert.rejects(caller(ip).player.updateFinalStats(stats(p.id, { score: 999_999 })), { code: "BAD_REQUEST" });
    await assert.rejects(caller(ip).player.updateFinalStats(stats(p.id, { correctHits: 500, score: 400_000 })), {
      code: "BAD_REQUEST",
    });
    assert.equal((await db.player.findUniqueOrThrow({ where: { id: p.id } })).finalizedAt, null);
    await caller(ip).player.updateFinalStats(stats(p.id)); // a genuine result still works afterwards
  });

  test("a made-up player id is not found", async () => {
    await assert.rejects(caller(freshIp()).player.updateFinalStats(stats("0".repeat(24))), { code: "NOT_FOUND" });
  });
});

describe("the open write routes", () => {
  test("whack scores cannot be posted straight to the leaderboard", async () => {
    const ip = freshIp();
    await assert.rejects(
      // songId is required, so a score with none is refused (cast: the type system would not allow the call)
      caller(ip).leaderboard.create({ name: "CHEAT", score: 99999 } as never),
      { code: "BAD_REQUEST" },
    );
    await assert.rejects(caller(ip).leaderboard.create({ name: "CHEAT", score: 99999, songId: "0".repeat(24) }), {
      code: "NOT_FOUND",
    });
    assert.equal("upsert" in caller(ip).leaderboard, false);
  });

  test("starting games is rate limited per address", async () => {
    const ip = freshIp();
    for (let i = 0; i < 20; i++) await start(ip, `L${i}${runTag}`.slice(0, 20));
    await assert.rejects(caller(ip).player.create({ name: "ONE TOO MANY" }), { code: "TOO_MANY_REQUESTS" });
    await start(freshIp(), `M${runTag}`.slice(0, 20)); // other addresses are unaffected
  });

  test("song creation needs a signed-in user", async () => {
    await assert.rejects(
      caller(freshIp()).song.create({
        songName: "x",
        albumName: "x",
        thumbnailName: "x",
        thumbnailUrl: "http://x/y.png",
        audioUrl: "http://x/y.mp3",
        interactions: [],
      } as never),
      { code: "UNAUTHORIZED" },
    );
  });
});
