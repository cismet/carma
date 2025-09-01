import { test, expect } from "@playwright/test";

test.describe("fullscreen", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("opens app in full page when toggled", async ({ page }) => {
    const control = page.locator('[data-test-id="full-screen-control"]');

    // Get initial map height as a number
    const mapSmallHeight = await page
      .locator("#routedMap")
      .evaluate((el) => parseInt(getComputedStyle(el).height, 10));

    console.log("mapSmallHeight:", mapSmallHeight);

    // Click the fullscreen button
    await control.click();

    // Get fullscreen height as a number
    const mapBigHeight = await page
      .locator("#routedMap")
      .evaluate((el) => parseInt(getComputedStyle(el).height, 10));

    console.log("mapBigHeight:", mapBigHeight);

    // Assert that fullscreen height is bigger
    expect(mapBigHeight).toBeGreaterThan(mapSmallHeight);
  });
});
