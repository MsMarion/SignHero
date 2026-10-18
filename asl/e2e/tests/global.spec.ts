import { test, expect, signedInHero, registerViaApi, signIn, uniqueEmail, openWhack, startGame } from "../support/helpers";

// Chrome that appears on every page (header, navbar, titles, 404) and the home page.

test.describe("header", () => {
  test("[G-01] the logo takes you home", async ({ page }) => {
    await page.goto("/leaderboard");
    await page.locator('header a[href="/"]').first().click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "SignHero" })).toBeVisible();
  });

  for (const [id, label, key] of [
    ["G-02", "Toggle Music", "signhero_music_muted"],
    ["G-03", "Toggle SFX", "signhero_sfx_muted"],
  ] as const) {
    test(`[${id}] the ${label} button flips the setting and remembers it after a reload`, async ({ page }) => {
      await page.goto("/leaderboard");
      const read = () => page.evaluate((k) => localStorage.getItem(k), key);
      const before = await read();
      await page.getByLabel(label).click();
      const after = await read();
      expect(after).not.toBe(before);
      await page.reload();
      expect(await read()).toBe(after);
      await page.getByLabel(label).click();
      expect(await read()).toBe(before ?? "false");
    });
  }

  test("[G-04] a guest sees LOGIN, which opens the sign-in page", async ({ page }) => {
    await page.goto("/leaderboard");
    await page.locator("header").getByText("LOGIN").click();
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test("[G-05] a signed-in player's name opens the profile", async ({ page, ip }) => {
    await signedInHero(page, ip);
    await page.goto("/leaderboard");
    await expect(page.locator("header").getByText("LOGIN")).toHaveCount(0);
    await page.locator('header a[href="/profile"]').click();
    await expect(page).toHaveURL(/\/profile/);
  });

  test("[G-06] sign out returns the header to LOGIN", async ({ page, ip }) => {
    await signedInHero(page, ip);
    await page.goto("/leaderboard");
    await page.getByTitle("Sign Out").click();
    await expect(page.locator("header").getByText("LOGIN")).toBeVisible();
  });

  test("[G-07] there is no made-up level or XP badge", async ({ page }) => {
    for (const path of ["/whack", "/leaderboard", "/auth/signin"]) {
      await page.goto(path);
      await expect(page.getByText("14,250 XP")).toHaveCount(0);
      await expect(page.getByText("MASTER", { exact: true })).toHaveCount(0);
    }
  });
});

test.describe("navbar", () => {
  test("[G-08] previous and next move between Whack-A-Sign, official songs and community", async ({ page }) => {
    await openWhack(page);
    await page.getByLabel("Next route").click();
    await expect(page).toHaveURL(/\/songselection/);
    await page.getByLabel("Next route").click();
    await expect(page).toHaveURL(/\/community/);
    await page.getByLabel("Next route").click();
    await expect(page).toHaveURL(/\/whack/);
    await page.getByLabel("Previous route").click();
    await expect(page).toHaveURL(/\/community/);
  });

  test("[G-09] the navbar slides away while a game is running", async ({ page }) => {
    await openWhack(page);
    await expect(page.getByTestId("navbar")).toHaveAttribute("data-hidden", "false");
    await page.getByTestId("whack-start").click();
    await expect(page.getByTestId("navbar")).toHaveAttribute("data-hidden", "true");
  });

  test("[G-13] the development tab is not offered in production", async ({ page }) => {
    await openWhack(page);
    await expect(page.getByText("DEV MODE")).toHaveCount(0);
  });
});

test.describe("every page", () => {
  test("[G-10] an unknown address shows the not-found page, with a way back", async ({ page }) => {
    const response = await page.goto("/definitely/not/a/page");
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId("not-found")).toBeVisible();
    await page.getByRole("link", { name: "PLAY WHACK-A-SIGN" }).click();
    await expect(page).toHaveURL(/\/whack/);
  });

  test("[G-11] a signed-in player without a hero name is sent to choose one, wherever they go", async ({ page, ip }) => {
    const email = uniqueEmail("gate");
    await registerViaApi(page.request, email, ip);
    await signIn(page, email);
    await page.waitForURL("**/auth/hero-name");
    for (const path of ["/whack", "/leaderboard", "/profile", "/songselection"]) {
      await page.goto(path);
      await page.waitForURL("**/auth/hero-name");
    }
  });

  for (const [path, title] of [
    ["/", "SignHero"],
    ["/whack", "Whack-A-Sign | SignHero"],
    ["/leaderboard", "Leaderboard | SignHero"],
    ["/auth/signin", "Sign In | SignHero"],
  ] as const) {
    test(`[G-12] ${path} has the title "${title}"`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveTitle(title);
    });
  }
});

test.describe("home page", () => {
  test("[H-01] shows the name, the tagline and the start button", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "SignHero" })).toBeVisible();
    await expect(page.getByText("Master American Sign Language through interactive rhythm games")).toBeVisible();
    await expect(page.getByRole("button", { name: /START GAME/ })).toBeVisible();
  });

  test("[H-02] START GAME opens the game that works without songs", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /START GAME/ }).click();
    await expect(page).toHaveURL(/\/whack/);
    await expect(page.getByTestId("whack-start")).toBeVisible();
  });
});
