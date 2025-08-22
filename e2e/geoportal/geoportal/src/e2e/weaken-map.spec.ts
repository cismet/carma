// tests/geoportal-weaken-map-background.spec.ts
import { test, expect } from "@playwright/test";

test.describe("geoportal weaken the map background", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("Weaken the map background button adds background to the map.", async ({
    page,
  }) => {
    const btn = page.locator('[data-test-id="hintergrundkarte-btn"]');
    await expect(btn).toBeVisible();

    await btn.click();

    // Tiles should appear
    const tileDivs = page.locator("div.leaflet-tile-loaded");
    await expect(tileDivs.first()).toBeVisible();

    // Wait until at least one tile has a non-none background-image
    await page.waitForFunction(() => {
      const els = Array.from(
        document.querySelectorAll("div.leaflet-tile-loaded")
      );
      return els.some((el) => {
        const bg = getComputedStyle(el).backgroundImage;
        return bg && bg !== "none";
      });
    });

    // Sanity: confirm we really have tiles with background
    const withBgCount = await tileDivs.evaluateAll(
      (els) =>
        els.filter((el) => getComputedStyle(el).backgroundImage !== "none")
          .length
    );
    expect(withBgCount).toBeGreaterThan(0);

    // Turn background OFF
    await btn.click();

    // After toggling off, ensure no child <div> exists inside any .leaflet-tile-loaded
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll(".leaflet-tile-loaded")).every(
        (el) => !el.querySelector("div")
      )
    );
    await expect(tileDivs.locator("div")).toHaveCount(0);
  });
});
