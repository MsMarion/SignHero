import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isPhoneWidth, PHONE_MAX_WIDTH } from "../../src/hooks/useIsPhone";

describe("phone width", () => {
  test("matches Tailwind's max-sm cut-off: under 640 px is a phone", () => {
    assert.equal(PHONE_MAX_WIDTH, 639);
    for (const w of [320, 375, 390, 430, 639]) assert.ok(isPhoneWidth(w), String(w));
    for (const w of [640, 768, 820, 1080, 1440, 1920]) assert.equal(isPhoneWidth(w), false, String(w));
  });
});
