import { test, expect, startGame, waitForDetection, SLOW } from "../support/helpers";
import { APP_URL } from "../support/env";

// Routes that must not exist in production, and the health, error-reporting and debugging tools.

test.describe("closed in production", () => {
  test("[D-01] the song import tool page is a 404", async ({ page }) => {
    const response = await page.goto("/devmode");
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId("not-found")).toBeVisible();
  });

  test("[D-02] the song import and upload APIs answer 404 to everything", async ({ request, ip }) => {
    const headers = { "cf-connecting-ip": ip };
    for (const path of ["/api/youtube", "/api/transcribe", "/api/upload", "/api/songs"]) {
      for (const method of ["GET", "POST", "DELETE"] as const) {
        const res = await request.fetch(`${APP_URL}${path}`, { method, headers });
        expect([404, 405], `${method} ${path} -> ${res.status()}`).toContain(res.status());
        if (method !== "DELETE" && res.status() === 404) expect(await res.json()).toEqual({ error: "Not found" });
      }
    }
    expect((await request.post(`${APP_URL}/api/youtube`, { headers, data: { url: "https://youtu.be/dQw4w9WgXcQ" } })).status()).toBe(404);
  });

  for (const path of ["/preview", "/effects-demo", "/scripted-demo"]) {
    test(`[D-03] the internal demo page ${path} is a 404`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
    });
  }

  test("[D-04] the old duplicate game address goes to the real game", async ({ page }) => {
    await page.goto("/game/training");
    await expect(page).toHaveURL(/\/whack$/);
  });

  test("[D-05] nobody can create a song through the API", async ({ request, ip }) => {
    const res = await request.post(`${APP_URL}/api/trpc/song.create?batch=1`, {
      headers: { "cf-connecting-ip": ip },
      data: { 0: { json: { songName: "x", albumName: "x", thumbnailName: "x", thumbnailUrl: "/x.png", audioUrl: "/x.mp3", interactions: [] } } },
    });
    expect(res.status()).toBe(401);
  });

  test("[D-06] the old direct score and mistake APIs are gone", async ({ request, ip }) => {
    for (const proc of ["leaderboard.upsert", "player.addMistake"]) {
      const res = await request.post(`${APP_URL}/api/trpc/${proc}?batch=1`, { headers: { "cf-connecting-ip": ip }, data: { 0: { json: {} } } });
      expect(res.status(), proc).toBe(404);
    }
  });
});

test.describe("media files", () => {
  for (const path of ["/api/media/private/x.txt", "/api/media/audio/..%2F..%2Fetc%2Fpasswd", "/api/media/audio", "/api/media/audio/.hidden"]) {
    test(`[M-01] ${path} is not served`, async ({ request }) => {
      const res = await request.get(`${APP_URL}${path}`);
      expect(res.status()).toBe(404);
    });
  }

  test("[M-02] only reading is allowed", async ({ request }) => {
    const res = await request.post(`${APP_URL}/api/media/audio/x.mp3`);
    expect(res.status()).toBe(405);
  });
});

