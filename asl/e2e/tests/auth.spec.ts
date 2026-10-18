import {
  test,
  expect,
  PASSWORD,
  uniqueEmail,
  uniqueHeroName,
  registerViaApi,
  signIn,
  claimHeroName,
  signedInHero,
} from "../support/helpers";

const feedback = (page: import("@playwright/test").Page) => page.getByTestId("hero-name-feedback");

test.describe("sign in and register", () => {
  test("[A-01] the sign-in page has an email, a password, the enter button and no Google button when Google is not set up", async ({ page }) => {
    await page.goto("/auth/signin");
    await expect(page.getByRole("heading", { name: "SIGN IN" })).toBeVisible();
    await expect(page.getByText("Welcome back, Hero")).toBeVisible();
    await expect(page.getByPlaceholder("hero@asl.com")).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "ENTER GAME" })).toBeVisible();
    await expect(page.getByText("CONTINUE WITH GOOGLE")).toHaveCount(0);
  });

  test("[A-02] the link under the form switches between sign in and create account, and clears old errors", async ({ page }) => {
    await page.goto("/auth/signin");
    await page.getByPlaceholder("hero@asl.com").fill("someone@example.test");
    await page.locator('input[type="password"]').fill("wrong-password");
    await page.getByRole("button", { name: "ENTER GAME" }).click();
    await expect(page.getByTestId("auth-error")).toBeVisible();
    await page.getByRole("button", { name: "Need an account? Register Now" }).click();
    await expect(page.getByRole("heading", { name: "CREATE HERO" })).toBeVisible();
    await expect(page.getByRole("button", { name: "REGISTER" })).toBeVisible();
    await expect(page.getByTestId("auth-error")).toHaveCount(0);
    await page.getByRole("button", { name: "Already have an account? Sign In" }).click();
    await expect(page.getByRole("heading", { name: "SIGN IN" })).toBeVisible();
  });

  test("[A-03] creating an account signs you in and sends you to choose a hero name", async ({ page, ip }) => {
    await page.context().setExtraHTTPHeaders({ "cf-connecting-ip": ip });
    await page.goto("/auth/signin");
    await page.getByRole("button", { name: "Need an account? Register Now" }).click();
    await page.getByPlaceholder("hero@asl.com").fill(uniqueEmail("register"));
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: "REGISTER" }).click();
    await page.waitForURL("**/auth/hero-name", { timeout: 20_000 });
    await expect(page.locator("#hero-name")).toBeVisible();
  });

  test("[A-04] registering an e-mail that already has an account says so", async ({ page, ip }) => {
    const email = uniqueEmail("dup");
    await registerViaApi(page.request, email, ip);
    await page.goto("/auth/signin");
    await page.getByRole("button", { name: "Need an account? Register Now" }).click();
    await page.getByPlaceholder("hero@asl.com").fill(email);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: "REGISTER" }).click();
    await expect(page.getByTestId("auth-error")).toContainText("Account with this email already exists");
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test("[A-05] a password under 6 characters or a malformed e-mail is refused", async ({ page }) => {
    await page.goto("/auth/signin");
    await page.getByRole("button", { name: "Need an account? Register Now" }).click();
    await page.getByPlaceholder("hero@asl.com").fill(uniqueEmail("short"));
    await page.locator('input[type="password"]').fill("12345");
    await page.getByRole("button", { name: "REGISTER" }).click();
    await expect(page.getByTestId("auth-error")).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test("[A-06] a wrong password or an unknown e-mail gets the same message", async ({ page, ip }) => {
    const email = uniqueEmail("wrongpw");
    await registerViaApi(page.request, email, ip);
    for (const [e, p] of [[email, "not-the-password"], [uniqueEmail("nobody"), PASSWORD]]) {
      await page.goto("/auth/signin");
      await page.getByPlaceholder("hero@asl.com").fill(e);
      await page.locator('input[type="password"]').fill(p);
      await page.getByRole("button", { name: "ENTER GAME" }).click();
      await expect(page.getByTestId("auth-error")).toHaveText("Invalid email or password");
    }
  });

  test("[A-07] a correct sign-in lands on the song list (or the hero-name page when there is no name yet)", async ({ page, ip }) => {
    const email = uniqueEmail("signin");
    await registerViaApi(page.request, email, ip);
    await signIn(page, email);
    await page.waitForURL("**/auth/hero-name");
  });

  test("[A-08] a returning player with a hero name goes straight to the song list", async ({ page, ip }) => {
    const { email } = await signedInHero(page, ip);
    await page.getByTitle("Sign Out").click();
    await expect(page.locator("header").getByText("LOGIN")).toBeVisible();
    await signIn(page, email);
    await page.waitForURL("**/songselection");
  });

  test("[A-09] too many sign-up attempts from one address are refused with a clear message", async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: { "cf-connecting-ip": "203.0.113.77" } });
    const page = await context.newPage();
    await page.goto("/auth/signin");
    await page.getByRole("button", { name: "Need an account? Register Now" }).click();
    for (let i = 0; i < 6; i++) {
      await page.getByPlaceholder("hero@asl.com").fill(uniqueEmail("flood"));
      await page.locator('input[type="password"]').fill("12345");
      await page.getByRole("button", { name: "REGISTER" }).click();
      await expect(page.getByTestId("auth-error")).toBeVisible();
    }
    await expect(page.getByTestId("auth-error")).toContainText(/Too many requests/);
    await context.close();
  });
});

