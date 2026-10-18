import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";
import { APP_URL, MOCK_URL } from "./env";

export { expect };

/**
 * Waits are multiplied on CI: the shared runners have two slow cores, and hand tracking (WebGL in software) starves the
 * page's timers, so a 3-second countdown can take 20. The tests check that things happen, not how fast.
 */
export const SLOW = process.env.CI ? 3 : 1;

/** Control channel to the mock detection server (see mock-backend.mjs). */
export class Mock {
  constructor(private request: APIRequestContext) {}
  async control(patch: Record<string, unknown>) {
    await this.request.post(`${MOCK_URL}/__control`, { data: patch });
  }
  async drop() {
    await this.request.post(`${MOCK_URL}/__drop`);
  }
  async reset() {
    await this.request.post(`${MOCK_URL}/__reset`);
  }
  async state(): Promise<Record<string, number | boolean | string | null>> {
    return (await this.request.get(`${MOCK_URL}/__state`)).json();
  }
}

let ipCounter = 0;
/** A distinct client address per test: the site rate-limits by address and trusts Cloudflare's header. */
const freshIp = () => `10.${(Date.now() >> 4) % 250}.${Math.floor(Math.random() * 250)}.${(++ipCounter % 250) + 1}`;

type Fixtures = {
  ip: string;
  mock: Mock;
  /** console.error lines and uncaught page exceptions seen so far */
  problems: string[];
};

export const test = base.extend<Fixtures>({
  ip: async ({}, use) => {
    await use(freshIp());
  },
  context: async ({ context, ip }, use) => {
    await context.setExtraHTTPHeaders({ "cf-connecting-ip": ip });
    await use(context);
  },
  mock: async ({ request }, use) => {
    const mock = new Mock(request);
    await mock.reset();
    await use(mock);
  },
  problems: async ({ page }, use) => {
    const problems: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") problems.push(`console.error: ${m.text().slice(0, 200)}`);
    });
    page.on("pageerror", (e) => problems.push(`pageerror: ${String(e.message).slice(0, 200)}`));
    await use(problems);
  },
});

/** A unique, valid e-mail address for a test user (the suite wipes its database at the start of a run). */
export const uniqueEmail = (label: string) =>
  `e2e-${label}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.test`;
export const PASSWORD = "e2e-password-123";

/** A valid hero name that is unique per call: letters and digits only, 3-16 characters. */
export const uniqueHeroName = () => `Hero${Math.floor(Math.random() * 9e7 + 1e7)}`;

/** Creates an account through the API (fast; the sign-up form itself is covered by its own tests). */
export async function registerViaApi(request: APIRequestContext, email: string, ip: string) {
  const res = await request.post(`${APP_URL}/api/trpc/user.register?batch=1`, {
    headers: { "cf-connecting-ip": ip },
    data: { 0: { json: { email, password: PASSWORD } } },
  });
  expect(res.ok(), `register ${email}: ${await res.text()}`).toBeTruthy();
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/auth/signin");
  await page.getByPlaceholder("hero@asl.com").fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "ENTER GAME" }).click();
}

/** On /auth/hero-name: type a name, wait for it to be available, confirm and lock it in. */
export async function claimHeroName(page: Page, name: string) {
  await page.locator("#hero-name").fill(name);
  await expect(page.getByTestId("hero-name-feedback")).toHaveText("Available.");
  await page.getByRole("button", { name: "CONTINUE" }).click();
  await expect(page.getByTestId("hero-name-confirm")).toBeVisible();
  await page.getByRole("button", { name: "LOCK IT IN" }).click();
  await page.waitForURL("**/songselection");
}

/** Registers, signs in and claims a hero name. Leaves the page signed in on /songselection. */
export async function signedInHero(page: Page, ip: string, label = "hero", name?: string) {
  const email = uniqueEmail(label);
  const heroName = name ?? uniqueHeroName();
  await registerViaApi(page.request, email, ip);
  await signIn(page, email);
  await page.waitForURL("**/auth/hero-name");
  await claimHeroName(page, heroName);
  return { email, heroName };
}

// ---- Whack-A-Sign helpers

export const heading = (page: Page) => page.getByTestId("whack-heading");

export async function openWhack(page: Page) {
  await page.goto("/whack");
  await expect(page.getByTestId("whack-start")).toBeVisible();
}

/** Clicks START CHALLENGE and waits for the countdown to begin. */
export async function startGame(page: Page) {
  await openWhack(page);
  await page.getByTestId("whack-start").click();
  await expect(heading(page)).not.toHaveAttribute("data-state", "idle");
}

export async function waitForPlaying(page: Page, timeout = 15_000 * SLOW) {
  await expect(heading(page)).toHaveAttribute("data-state", "playing", { timeout });
}

export async function currentTarget(page: Page): Promise<string> {
  await waitForPlaying(page);
  const target = await heading(page).getAttribute("data-target");
  expect(target, "a target letter").toBeTruthy();
  return target!;
}

export async function scoreOf(page: Page): Promise<number> {
  const text = (await page.getByTestId("whack-score").textContent()) ?? "0";
  return Number(text.replace(/[^\d]/g, ""));
}

export async function hitsOf(page: Page): Promise<number> {
  const text = (await page.getByTestId("whack-hits").textContent()) ?? "";
  return Number(/✓\s*(\d+)/.exec(text)?.[1] ?? 0);
}

/** Waits for the detection socket to be open (latency shows milliseconds instead of OFFLINE). */
export async function waitForDetection(page: Page) {
  await expect(page.getByTestId("whack-latency")).not.toHaveText("OFFLINE", { timeout: 20_000 * SLOW });
}

/** Presses the target letter and waits for the score to go up. */
export async function hitWithKeyboard(page: Page) {
  await waitForDetection(page);
  const before = await hitsOf(page);
  const letter = await currentTarget(page);
  await page.keyboard.press(letter.toLowerCase());
  await expect.poll(() => hitsOf(page), { timeout: 8000 * SLOW }).toBe(before + 1);
}

/** Overrides getUserMedia so the page sees a camera failure (must be added before navigating). */
export async function failCamera(page: Page, errorName: "NotAllowedError" | "NotFoundError" | "NotReadableError") {
  await page.addInitScript((name) => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("blocked for the test", name));
  }, errorName);
}

/** Plays out the clock: waits for the game to finish and the redirect to the leaderboard. */
export async function finishGame(page: Page) {
  await page.waitForURL("**/leaderboard?playerId=*", { timeout: 60_000 * SLOW });
  return new URL(page.url()).searchParams.get("playerId")!;
}
