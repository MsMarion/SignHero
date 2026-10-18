import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter, getClientKey } from "../../src/server/rate-limit";

describe("createRateLimiter", () => {
  test("allows up to the limit, then refuses with a retry time", () => {
    const rl = createRateLimiter({ limit: 3, windowMs: 1000 });
    assert.ok(rl.check("a", 0).ok);
    assert.ok(rl.check("a", 10).ok);
    assert.ok(rl.check("a", 20).ok);
    const refused = rl.check("a", 30);
    assert.equal(refused.ok, false);
    assert.equal(refused.retryAfterMs, 970);
  });

  test("keys are independent", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000 });
    assert.ok(rl.check("a", 0).ok);
    assert.ok(rl.check("b", 0).ok);
    assert.equal(rl.check("a", 1).ok, false);
  });

  test("the window resets after windowMs", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000 });
    assert.ok(rl.check("a", 0).ok);
    assert.equal(rl.check("a", 999).ok, false);
    assert.ok(rl.check("a", 1000).ok);
  });

  test("a refused call does not extend the window", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000 });
    rl.check("a", 0);
    for (let t = 1; t < 900; t += 100) rl.check("a", t);
    assert.ok(rl.check("a", 1000).ok);
  });
});

describe("getClientKey", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  test("prefers Cloudflare's address, then x-forwarded-for's first entry", () => {
    assert.equal(getClientKey(h({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" })), "1.1.1.1");
    assert.equal(getClientKey(h({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" })), "2.2.2.2");
    assert.equal(getClientKey(h({ "x-real-ip": "4.4.4.4" })), "4.4.4.4");
    assert.equal(getClientKey(h({})), "unknown");
  });
});
