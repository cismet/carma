import { setupAllMocks } from "@carma-commons/e2e";
import { test, expect, Page } from "@playwright/test";

async function getZoomLevel(page: Page): Promise<number> {
  const hash = await page.evaluate(() => window.location.hash || "");
  const params = new URLSearchParams(hash.slice(2));
  const z = params.get("zoom");
  if (z === null) throw new Error("Zoom parameter is missing in the URL");
  const zoom = parseInt(z, 10);
  if (!Number.isInteger(zoom)) throw new Error(`Zoom is not an integer: ${z}`);
  return zoom;
}

test.describe("Geoportal zoom", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context);
    await page.goto("/");
  });

  test("Zoom level increases and reduces by controls button", async ({
    page,
  }) => {
    const zoomIn = page.locator('[data-test-id="zoom-in-control"]');
    const zoomOut = page.locator('[data-test-id="zoom-out-control"]');

    await expect(zoomIn).toBeVisible();
    await expect(zoomOut).toBeVisible();

    const initialZoom = await getZoomLevel(page);
    expect(Number.isInteger(initialZoom)).toBe(true);

    // Click zoom-in and wait until the zoom becomes greater than initial
    await zoomIn.click();
    await expect
      .poll(() => getZoomLevel(page), {
        timeout: 7000,
        message: "zoom should increase after clicking zoom-in",
      })
      .toBeGreaterThan(initialZoom);

    const zoomAfterIn = await getZoomLevel(page);
    expect(zoomAfterIn).toBeGreaterThan(initialZoom);

    // Click zoom-out and wait until we’re back to the initial level
    await zoomOut.click();
    await expect
      .poll(() => getZoomLevel(page), {
        timeout: 7000,
        message: "zoom should return to initial after clicking zoom-out",
      })
      .toBe(initialZoom);

    const zoomAfterOut = await getZoomLevel(page);
    expect(zoomAfterOut).toBe(initialZoom);
  });
});
