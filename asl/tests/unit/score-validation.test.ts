import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ownsPlayer, validateFinalStats, MAX_HITS } from "../../src/server/score-validation";

const started = new Date("2026-01-01T12:00:00Z");
const after = (s: number) => new Date(started.getTime() + s * 1000);
const good = { score: 12 * 800, correctHits: 12, mistakesMade: 3, avgReactionTime: 900 };

describe("validateFinalStats", () => {
  test("accepts a plausible finished game", () => {
    assert.equal(validateFinalStats(good, started, after(34)), null);
  });

  test("accepts a game with no hits", () => {
    assert.equal(validateFinalStats({ ...good, score: 0, correctHits: 0 }, started, after(34)), null);
  });

  test("refuses a result submitted before a game could have ended", () => {
    assert.match(validateFinalStats(good, started, after(5)) ?? "", /before it could have finished/);
  });

  test("refuses a score that no number of hits could produce", () => {
    assert.ok(validateFinalStats({ ...good, score: 999_999 }, started, after(34)));
    assert.ok(validateFinalStats({ ...good, score: 12 * 500 - 1 }, started, after(34)));
    assert.ok(validateFinalStats({ ...good, score: 12 * 1000 + 1 }, started, after(34)));
    assert.ok(validateFinalStats({ ...good, correctHits: 0, score: 100 }, started, after(34)));
  });

  test("allows the exact edges of the per-hit range", () => {
    assert.equal(validateFinalStats({ ...good, score: 12 * 500 }, started, after(34)), null);
    assert.equal(validateFinalStats({ ...good, score: 12 * 1000 }, started, after(34)), null);
  });

  test("refuses more hits than a 30 s game allows", () => {
    const hits = MAX_HITS + 1;
    assert.ok(validateFinalStats({ ...good, correctHits: hits, score: hits * 800 }, started, after(34)));
  });

  test("refuses negative, fractional and non-finite values", () => {
    assert.ok(validateFinalStats({ ...good, mistakesMade: -1 }, started, after(34)));
    assert.ok(validateFinalStats({ ...good, score: 100.5 }, started, after(34)));
    assert.ok(validateFinalStats({ ...good, avgReactionTime: Number.NaN }, started, after(34)));
    assert.ok(validateFinalStats({ ...good, avgReactionTime: -5 }, started, after(34)));
    assert.ok(validateFinalStats({ ...good, avgReactionTime: 1e9 }, started, after(34)));
  });
});

describe("ownsPlayer", () => {
  test("a signed-in player's game belongs to that user only", () => {
    const player = { userId: "u1", ipKey: "1.1.1.1" };
    assert.ok(ownsPlayer(player, { userId: "u1", ipKey: "9.9.9.9" }));
    assert.equal(ownsPlayer(player, { userId: "u2", ipKey: "1.1.1.1" }), false);
    assert.equal(ownsPlayer(player, { userId: null, ipKey: "1.1.1.1" }), false);
  });

  test("a guest's game belongs to the same address, and never to a signed-in user", () => {
    const player = { userId: null, ipKey: "1.1.1.1" };
    assert.ok(ownsPlayer(player, { userId: null, ipKey: "1.1.1.1" }));
    assert.equal(ownsPlayer(player, { userId: null, ipKey: "2.2.2.2" }), false);
    assert.equal(ownsPlayer(player, { userId: "u1", ipKey: "1.1.1.1" }), false);
  });

  test("a legacy row with no owner can only be claimed by nobody", () => {
    assert.equal(ownsPlayer({ userId: null, ipKey: null }, { userId: null, ipKey: "1.1.1.1" }), false);
  });
});
