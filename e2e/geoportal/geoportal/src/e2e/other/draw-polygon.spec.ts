import { setupAllMocks, mockGeoportalServices } from "@carma-commons/e2e";
import { test, expect } from "@playwright/test";

test.describe("geoportal measurements", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context);
    await mockGeoportalServices(context);

    await page.goto("/#/?lat=51.272538&lng=7.2000334&zoom=17");
    // await page.waitForLoadState("networkidle");
  });

  test("measurements", async ({ page }) => {
    const map = page.locator("#routedMap");

    // Open measurement UI
    await expect(
      page.locator('[data-test-id="measurement-control"]')
    ).toBeVisible();
    await page.locator('[data-test-id="measurement-control"]').click();
    await expect(
      page.locator('[data-test-id="empty-measurement-info"]')
    ).toBeVisible();

    // Ensure map is ready
    await expect(map).toBeVisible();

    // ---- Polygon ----
    await map.click({ modifiers: ["Alt"], position: { x: 300, y: 200 } });
    await map.click({ modifiers: ["Alt"], position: { x: 400, y: 200 } });
    await map.click({ modifiers: ["Alt"], position: { x: 400, y: 100 } });
    await map.click({ modifiers: ["Alt"], position: { x: 300, y: 100 } });
    // Hover first to trigger snapping, then click to close polygon
    await map.hover({ position: { x: 300, y: 200 } });
    await page.waitForTimeout(100); // Wait for snapping to detect first vertex
    await map.click({ position: { x: 300, y: 200 } });

    await expect(page.getByText("Fläche", { exact: true })).toBeVisible();
    await expect(
      page.locator('[data-test-id="delete-measurement-btn"]')
    ).toBeVisible();
  });
});
