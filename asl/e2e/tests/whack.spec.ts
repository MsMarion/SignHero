import { test, expect, signedInHero, openWhack, startGame, waitForPlaying, currentTarget, scoreOf, hitsOf, waitForDetection, hitWithKeyboard, failCamera, finishGame, heading, SLOW } from "../support/helpers";
import { APP_URL } from "../support/env";

const LETTERS = "ABCDEFGHIKLMNOPQRSTUVWXY".split(""); // A-Y without J and Z (they need motion)

test.describe("Whack-A-Sign: lobby and start", () => {
  test("[W-01] the lobby explains the game and offers the start button", async ({ page }) => {
    await openWhack(page);
    await expect(page.getByRole("heading", { name: "WHACK-A-SIGN" })).toBeVisible();
    await expect(page.getByText("Reflex Lab")).toBeVisible();
    await expect(page.getByText("SHOW THE SIGN TO THE CAMERA OR CLICK TILES TO SCORE")).toBeVisible();
    // START says "STARTING CAMERA..." until the camera and hand tracking are ready (a few seconds, longer on a cold start).
    await expect(page.getByTestId("whack-start")).toHaveText("START CHALLENGE", { timeout: 60_000 * SLOW });
  });

  test("[W-02] starting counts down 3-2-1, then the timer runs from 0:30 and a target letter is shown", async ({ page }) => {
    await startGame(page);
    await expect(heading(page)).toHaveAttribute("data-state", "starting");
    await expect(page.getByText("GET READY...")).toBeVisible();
    await waitForPlaying(page);
    const target = await currentTarget(page);
    expect(LETTERS).toContain(target);
    await expect(page.getByTestId("whack-timer")).toHaveText(/^0:(30|29|28|27)$/);
    await expect.poll(async () => page.getByTestId("whack-timer").textContent(), { timeout: 5000 * SLOW }).not.toBe("0:30");
    await expect(page.getByTestId("whack-score")).toHaveText("0");
  });

  test("[W-03] a double click starts only one game session", async ({ page }) => {
    let creates = 0;
    await page.route("**/api/trpc/player.create*", async (route) => {
      creates += 1;
      await route.continue();
    });
    await openWhack(page);
    await page.getByTestId("whack-start").dblclick();
    await waitForPlaying(page);
    expect(creates).toBe(1);
  });

  test("[W-15] if the game session cannot be created the player is told and can try again", async ({ page }) => {
    await page.route("**/api/trpc/player.create*", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify([{ error: { json: { message: "boom", code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 } } } }]),
      }),
    );
    await openWhack(page);
    const dialog = page.waitForEvent("dialog");
    await page.getByTestId("whack-start").click();
    const d = await dialog;
    expect(d.message()).toContain("Failed to initialize game session");
    await d.accept();
    await expect(page.getByTestId("whack-start")).toBeVisible();
    await expect(page.getByTestId("whack-start")).toHaveText("START CHALLENGE");
  });
});

test.describe("Whack-A-Sign: camera readiness", () => {
  test("[W-22] if hand tracking cannot load the player is not stuck: START opens up and the game can be played", async ({ page }) => {
    test.skip(Boolean(process.env.CI), "CI builds replace hand tracking with simulated frames, so there is nothing to block");
    await page.route("**/mediapipe/hands/**", (route) => route.abort());
    await openWhack(page);
    await expect(page.getByTestId("whack-start")).toHaveText("START CHALLENGE", { timeout: 40_000 });
    await page.getByTestId("whack-start").click();
    await waitForPlaying(page);
  });
});