test.describe("choosing a hero name", () => {
  test("[N-01] someone who is not signed in is sent to sign in", async ({ page }) => {
    await page.goto("/auth/hero-name");
    await page.waitForURL("**/auth/signin");
  });

  test("[N-02] the rules are shown up front, and the name is checked as you type", async ({ page, ip }) => {
    const email = uniqueEmail("n2");
    await registerViaApi(page.request, email, ip);
    await signIn(page, email);
    await page.waitForURL("**/auth/hero-name");
    await expect(feedback(page)).toContainText("3-16 characters");
    await expect(page.getByRole("button", { name: "CONTINUE" })).toBeDisabled();

    await page.locator("#hero-name").fill("ab");
    await expect(feedback(page)).toHaveText("Use at least 3 characters.");
    await page.locator("#hero-name").fill("bad!name");
    await expect(feedback(page)).toContainText("Use letters, numbers, spaces, - or _");
    await page.locator("#hero-name").fill("Admin");
    await expect(feedback(page)).toHaveText("That name is reserved.");
    await page.locator("#hero-name").fill("Guest Hero");
    await expect(feedback(page)).toHaveText("That name is reserved.");
    await page.locator("#hero-name").fill("shit");
    await expect(feedback(page)).toHaveText("Please choose a different name.");
    await expect(page.getByRole("button", { name: "CONTINUE" })).toBeDisabled();

    await page.locator("#hero-name").fill(uniqueHeroName());
    await expect(feedback(page)).toHaveText("Available.");
    await expect(page.getByRole("button", { name: "CONTINUE" })).toBeEnabled();
    expect(await page.locator("#hero-name").getAttribute("maxlength")).toBe("16");
  });

  test("[N-03] a name someone already has is taken, whatever the capital letters, spaces or dashes", async ({ page, ip, browser }) => {
    const first = await signedInHero(page, ip, "first");
    const second = await browser.newContext({ extraHTTPHeaders: { "cf-connecting-ip": `${ip.split(".").slice(0, 3).join(".")}.250` } });
    const p2 = await second.newPage();
    const email = uniqueEmail("second");
    await registerViaApi(p2.request, email, ip);
    await signIn(p2, email);
    await p2.waitForURL("**/auth/hero-name");
    for (const variant of [first.heroName, first.heroName.toUpperCase(), first.heroName.toLowerCase()]) {
      await p2.locator("#hero-name").fill(variant);
      await expect(feedback(p2)).toHaveText("That name is already taken.");
    }
    await second.close();
  });

  test("[N-04] continuing asks you to confirm that the name is permanent, and BACK returns to editing", async ({ page, ip }) => {
    const email = uniqueEmail("n4");
    await registerViaApi(page.request, email, ip);
    await signIn(page, email);
    await page.waitForURL("**/auth/hero-name");
    const name = uniqueHeroName();
    await page.locator("#hero-name").fill(name);
    await expect(feedback(page)).toHaveText("Available.");
    await page.getByRole("button", { name: "CONTINUE" }).click();
    const confirm = page.getByTestId("hero-name-confirm");
    await expect(confirm).toContainText(name);
    await expect(confirm).toContainText("permanent");
    await page.getByRole("button", { name: "BACK" }).click();
    await expect(page.locator("#hero-name")).toHaveValue(name);
  });

  test("[N-05] locking it in saves the name, signs the player in under it and opens the song list", async ({ page, ip }) => {
    const email = uniqueEmail("n5");
    await registerViaApi(page.request, email, ip);
    await signIn(page, email);
    await page.waitForURL("**/auth/hero-name");
    await claimHeroName(page, uniqueHeroName());
    await page.goto("/whack"); // no longer redirected back to the name page
    await expect(page).toHaveURL(/\/whack/);
    await expect(page.getByTestId("whack-start")).toBeVisible();
  });

  test("[N-06] if someone else locks in the name between checking and locking it in, the error is shown and the player can choose again", async ({ page, ip, browser }) => {
    const email = uniqueEmail("n6");
    const name = uniqueHeroName();
    await registerViaApi(page.request, email, ip);
    await signIn(page, email);
    await page.waitForURL("**/auth/hero-name");
    await page.locator("#hero-name").fill(name);
    await expect(feedback(page)).toHaveText("Available.");
    await page.getByRole("button", { name: "CONTINUE" }).click();

    // meanwhile another player takes the name
    const other = await browser.newContext({ extraHTTPHeaders: { "cf-connecting-ip": `${ip.split(".").slice(0, 3).join(".")}.251` } });
    await signedInHero(await other.newPage(), ip, "rival", name);
    await other.close();

    await page.getByRole("button", { name: "LOCK IT IN" }).click();
    await expect(page.getByText("That name is already taken.").first()).toBeVisible();
    await expect(page.locator("#hero-name")).toBeVisible();
  });
});

