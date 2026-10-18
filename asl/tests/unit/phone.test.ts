import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { computeLayout, PHONE_MAX_WIDTH } from "../../src/lib/layout";

describe("which layout a screen gets", () => {
  test("phones upright get the compact layout on a 480 px stage", () => {
    assert.equal(PHONE_MAX_WIDTH, 639);
    for (const [w, h] of [[320, 568], [375, 667], [390, 844], [430, 932], [639, 1000]] as const) {
      assert.deepEqual(computeLayout(w, h), { mode: "compact", stageWidth: 480, rotatePrompt: false }, `${w}x${h}`);
    }
  });

  test("tablets held upright get the compact layout on a 640 px stage", () => {
    for (const [w, h] of [[744, 1133], [768, 1024], [820, 1180], [1024, 1366]] as const) {
      assert.deepEqual(computeLayout(w, h), { mode: "compact", stageWidth: 640, rotatePrompt: false }, `${w}x${h}`);
    }
  });

  test("laptops, tablets on their side and big monitors keep the desktop stage", () => {
    for (const [w, h] of [[1024, 768], [1180, 820], [1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440], [3440, 1440]] as const) {
      assert.deepEqual(computeLayout(w, h), { mode: "desktop", stageWidth: 1920, rotatePrompt: false }, `${w}x${h}`);
    }
  });

  test("a phone on its side gets the rotate notice (and only a phone)", () => {
    for (const [w, h] of [[844, 390], [932, 430], [667, 375], [740, 360]] as const) {
      assert.equal(computeLayout(w, h).rotatePrompt, true, `${w}x${h}`);
    }
    for (const [w, h] of [[1180, 820], [1024, 768], [1366, 768], [1280, 500]] as const) {
      assert.equal(computeLayout(w, h).rotatePrompt, false, `${w}x${h}`);
    }
  });

  test("a very wide, short desktop window is still a desktop", () => {
    assert.equal(computeLayout(1440, 480).rotatePrompt, false);
  });

  test("a square-ish tablet window is desktop, not compact", () => {
    assert.equal(computeLayout(1100, 1100).mode, "desktop");
  });
});