test.describe("Whack-A-Sign: scoring", () => {
  test("[W-04] pressing the target letter scores 500 to 1000 points and counts a hit", async ({ page, mock }) => {
    await startGame(page);
    await hitWithKeyboard(page);
    const score = await scoreOf(page);
    expect(score).toBeGreaterThanOrEqual(500);
    expect(score).toBeLessThanOrEqual(1000);
    expect(await hitsOf(page)).toBe(1);
    // after the short "NEXT ROUND..." pause there is a new target
    await expect(page.getByText("NEXT ROUND...")).toBeVisible();
    await waitForPlaying(page);
  });

  test("[W-05] pressing a different letter does nothing", async ({ page, mock }) => {
    await startGame(page);
    await waitForDetection(page);
    const target = await currentTarget(page);
    const wrong = LETTERS.find((l) => l !== target)!;
    await page.keyboard.press(wrong.toLowerCase());
    await page.waitForTimeout(800);
    expect(await hitsOf(page)).toBe(0);
    expect(await scoreOf(page)).toBe(0);
    await expect(heading(page)).toHaveAttribute("data-target", target);
  });

  test("[W-06] clicking the target tile scores", async ({ page }) => {
    await startGame(page);
    const target = await currentTarget(page);
    await page.getByTestId(`tile-${target}`).click();
    await expect.poll(() => hitsOf(page)).toBe(1);
    expect(await scoreOf(page)).toBeGreaterThanOrEqual(500);
  });

  test("[W-07] clicking a different tile does nothing", async ({ page }) => {
    await startGame(page);
    const target = await currentTarget(page);
    const wrong = LETTERS.find((l) => l !== target)!;
    await page.getByTestId(`tile-${wrong}`).click();
    await page.waitForTimeout(600);
    expect(await hitsOf(page)).toBe(0);
    await expect(heading(page)).toHaveAttribute("data-state", "playing");
  });

  test("[W-08] holding the right sign in front of the camera scores (400 ms at 50% confidence or more)", async ({ page, mock }) => {
    await startGame(page);
    await waitForDetection(page);
    const target = await currentTarget(page);
    await mock.control({ forceLetter: target });
    await expect.poll(() => hitsOf(page), { timeout: 10_000 * SLOW }).toBe(1);
    await expect(page.getByText("DETECTED", { exact: true })).toBeVisible();
  });

  test("[W-21] the wrong sign held in front of the camera does not score", async ({ page, mock }) => {
    await startGame(page);
    await waitForDetection(page);
    const target = await currentTarget(page);
    await mock.control({ forceLetter: LETTERS.find((l) => l !== target)! });
    await page.waitForTimeout(1800);
    expect(await hitsOf(page)).toBe(0);
  });
});

test.describe("Whack-A-Sign: camera and detection connection", () => {
  test("[W-09] with the camera and detection server working the page says LIVE, Connected and a latency", async ({ page, problems }) => {
    await startGame(page);
    await waitForPlaying(page);
    await expect(page.getByText("LIVE", { exact: true })).toBeVisible({ timeout: 20_000 * SLOW });
    await expect(page.getByText("Connected", { exact: true })).toBeVisible();
    await expect(page.getByTestId("whack-latency")).toHaveText(/^\d+ms$/);
    expect(problems, problems.join("\n")).toEqual([]);
  });

  test("[W-10] when the detection server goes away the page shows it, keyboard stops scoring, and play resumes when it returns", async ({ page, mock }) => {
    await startGame(page);
    await hitWithKeyboard(page);
    await waitForPlaying(page);
    await mock.control({ down: true });
    await expect(page.getByTestId("whack-latency")).toHaveText("OFFLINE", { timeout: 15_000 * SLOW });
    await expect(page.getByText("Reconnecting...")).toBeVisible();
    const before = await hitsOf(page);
    await page.keyboard.press((await currentTarget(page)).toLowerCase());
    await page.waitForTimeout(700);
    expect(await hitsOf(page)).toBe(before);
    await mock.control({ down: false });
    await waitForDetection(page);
    await expect(page.getByText("Reconnecting...")).toHaveCount(0);
    await hitWithKeyboard(page);
  });

  test("[W-11] a dropped connection reconnects by itself and the game carries on", async ({ page, mock }) => {
    await startGame(page);
    await waitForDetection(page);
    const first = Number((await mock.state()).connections);
    await mock.drop();
    await expect.poll(async () => Number((await mock.state()).connections), { timeout: 15_000 * SLOW }).toBeGreaterThan(first);
    await waitForDetection(page);
    await hitWithKeyboard(page);
  });

  test("[W-12] camera permission refused: a clear message, and the game can still be played with the keyboard", async ({ page }) => {
    await failCamera(page, "NotAllowedError");
    await startGame(page);
    await expect(page.getByText("Camera permission denied. Please allow camera access.")).toBeVisible();
    await hitWithKeyboard(page);
  });

  test("[W-13] no camera attached: a clear message", async ({ page }) => {
    await failCamera(page, "NotFoundError");
    await startGame(page);
    await expect(page.getByText("No camera found. Please connect a camera.")).toBeVisible();
  });

  test("[W-14] camera used by another program: a clear message", async ({ page }) => {
    await failCamera(page, "NotReadableError");
    await startGame(page);
    await expect(page.getByText("Camera is already in use by another application.")).toBeVisible();
  });

  test("[W-19] the page fetches a signed ticket and the detection server accepts it when tickets are required", async ({ page, mock }) => {
    await mock.control({ requireTicket: true });
    const ticketRequest = page.waitForRequest("**/api/detection-token");
    await startGame(page);
    await ticketRequest;
    await waitForDetection(page);
    const state = await mock.state();
    expect(Number(state.ticketsValid)).toBeGreaterThanOrEqual(1);
    await hitWithKeyboard(page);
  });

  test("[W-20] without a ticket the detection server refuses the page, which keeps trying and shows OFFLINE", async ({ page, mock }) => {
    await mock.control({ requireTicket: true });
    await page.route("**/api/detection-token", (route) => route.fulfill({ status: 500, body: "{}" }));
    await startGame(page);
    await waitForPlaying(page);
    await expect(page.getByTestId("whack-latency")).toHaveText("OFFLINE");
    await expect.poll(async () => Number((await mock.state()).rejected), { timeout: 15_000 * SLOW }).toBeGreaterThanOrEqual(2);
  });
});

