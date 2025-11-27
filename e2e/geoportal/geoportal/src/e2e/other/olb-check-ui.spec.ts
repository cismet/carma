import {
  setupAllMocks,
  mockGeoportalServices,
  mockObliqueServices,
} from "@carma-commons/e2e";
import { test, expect } from "@playwright/test";

test.describe("geoportal layer group icon", () => {
  test.beforeEach(async ({ context, page }) => {
    test.slow();
    await setupAllMocks(context);
    await mockGeoportalServices(context);
    await mockObliqueServices(context);
    await page.goto(
      "/#/?lat=51.2527066&lng=7.2051585&h=925.81&heading=324.58&pitch=311.88&fov=40.76&m=1&ff=oblq&is3d=1"
    );
  });

  test("All olb controls are showing", async ({ page }) => {
    const luftBuild = page.getByText("Luftbild");
    await expect(luftBuild).toBeVisible();
    const oblModeButton = page.locator(".ant-btn").first();
    await expect(oblModeButton).toBeVisible();
    await oblModeButton.click();

    // Action buttons
    const flightToImg = page.getByText("Flug zum Bild");
    await expect(flightToImg).toBeVisible();
    const openImage = page.getByRole("button", { name: "Bild öffnen" });
    await expect(openImage).toBeVisible();
    const downloadImage = page.getByRole("button", { name: "Herunterladen" });
    await expect(downloadImage).toBeVisible();
    const feedback = page.getByRole("button", { name: "Rückmeldung" });
    await expect(feedback).toBeVisible();

    // Rotate controls
    const rotateLeft = page
      .locator("#mapContainer")
      .getByRole("button")
      .filter({ hasText: /^$/ })
      .first();
    await expect(rotateLeft).toBeVisible();
    // await rotateLeft.click();
    const rotateRight = page
      .locator("#mapContainer")
      .getByRole("button")
      .filter({ hasText: /^$/ })
      .nth(1);
    await expect(rotateRight).toBeVisible();
    const arrowUp = page.getByRole("button", { name: "↑" });
    await expect(arrowUp).toBeVisible();
    const arrowDown = page.getByRole("button", { name: "↓" });
    await expect(arrowDown).toBeVisible();

    const arrowLeft = page.getByRole("button", { name: "←" });
    await expect(arrowLeft).toBeVisible();
    const arrowRight = page.getByRole("button", { name: "→" });
    await expect(arrowRight).toBeVisible();

    const firstUrl = page.url();
    await rotateRight.click();

    // Wait for URL to change (indicates rotation completed)
    await page.waitForURL((url) => url.toString() !== firstUrl, {
      timeout: 10000,
    });

    expect(page.url()).not.toBe(firstUrl);
  });
});
