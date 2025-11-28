import {
  setupAllMocks,
  mockGeoportalServices,
  mockObliqueServices,
} from "@carma-commons/e2e";
import { test, expect } from "@playwright/test";

test.describe("Geoportal oblique", () => {
  test.beforeEach(async ({ context, page }) => {
    test.slow();
    await setupAllMocks(context);
    await mockGeoportalServices(context);
    await mockObliqueServices(context);
    // Mock Cesium IAU2006_XYS orientation data files
    // context.route("**/__cesium__/Assets/IAU2006_XYS/*.json", (route) =>
    //   route.fulfill({
    //     status: 200,
    //     headers: { "content-type": "application/json; charset=utf-8" },
    //     body: JSON.stringify({
    //       version: "1.0",
    //       updated: "2008 Dec 02 20:00:00 UTC",
    //       interpolationOrder: 9,
    //       xysAlgorithm: "SOFA_DEL_PSI_EPS",
    //       sampleZeroJulianEphemerisDate: 2442396.5,
    //       stepSizeDays: 1,
    //       startIndex: 0,
    //       numberOfSamples: 1,
    //       // Use an array-of-arrays to reflect "one sample with three values"
    //       samples: [[0.0, 0.0, 0.0]],
    //     }),
    //   })
    // );
    await page.goto(
      "/#/?lat=51.2527066&lng=7.2051585&h=925.81&heading=324.58&pitch=311.88&fov=40.76&m=1&ff=oblq&is3d=1"
    );
  });

  test("All UI controls are displayed", async ({ page }) => {
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

    const url1 = page.url();
    await rotateRight.click();

    // Wait for URL to change (indicates rotation completed)
    // await page.waitForURL((url) => url.toString() !== url1, {
    //   timeout: 10000,
    // });
    // const url2 = page.url();
    // expect(url2).not.toBe(url1);

    await expect(async () => {
      const url2 = page.url();
      expect(url2).not.toBe(url1);
    }).toPass({ timeout: 10000 });

    // const urlTwo = page.url();
    // await rotateLeft.click();
    // await expect(async () => {
    //   const url3 = page.url();
    //   expect(url3).not.toBe(urlTwo);
    // }).toPass({ timeout: 10000 });

    // const urlThree = page.url();
    // await arrowUp.click();
    // await expect(async () => {
    //   const url4 = page.url();
    //   expect(url4).not.toBe(urlThree);
    // }).toPass({ timeout: 10000 });
  });
});
