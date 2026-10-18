import { test, expect } from "../support/helpers";

// Production has no songs yet (media ingestion is a separate piece of work), so these cover the empty
// and error states every song page must handle, and the routes that must not exist.

test.describe("song pages with no songs", () => {
  test("[S-01] the official song list says there are no songs", async ({ page }) => {
    await page.goto("/songselection");
    await expect(page.getByText("CURATED SONGS").first()).toBeVisible();
    await expect(page.getByText("No curated songs found in database")).toBeVisible();
    await expect(page.getByTestId("navbar")).toBeVisible();
  });

  test("[S-02] the community song list says there are no songs", async ({ page }) => {
    await page.goto("/community");
    await expect(page.getByText("COMMUNITY SONGS").first()).toBeVisible();
    await expect(page.getByText("No community songs found in database")).toBeVisible();
  });

  for (const [id, path, text] of [
    ["S-03", "/game/6affffffffffffffffffffff", "FAILED TO LOAD SONG"],
    ["S-04", "/game/training/6affffffffffffffffffffff", "Error loading song data"],
    ["S-05", "/game/testing/6affffffffffffffffffffff", "Error loading song data"],
  ] as const) {
    test(`[${id}] ${path} for a song that does not exist shows an error, not a blank page`, async ({ page, problems }) => {
      await page.goto(path);
      await expect(page.getByText(text)).toBeVisible();
      await expect(page.getByText("Song not found")).toBeVisible();
      expect(problems.filter((p) => !/404|Failed to load resource|NOT_FOUND|Song not found|song.getById/i.test(p))).toEqual([]);
    });
  }

  test("[S-06] an address that is not a song id at all is treated the same way (not an internal error)", async ({ page }) => {
    await page.goto("/game/not-a-real-id");
    await expect(page.getByText("FAILED TO LOAD SONG")).toBeVisible();
    await expect(page.getByText("Song not found")).toBeVisible();
  });
});