test.describe("health", () => {
  test("[O-01] /api/health reports the database, the running version and uptime", async ({ request, ip }) => {
    const res = await request.get(`${APP_URL}/api/health`, { headers: { "cf-connecting-ip": ip } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks.database.ok).toBe(true);
    expect(body.version).toMatch(/^[0-9a-f]{12}$|^unknown$/);
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(body.checks.detection).toBeUndefined();
    expect(res.headers()["cache-control"]).toContain("no-store");
  });

  test("[O-02] ?deep=1 also checks the detection server", async ({ request, ip, mock }) => {
    const res = await request.get(`${APP_URL}/api/health?deep=1`, { headers: { "cf-connecting-ip": ip } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.checks.detection).toMatchObject({ ok: true, device: "cuda" });
  });

  test("[O-03] when the detection server is down the deep check says so with a 503", async ({ request, ip, mock }) => {
    await mock.control({ down: true });
    const res = await request.get(`${APP_URL}/api/health?deep=1`, { headers: { "cf-connecting-ip": ip } });
    expect(res.status()).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("down");
    expect(body.checks.database.ok).toBe(true);
    expect(body.checks.detection.ok).toBe(false);
    expect((await request.get(`${APP_URL}/api/health`, { headers: { "cf-connecting-ip": ip } })).status()).toBe(200);
  });

  test("[O-04] health checks are rate limited", async ({ request, ip }) => {
    const statuses: number[] = [];
    for (let i = 0; i < 32; i++) statuses.push((await request.get(`${APP_URL}/api/health`, { headers: { "cf-connecting-ip": ip } })).status());
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(30)).toContain(429);
  });
});

test.describe("browser error reports", () => {
  test("[O-05] the report endpoint accepts a real report, and refuses foreign sites, junk and oversized bodies", async ({ request, ip }) => {
    const headers = { "cf-connecting-ip": ip, "content-type": "application/json" };
    const url = `${APP_URL}/api/client-error`;
    expect((await request.post(url, { headers, data: { kind: "error", message: "e2e report", url: "/whack" } })).status()).toBe(204);
    expect((await request.post(url, { headers: { ...headers, origin: "https://evil.example" }, data: { message: "x" } })).status()).toBe(403);
    expect((await request.post(url, { headers, data: "not json" })).status()).toBe(400);
    expect((await request.post(url, { headers, data: { message: "" } })).status()).toBe(400);
    expect((await request.post(url, { headers, data: { message: "x".repeat(20_000) } })).status()).toBe(413);
  });

  test("[O-06] an uncaught error on a page is sent to the server, once", async ({ page }) => {
    const reports: string[] = [];
    page.on("request", (r) => {
      if (r.url().endsWith("/api/client-error")) reports.push(r.postData() ?? "");
    });
    await page.goto("/leaderboard");
    for (let i = 0; i < 3; i++) await page.evaluate(() => setTimeout(() => { throw new Error("e2e uncaught boom"); }, 0));
    await expect.poll(() => reports.length).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(500);
    expect(reports.length).toBe(1); // the same message is only reported once per page view
    expect(JSON.parse(reports[0]!)).toMatchObject({ kind: "error", message: expect.stringContaining("e2e uncaught boom"), url: "/leaderboard" });
  });

  test("[O-07] an unhandled promise rejection is reported too", async ({ page }) => {
    const reports: string[] = [];
    page.on("request", (r) => {
      if (r.url().endsWith("/api/client-error")) reports.push(r.postData() ?? "");
    });
    await page.goto("/leaderboard");
    await page.evaluate(() => { void Promise.reject(new Error("e2e rejected promise")); });
    await expect.poll(() => reports.length).toBe(1);
    expect(JSON.parse(reports[0]!)).toMatchObject({ kind: "unhandledrejection" });
  });
});

test.describe("debug panel", () => {
  test("[O-08] it is off by default", async ({ page }) => {
    await page.goto("/leaderboard");
    await expect(page.getByTestId("debug-panel")).toHaveCount(0);
  });

  test("[O-09] ?debug=1 shows it with the build, the session state and the detection connection, and it is remembered", async ({ page, mock }) => {
    test.setTimeout(150_000 * SLOW); // hand tracking takes a while to start on a slow machine
    await page.goto("/whack?debug=1");
    const panel = page.getByTestId("debug-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-debug="session"]')).toHaveText("unauthenticated");
    await expect(panel.locator('[data-debug="build"]')).not.toHaveText("");
    await page.getByTestId("whack-start").click();
    await waitForDetection(page);
    await expect(panel.locator('[data-debug="detection"]')).toHaveText("connected");
    await expect(panel.locator('[data-debug="ticket"]')).toHaveText("yes");
    await expect.poll(async () => Number((await panel.locator('[data-debug="sockets opened"]').textContent()) ?? 0)).toBeGreaterThanOrEqual(1);
    await expect(panel.locator('[data-debug="frames sent / replies"]')).toHaveText(/^[1-9]\d* \/ \d+$/, { timeout: 90_000 * SLOW });
    // the page reconnects within a fraction of a second, so look at the count of sockets it has opened instead of
    // trying to catch the brief "disconnected" state
    await mock.drop();
    await expect.poll(async () => Number((await panel.locator('[data-debug="sockets opened"]').textContent()) ?? 0), { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
    await expect(panel.locator('[data-debug="detection"]')).toHaveText("connected", { timeout: 60_000 });
    await page.goto("/leaderboard"); // remembered across pages
    await expect(page.getByTestId("debug-panel")).toBeVisible();
    await page.goto("/leaderboard?debug=0");
    await expect(page.getByTestId("debug-panel")).toHaveCount(0);
  });

  test("[O-10] Ctrl+Shift+D toggles it and the close button hides it", async ({ page }) => {
    await page.goto("/leaderboard");
    await page.keyboard.press("Control+Shift+D");
    await expect(page.getByTestId("debug-panel")).toBeVisible();
    await page.keyboard.press("Control+Shift+D");
    await expect(page.getByTestId("debug-panel")).toHaveCount(0);
    await page.keyboard.press("Control+Shift+D");
    await page.getByLabel("Close debug panel").click();
    await expect(page.getByTestId("debug-panel")).toHaveCount(0);
  });

  test("[O-11] the debug panel counts errors that were reported", async ({ page }) => {
    await page.goto("/leaderboard?debug=1");
    await page.evaluate(() => setTimeout(() => { throw new Error("e2e counted error"); }, 0));
    await expect(page.getByTestId("debug-panel").locator('[data-debug="errors reported"]')).toHaveText("1");
    await page.goto("/leaderboard?debug=0");
  });
});

test.describe("detection tickets", () => {
  test("[T-01] the ticket endpoint issues a short-lived signed ticket that the detection server accepts", async ({ request, ip, mock }) => {
    const res = await request.get(`${APP_URL}/api/detection-token`, { headers: { "cf-connecting-ip": ip } });
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toContain("no-store");
    const { token } = await res.json();
    expect(token).toMatch(/^\d{10}\.[0-9a-f]{16}\.[0-9a-f]{64}$/);
    const expires = Number(token.split(".")[0]);
    expect(expires * 1000 - Date.now()).toBeLessThanOrEqual(61_000);
    expect(expires * 1000 - Date.now()).toBeGreaterThan(30_000);
  });

  test("[T-02] tickets are rate limited per address", async ({ request, ip }) => {
    const statuses: number[] = [];
    for (let i = 0; i < 62; i++) statuses.push((await request.get(`${APP_URL}/api/detection-token`, { headers: { "cf-connecting-ip": ip } })).status());
    expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(60)).toContain(429);
  });

  test("[T-03] the page does not need a ticket when the server does not require one, and still plays", async ({ page, mock }) => {
    await page.route("**/api/detection-token", (route) => route.fulfill({ status: 500, body: "{}" }));
    await startGame(page);
    await waitForDetection(page);
  });
});