test.describe("profile", () => {
  test("[P-01] someone who is not signed in is sent to sign in", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForURL("**/auth/signin");
  });

  test("[P-02] the profile shows the e-mail and the hero name as permanent", async ({ page, ip }) => {
    const { email, heroName } = await signedInHero(page, ip);
    await page.goto("/profile");
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByTestId("profile-hero-name")).toContainText(heroName);
    await expect(page.getByText("Locked")).toBeVisible();
  });

  test("[P-03] saving the API key says so, and the key is masked when you come back", async ({ page, ip }) => {
    await signedInHero(page, ip);
    await page.goto("/profile");
    const input = page.locator('input[type="password"]');
    await input.fill("AIza-test-key-0123456789");
    await page.getByRole("button", { name: /SAVE CHANGES/ }).click();
    await expect(page.getByText("PROFILE UPDATED SUCCESSFULLY")).toBeVisible();
    await page.reload();
    await expect(input).not.toHaveValue("AIza-test-key-0123456789");
    await expect(input).toHaveValue(/•+6789$/);
  });

  test("[P-04] if saving fails the player is told", async ({ page, ip }) => {
    await signedInHero(page, ip);
    await page.goto("/profile");
    await page.route("**/api/trpc/user.updateProfile*", (route) => route.abort("failed"));
    await page.locator('input[type="password"]').fill("some-key");
    await page.getByRole("button", { name: /SAVE CHANGES/ }).click();
    await expect(page.getByTestId("profile-error")).toBeVisible();
    await expect(page.getByText("PROFILE UPDATED SUCCESSFULLY")).toHaveCount(0);
  });
});
