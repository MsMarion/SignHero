import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createLogger, parseLevel, sanitize, type LogLevel } from "../../src/server/log";
import { detectionHealthUrl, summarize, withTimeout } from "../../src/server/health";
import { parseClientError, sameOrigin } from "../../src/server/client-error";
import { isObjectId } from "../../src/server/ids";
import { debugGet, debugInc, debugSet } from "../../src/lib/debug";

describe("structured logger", () => {
  const collect = (level: LogLevel) => {
    const lines: { line: string; level: LogLevel }[] = [];
    const logger = createLogger({
      level,
      sink: (line, l) => lines.push({ line, level: l }),
      now: () => new Date("2026-01-02T03:04:05.000Z"),
    });
    return { lines, logger };
  };

  test("writes one JSON object per line with time, level, message and fields", () => {
    const { lines, logger } = collect("info");
    logger.info("hello", { path: "player.create", ms: 12 });
    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0]!.line), {
      ts: "2026-01-02T03:04:05.000Z",
      level: "info",
      msg: "hello",
      path: "player.create",
      ms: 12,
    });
  });

  test("drops anything below the configured level", () => {
    const { lines, logger } = collect("warn");
    logger.debug("a");
    logger.info("b");
    logger.warn("c");
    logger.error("d");
    assert.deepEqual(lines.map((l) => l.level), ["warn", "error"]);
  });

  test("turns errors into plain objects and cuts long strings", () => {
    const { lines, logger } = collect("debug");
    logger.error("boom", { err: new Error("bad thing"), long: "x".repeat(2000) });
    const out = JSON.parse(lines[0]!.line);
    assert.equal(out.err.message, "bad thing");
    assert.ok(out.long.length <= 501);
    assert.equal(sanitize(null), null);
  });

  test("an unknown LOG_LEVEL falls back", () => {
    assert.equal(parseLevel("loud", "info"), "info");
    assert.equal(parseLevel("debug", "info"), "debug");
    assert.equal(parseLevel(undefined, "warn"), "warn");
  });
});

describe("health helpers", () => {
  test("summarize is ok only when every check is ok", () => {
    assert.equal(summarize({ database: { ok: true, ms: 1 } }), "ok");
    assert.equal(summarize({ database: { ok: true, ms: 1 }, detection: { ok: false, ms: 2 } }), "down");
  });

  test("derives the detection status URL from the websocket URL", () => {
    assert.equal(detectionHealthUrl("wss://aslapi.dawnbalaschak.com/ws/predict"), "https://aslapi.dawnbalaschak.com/concurrency_status");
    assert.equal(detectionHealthUrl("ws://localhost:4001/ws/predict?token=x"), "http://localhost:4001/concurrency_status");
    assert.equal(detectionHealthUrl(undefined), null);
    assert.equal(detectionHealthUrl("not a url"), null);
  });

  test("withTimeout passes results through and rejects slow work", async () => {
    assert.equal(await withTimeout(Promise.resolve(7), 50, "fast"), 7);
    await assert.rejects(withTimeout(new Promise(() => undefined), 20, "slow thing"), /slow thing timed out after 20 ms/);
  });
});

describe("client error reports", () => {
  test("accepts a normal report and trims it", () => {
    const r = parseClientError(JSON.stringify({ kind: "render", message: "x".repeat(900), stack: "s", url: "/whack", build: "abc" }));
    assert.equal(r?.kind, "render");
    assert.equal(r?.message.length, 500);
    assert.equal(r?.url, "/whack");
  });

  test("an unknown kind becomes a plain error; junk is refused", () => {
    assert.equal(parseClientError(JSON.stringify({ kind: "weird", message: "m" }))?.kind, "error");
    for (const bad of ["", "not json", "[]", "null", JSON.stringify({ message: "" }), JSON.stringify({ kind: "error" }), JSON.stringify({ message: 5 })]) {
      assert.equal(parseClientError(bad), null, bad);
    }
  });

  test("only same-site posts are accepted", () => {
    assert.ok(sameOrigin("https://asl.dawnbalaschak.com", "asl.dawnbalaschak.com"));
    assert.ok(sameOrigin("http://localhost:4000", "localhost:4000"));
    assert.ok(sameOrigin(null, "asl.dawnbalaschak.com"));
    assert.equal(sameOrigin("https://evil.example", "asl.dawnbalaschak.com"), false);
    assert.equal(sameOrigin("garbage", "asl.dawnbalaschak.com"), false);
  });
});

describe("ids", () => {
  test("only 24 hex characters are object ids", () => {
    assert.ok(isObjectId("6ad4506f9304ed809c5d96ca"));
    for (const bad of ["", "abc", "6ad4506f9304ed809c5d96c", "6ad4506f9304ed809c5d96cag", "../../etc/passwd"]) assert.equal(isObjectId(bad), false);
  });
});

describe("debug store", () => {
  test("records facts and counters on window.__signheroDebug", () => {
    const g = globalThis as unknown as { window?: { __signheroDebug?: Record<string, unknown> } };
    g.window = {};
    debugSet({ ws: "connected" });
    debugInc("sends");
    debugInc("sends", 2);
    assert.deepEqual(debugGet(), { ws: "connected", sends: 3 });
    delete g.window;
  });
});
