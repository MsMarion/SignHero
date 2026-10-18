import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createDetectionTicket, verifyDetectionTicket, TICKET_TTL_SECONDS } from "../../src/server/detection-token";

const SECRET = "test-secret-0123456789abcd";
const NOW = 1_700_000_000_000;

describe("detection tickets", () => {
  test("a fresh ticket verifies and expires after the ttl", () => {
    const t = createDetectionTicket(SECRET, NOW);
    assert.ok(verifyDetectionTicket(SECRET, t, NOW));
    assert.ok(verifyDetectionTicket(SECRET, t, NOW + TICKET_TTL_SECONDS * 1000));
    assert.equal(verifyDetectionTicket(SECRET, t, NOW + (TICKET_TTL_SECONDS + 1) * 1000), false);
  });

  test("tickets differ every time and do not verify with another secret", () => {
    assert.notEqual(createDetectionTicket(SECRET, NOW), createDetectionTicket(SECRET, NOW));
    assert.equal(verifyDetectionTicket("another-secret-0123456789", createDetectionTicket(SECRET, NOW), NOW), false);
  });

  test("tampering and malformed input are refused", () => {
    const t = createDetectionTicket(SECRET, NOW);
    const [expires, nonce, sig] = t.split(".") as [string, string, string];
    assert.equal(verifyDetectionTicket(SECRET, `${Number(expires) + 1000}.${nonce}.${sig}`, NOW), false);
    assert.equal(verifyDetectionTicket(SECRET, `${expires}.${nonce}.${"0".repeat(64)}`, NOW), false);
    for (const bad of ["", "garbage", "1.2.3", `${expires}.${nonce}`, `${t}.extra`]) {
      assert.equal(verifyDetectionTicket(SECRET, bad, NOW), false, bad);
    }
  });

  test("matches the fixed vector the Python side (tests/backend/test_ws_auth.py) checks", () => {
    const payload = "4102444800.0123456789abcdef";
    const sig = createHmac("sha256", SECRET).update(payload).digest("hex");
    assert.equal(sig, "c8c990886435119af9121b3476213ad1393e44b37fc9ed00450c853433b366c7");
    assert.ok(verifyDetectionTicket(SECRET, `${payload}.${sig}`, NOW));
  });
});
