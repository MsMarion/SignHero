import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { reconnectDelayMs, STALL_MS } from "../../src/lib/reconnect";

const noJitter = () => 0;
const maxJitter = () => 0.999999;

describe("reconnectDelayMs", () => {
  test("backs off 0.5 s, 1 s, 2 s, 4 s and then stays at 5 s", () => {
    const delays = [1, 2, 3, 4, 5, 6, 20].map((attempt) => reconnectDelayMs(attempt, noJitter));
    assert.deepEqual(delays, [500, 1000, 2000, 4000, 5000, 5000, 5000]);
  });

  test("adds up to 25% jitter and never goes below the base delay", () => {
    for (const attempt of [1, 2, 3, 4, 5, 10]) {
      const base = reconnectDelayMs(attempt, noJitter);
      const high = reconnectDelayMs(attempt, maxJitter);
      assert.ok(high >= base, `attempt ${attempt}: ${high} < ${base}`);
      assert.ok(high <= Math.ceil(base * 1.25), `attempt ${attempt}: ${high} exceeds 125% of ${base}`);
    }
  });

  test("real random jitter stays within bounds over many draws", () => {
    for (let i = 0; i < 500; i++) {
      const d = reconnectDelayMs(3);
      assert.ok(d >= 2000 && d <= 2500, `delay ${d} out of range`);
    }
  });

  test("odd attempt numbers are treated as the first retry", () => {
    assert.equal(reconnectDelayMs(0, noJitter), 500);
    assert.equal(reconnectDelayMs(-3, noJitter), 500);
    assert.equal(reconnectDelayMs(1.9, noJitter), 500);
  });

  test("the stall watchdog is longer than any normal reply, shorter than a player's patience", () => {
    assert.ok(STALL_MS >= 2000 && STALL_MS <= 10000);
  });
});
