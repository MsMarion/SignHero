import {
  test,
  expect,
  SLOW,
  startGame,
  openWhack,
  waitForPlaying,
  currentTarget,
  hitsOf,
  failCamera,
  finishGame,
  heading,
} from "../support/helpers";
import { APP_URL } from "../support/env";

// The phone layout (under 640 px wide): the same site, narrowed. Camera on top, the sign to show in the middle,
// no letter grid, and a tap-on-the-sign fallback that makes the game a practice game (not ranked).
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

const within = async (page: import("@playwright/test").Page, testId: string) => {
  const box = await page.getByTestId(testId).boundingBox();
  expect(box, `${testId} is on screen`).not.toBeNull();
  const vp = page.viewportSize()!;
  expect(box!.x, `${testId} left edge`).toBeGreaterThanOrEqual(-1);
  expect(box!.y, `${testId} top edge`).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width, `${testId} right edge`).toBeLessThanOrEqual(vp.width + 1);
  expect(box!.y + box!.height, `${testId} bottom edge`).toBeLessThanOrEqual(vp.height + 1);
};

test.describe("phone layout", () => {
  test("[F-01] the header fits on one row and the lobby fits the screen", async ({ page }) => {
    await openWhack(page);
    const vp = page.viewportSize()!;
    const header = await page.locator("header").first().boundingBox();
    expect(header!.x + header!.width).toBeLessThanOrEqual(vp.width + 1);
    expect(header!.height).toBeLessThan(120); // one row, not wrapped
    await within(page, "whack-start");
    await expect(page.getByText("PROP YOUR PHONE UP SO YOUR HAND FITS IN THE CAMERA")).toBeVisible();
    await expect(page.getByTestId("navbar")).toBeHidden(); // the desktop tab arch is not shown on a phone
  });

  test("[F-02] START waits until the camera and hand tracking are ready, then becomes available", async ({ page }) => {
    await openWhack(page);
    await expect(page.getByTestId("whack-start")).toHaveText("START CHALLENGE", { timeout: 60_000 });
    await expect(page.getByTestId("whack-start")).toBeEnabled();
  });

  test("[F-03] in play: the sign to show and the camera are on screen, and there is no letter grid", async ({ page }) => {
    await startGame(page);
    const target = await currentTarget(page);
    await expect(heading(page)).toContainText("SHOW");
    await expect(page.getByTestId("phone-target-sign")).toBeVisible();
    await expect(page.getByTestId(`tile-${target}`)).toHaveCount(0);
    for (const id of ["whack-timer", "whack-score", "whack-hits", "phone-target-sign", "whack-latency"]) await within(page, id);
    await expect(page.locator("video")).toBeVisible();
  });

  test("[F-04] holding the right sign to the camera scores and is ranked (no practice note)", async ({ page, mock }) => {
    await startGame(page);
    const target = await currentTarget(page);
    await mock.control({ forceLetter: target });
    await expect.poll(() => hitsOf(page), { timeout: 10_000 * SLOW }).toBe(1);
    await expect(page.getByTestId("phone-practice-chip")).toHaveCount(0);
  });

  test("[F-05] with the camera refused the player is told and can still start (practice by tapping)", async ({ page }) => {
    await failCamera(page, "NotAllowedError");
    await openWhack(page);
    await expect(page.getByTestId("whack-camera-note")).toContainText("PRACTICE");
    await expect(page.getByTestId("whack-start")).toBeEnabled();
    await page.getByTestId("whack-start").click();
    await waitForPlaying(page);
    await expect(page.getByText("Camera permission denied. Please allow camera access.")).toBeVisible();
  });

  test("[F-06] tapping the sign scores as practice, and a practice game is kept off the leaderboard", async ({ page, request }) => {
    test.setTimeout(150_000 * SLOW);
    await startGame(page);
    await waitForPlaying(page);
    await page.getByTestId("phone-target-sign").tap();
    await expect.poll(() => hitsOf(page)).toBe(1);
    await expect(page.getByTestId("phone-practice-chip")).toBeVisible();
    const playerId = await finishGame(page);
    await expect(page.getByTestId("practice-note")).toContainText("NOT ON THE LEADERBOARD");

    const res = await request.get(`${APP_URL}/api/trpc/leaderboard.getTop?input=${encodeURIComponent(JSON.stringify({ json: { limit: 100 } }))}`);
    const entries = (await res.json()).result.data.json as { playerId?: string }[];
    expect(entries.some((e) => e.playerId === playerId)).toBe(false);
    const player = await (await request.get(`${APP_URL}/api/trpc/player.getById?input=${encodeURIComponent(JSON.stringify({ json: { id: playerId } }))}`)).json();
    expect(player.result.data.json).toMatchObject({ practice: true, correctHits: 1 });
  });

  test("[F-07] the account and result pages sit below the compact header", async ({ page }) => {
    for (const path of ["/auth/signin", "/leaderboard"]) {
      await page.goto(path);
      const header = await page.locator("header").first().boundingBox();
      const heading = page.getByRole("heading").first();
      await expect(heading).toBeVisible();
      const h = await heading.boundingBox();
      expect(h!.y, `${path}: first heading is below the header`).toBeGreaterThanOrEqual(header!.y + header!.height - 4);
      expect(h!.x + h!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    }
  });
});
