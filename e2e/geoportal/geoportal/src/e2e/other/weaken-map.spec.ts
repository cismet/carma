import { setupAllMocks } from "@carma-commons/e2e";
import { test, expect } from "@playwright/test";

test.describe("geoportal weaken the map background", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context);
    await page.goto("/");
  });

  test("Weaken the map background button adds background to the map.", async ({
    page,
  }) => {
    const btn = page.locator('[data-test-id="hintergrundkarte-btn"]');
    const mapContainer = page.locator(".leaflet-container");
    await expect(mapContainer).toBeHidden();
    await expect(btn).toBeVisible();

    await btn.click();

    await expect(mapContainer).toBeVisible();
    await expect(mapContainer).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)"
    );

    // const bg = await page
    //   .locator(".leaflet-container")
    //   .evaluate((el) => getComputedStyle(el).backgroundColor);

    // expect(bg).toBe("rgb(000, 255, 255)");
  });
});
