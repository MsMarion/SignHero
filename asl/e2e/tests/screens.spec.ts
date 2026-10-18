import { test, expect, startGame, openWhack, waitForPlaying, currentTarget } from "../support/helpers";

// Other screen sizes. Phones (under 640 px wide) are in phone.spec.ts. Here: tablets held upright (the compact
// layout on a 640 px stage), tablets on their side, laptops and big monitors (the desktop stage), and a phone on its side.

const onScreen = async (page: import("@playwright/test").Page, locator: import("@playwright/test").Locator, what: string) => {
  const box = await locator.boundingBox();
  expect(box, `${what} is on screen`).not.toBeNull();
  const vp = page.viewportSize()!;
  expect(box!.x, `${what} left`).toBeGreaterThanOrEqual(-1);
  expect(box!.y, `${what} top`).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width, `${what} right`).toBeLessThanOrEqual(vp.width + 1);
  expect(box!.y + box!.height, `${what} bottom`).toBeLessThanOrEqual(vp.height + 1);
};

const layoutOf = (page: import("@playwright/test").Page) => page.locator("[data-layout]").first().getAttribute("data-layout");

test.describe("tablet held upright (820 x 1180)", () => {
  test.use({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true });

  test("[F-08] it gets the compact layout: camera and sign in play, no letter grid, no tab arch, lobby fits", async ({ page }) => {
    await openWhack(page);
    expect(await layoutOf(page)).toBe("compact");
    await expect(page.getByTestId("navbar")).toBeHidden();
    await onScreen(page, page.getByTestId("whack-start"), "START");
    await page.getByTestId("whack-start").click();
    const target = await currentTarget(page);
    await expect(page.getByTestId("phone-target-sign")).toBeVisible();
    await expect(page.getByTestId(`tile-${target}`)).toHaveCount(0);
    for (const id of ["whack-timer", "whack-score", "phone-target-sign", "whack-latency"]) await onScreen(page, page.getByTestId(id), id);
  });
});

for (const [id, label, width, height] of [
  ["F-09", "tablet on its side (1180 x 820)", 1180, 820],
  ["F-10", "small laptop (1366 x 768)", 1366, 768],
  ["F-11", "ultrawide monitor (3440 x 1440)", 3440, 1440],
] as const) {
  test.describe(label, () => {
    test.use({ viewport: { width, height }, isMobile: width < 1000, hasTouch: width < 1000 });

    test(`[${id}] it keeps the desktop layout: the whole stage fits, the letter grid is shown, and the stage cannot be scrolled out of place`, async ({ page }) => {
      await openWhack(page);
      expect(await layoutOf(page)).toBe("desktop");
      await onScreen(page, page.getByTestId("whack-start"), "START");
      await expect(page.getByTestId("navbar")).toBeVisible();
      await page.getByTestId("whack-start").click();
      const target = await currentTarget(page);
      await onScreen(page, page.getByTestId(`tile-${target}`), "the target tile");
      await onScreen(page, page.getByTestId("whack-timer"), "the timer");
      await expect(page.getByTestId("phone-target-sign")).toHaveCount(0);

      // code (focus, scrollIntoView) must not be able to shift the stage: it is clipped, not just hidden
      const scrolled = await page.evaluate(() => {
        const stage = document.querySelector("[data-layout]") as HTMLElement;
        const frame = stage.parentElement as HTMLElement;
        stage.scrollTop = 400;
        stage.scrollLeft = 400;
        frame.scrollTop = 400;
        frame.scrollLeft = 400;
        return [stage.scrollTop, stage.scrollLeft, frame.scrollTop, frame.scrollLeft];
      });
      expect(scrolled).toEqual([0, 0, 0, 0]);
    });
  });
}

test.describe("phone on its side (844 x 390)", () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });

  test("[F-12] it asks for the phone to be turned upright, and 'continue anyway' lets the player through", async ({ page }) => {
    await page.goto("/whack");
    const prompt = page.getByTestId("rotate-prompt");
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText("ROTATE YOUR PHONE UPRIGHT");
    await page.getByRole("button", { name: "Continue anyway" }).click();
    await expect(prompt).toBeHidden();
    await expect(page.getByTestId("whack-start")).toBeVisible();
  });
});

test.describe("a window that is wide and short is a desktop, not a phone on its side", () => {
  test.use({ viewport: { width: 1440, height: 480 } });

  test("[F-13] no rotate notice on a wide, short window", async ({ page }) => {
    await page.goto("/whack");
    await expect(page.getByTestId("whack-start")).toBeVisible();
    await expect(page.getByTestId("rotate-prompt")).toHaveCount(0);
  });
});
