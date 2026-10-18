import { test, expect, SLOW } from "../support/helpers";
import { SEED } from "../support/seed-ids";

// The report card drifts with the mouse (a decorative parallax animation), so Playwright's "element is stable"
// check can fail forever on a slow machine. Forcing the click is not enough (it lands where the card was a moment ago), so the clicks below
// are dispatched straight to the element; what they do is still asserted.

// The planted rows (e2e/seed.ts): four leaderboard entries scoring 99000-96000, and four finished games.

test.describe("leaderboard", () => {
  test("[L-01] without a game it shows the top scores, best first, with medals and a guest tag for non-members", async ({ page }) => {
    await page.goto("/leaderboard");
    await expect(page.getByRole("heading", { name: "LEADERBOARD" })).toBeVisible();
    await expect(page.getByRole("button", { name: "REPORT" })).toHaveCount(0);
    const rows = page.locator("div.grid.grid-cols-3").filter({ hasText: /E2E/ });
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText(SEED.seededUserName);
    await expect(rows.nth(0)).toContainText("99,000");
    await expect(rows.nth(0)).toContainText("🥇");
    await expect(rows.nth(1)).toContainText("E2E BRAVO");
    await expect(rows.nth(1)).toContainText("🥈");
    await expect(rows.nth(2)).toContainText("🥉");
    await expect(rows.nth(0)).not.toContainText(/guest/i); // a signed-in member
    await expect(rows.nth(1)).toContainText(/guest/i);
  });

  test("[L-02] with a game id it opens that game's report: score, accuracy, reaction time, mistakes", async ({ page }) => {
    await page.goto(`/leaderboard?playerId=${SEED.reportPlayer}`);
    await expect(page.getByRole("heading", { name: "GAME REPORT" })).toBeVisible();
    await expect(page.getByText("E2E REPORT")).toBeVisible();
    const tile = (label: string) => page.getByText(label, { exact: true }).locator("xpath=following-sibling::div[1]");
    await expect(tile("SCORE")).toHaveText("9,600");
    await expect(tile("ACCURACY")).toHaveText("80.0%"); // 12 of 15
    await expect(tile("AVG REACTION")).toHaveText("850ms");
    await expect(tile("MISTAKES")).toHaveText("3");
  });

  test("[L-03] REPORT and LEADERBOARD switch the view", async ({ page }) => {
    await page.goto(`/leaderboard?playerId=${SEED.reportPlayer}`);
    await page.getByRole("button", { name: "LEADERBOARD" }).dispatchEvent("click");
    await expect(page.getByRole("heading", { name: "LEADERBOARD" })).toBeVisible();
    await expect(page.getByText("E2E BRAVO")).toBeVisible();
    await page.getByRole("button", { name: "REPORT" }).dispatchEvent("click");
    await expect(page.getByRole("heading", { name: "GAME REPORT" })).toBeVisible();
  });

  test("[L-04] a game with no attempts says so", async ({ page }) => {
    await page.goto(`/leaderboard?playerId=${SEED.emptyPlayer}`);
    await expect(page.getByText("NO ATTEMPTS RECORDED")).toBeVisible();
  });

  test("[L-05] a game with hits and no mistakes says flawless", async ({ page }) => {
    await page.goto(`/leaderboard?playerId=${SEED.flawlessPlayer}`);
    await expect(page.getByText("NO MISTAKES - FLAWLESS GAME!")).toBeVisible();
  });

  test("[L-06] common mistakes are listed with what was shown, what was expected and how often", async ({ page }) => {
    await page.goto(`/leaderboard?playerId=${SEED.mistakesPlayer}`);
    await expect(page.getByText("SHOWED").first()).toBeVisible();
    await expect(page.getByText("EXPECTED").first()).toBeVisible();
    await expect(page.getByText("3×")).toBeVisible();
    await expect(page.getByText("1×")).toBeVisible();
  });

  for (const [label, id] of [
    ["a made-up word", "not-a-real-id"],
    ["an id that matches nothing", "6affffffffffffffffffffff"],
  ]) {
    test(`[L-07] ${label} as the game id shows "report not found" and a way to the leaderboard`, async ({ page }) => {
      await page.goto(`/leaderboard?playerId=${id}`);
      await expect(page.getByText("REPORT DATA NOT FOUND")).toBeVisible();
      await page.getByRole("button", { name: "VIEW GLOBAL LEADERBOARD" }).dispatchEvent("click");
      await expect(page.getByRole("heading", { name: "LEADERBOARD" })).toBeVisible();
      await expect(page.getByText("E2E BRAVO")).toBeVisible();
    });
  }

  test("[L-08] the home button goes to the game when you came from one, and to the home page otherwise", async ({ page }) => {
    await page.goto("/leaderboard");
    await expect(page.getByLabel("Back to Home")).toHaveAttribute("href", "/");
    await page.goto(`/leaderboard?playerId=${SEED.reportPlayer}`);
    await expect(page.getByLabel("Back to Whack-a-Sign")).toHaveAttribute("href", "/whack");
    await page.getByLabel("Back to Whack-a-Sign").dispatchEvent("click");
    await expect(page).toHaveURL(/\/whack/);
  });

  test("[L-09] while scores load it says LOADING, and if they cannot load it says so and can retry", async ({ page }) => {
    let fail = true;
    await page.route("**/api/trpc/leaderboard.getTop*", async (route) => {
      await new Promise((r) => setTimeout(r, 700));
      if (!fail) return route.continue();
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify([{ error: { json: { message: "boom", code: -32603, data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 } } } }]),
      });
    });
    await page.goto("/leaderboard");
    await expect(page.getByText("LOADING...")).toBeVisible();
    await expect(page.getByTestId("leaderboard-error")).toBeVisible({ timeout: 20_000 * SLOW });
    fail = false;
    await page.getByRole("button", { name: "RETRY" }).dispatchEvent("click");
    await expect(page.getByText("E2E BRAVO")).toBeVisible({ timeout: 20_000 * SLOW });
  });
});