test.describe("Whack-A-Sign: a whole game", () => {
  test.setTimeout(150_000 * SLOW);

  test("[W-16] a guest plays 30 seconds, the result is saved by the server and shown on the report", async ({ page, request, problems }) => {
    await startGame(page);
    await hitWithKeyboard(page);
    await waitForPlaying(page);
    await hitWithKeyboard(page);
    const score = await scoreOf(page);
    await expect(page.getByText("TIME'S UP!")).toBeVisible({ timeout: 60_000 * SLOW }).catch(() => undefined); // may already have redirected
    const playerId = await finishGame(page);

    await expect(page.getByRole("heading", { name: "GAME REPORT" })).toBeVisible();
    await expect(page.getByText("GUEST HERO")).toBeVisible();
    await expect(page.getByText(score.toLocaleString(), { exact: true })).toBeVisible();
    const player = await (await request.get(`${APP_URL}/api/trpc/player.getById?input=${encodeURIComponent(JSON.stringify({ json: { id: playerId } }))}`)).json();
    const data = player.result.data.json;
    expect(data.score).toBe(score);
    expect(data.correctHits).toBe(2);
    expect(data.finalizedAt).toBeTruthy();
    expect(data).not.toHaveProperty("ipKey");
    expect(problems, problems.join("\n")).toEqual([]);
  });

  test("[W-17] a signed-in player plays under their hero name and appears on the leaderboard as a member", async ({ page, ip }) => {
    const { heroName } = await signedInHero(page, ip);
    await startGame(page);
    await hitWithKeyboard(page);
    const playerId = await finishGame(page);
    await expect(page.getByText(heroName.toUpperCase()).first()).toBeVisible();
    await page.getByRole("button", { name: "LEADERBOARD" }).click();
    const row = page.getByText(heroName.toUpperCase()).first();
    await expect(row).toBeVisible();
    await expect(row.locator("xpath=ancestor::*[contains(@class,'grid')][1]").getByText("guest", { exact: false })).toHaveCount(0);
    expect(playerId).toMatch(/^[0-9a-f]{24}$/);
  });

  test("[W-18] if saving the result fails the player still reaches the leaderboard (with an empty report)", async ({ page }) => {
    await page.route("**/api/trpc/player.updateFinalStats*", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify([{ error: { json: { message: "boom", code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 } } } }]),
      }),
    );
    await startGame(page);
    await finishGame(page);
    await expect(page.getByRole("heading", { name: "GAME REPORT" })).toBeVisible();
    await expect(page.getByText("NO ATTEMPTS RECORDED")).toBeVisible();
  });
});
