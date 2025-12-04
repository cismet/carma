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

    // ---- Polyline ----
    await map.click({ modifiers: ["Alt"], position: { x: 300, y: 300 } });
    await map.click({ modifiers: ["Alt"], position: { x: 403, y: 300 } });
    // Small delay to ensure previous click is processed before double-click
    await page.waitForTimeout(50);
    // Double-click at a different position to finish the polyline
    await map.dblclick({ modifiers: ["Alt"], position: { x: 450, y: 300 } });

    await expect(
      page.getByTestId("info-box").getByText("Linienzug")
    ).toBeVisible();
    const totalLength = page.locator('[title="Total length"]');
    await expect(totalLength).toBeVisible({ timeout: 10000 });

    await expect(page.getByText(/Strecke:\s*[\d.]+/i)).toBeVisible();

    // Buttons visible
    await expect(
      page.locator('[data-test-id="delete-measurement-btn"]')
    ).toBeVisible();

    await expect(
      page.locator('[data-test-id="zoom-measurement-btn"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-test-id="switch-measurement-left"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-test-id="switch-measurement-right"]')
    ).toBeVisible();

    // ---- Polygon ----
    await map.click({ modifiers: ["Alt"], position: { x: 300, y: 200 } });
    await map.click({ modifiers: ["Alt"], position: { x: 400, y: 200 } });
    await map.click({ modifiers: ["Alt"], position: { x: 400, y: 100 } });
    await map.click({ modifiers: ["Alt"], position: { x: 300, y: 100 } });
    // Hover first to trigger snapping, then click to close polygon
    await map.hover({ position: { x: 300, y: 200 } });
    await page.waitForTimeout(100);
    await map.click({ position: { x: 300, y: 200 } });

    await expect(page.getByText("Fläche", { exact: true })).toBeVisible();

    // Collapse/expand details
    const chevronDown = page.locator('[data-icon="chevron-circle-down"]');
    await expect(chevronDown).toBeVisible();
    await chevronDown.click();

    const chevronUp = page.locator('[data-icon="chevron-circle-up"]');
    await expect(chevronUp).toBeVisible();
    await chevronUp.click();
    await expect(page.getByText("Fläche", { exact: true })).toBeVisible();

    // Switch visible measurement
    await page.locator('[data-test-id="switch-measurement-left"]').click();
    await expect(page.getByText("Fläche", { exact: true })).toHaveCount(0);
    await expect(
      page.getByTestId("info-box").getByText("Linienzug")
    ).toBeVisible();

    await page.locator('[data-test-id="switch-measurement-right"]').click();
    await expect(page.getByText("Fläche", { exact: true })).toBeVisible();
    await expect(
      page.getByTestId("info-box").getByText("Linienzug")
    ).toHaveCount(0);

    // Visibility / zoom / delete flows
    await expect(page.getByText("2 Messungen angezeigt")).toBeVisible();
    await page.locator('[data-test-id="zoom-measurement-btn"]').click();
    await expect(page.getByText("1 Messungen angezeigt")).toBeVisible();

    await expect(page.getByText("2 Messungen verfügbar")).toBeVisible();
    await page.getByText("2 Messungen verfügbar").click();
    await expect(page.getByText("2 Messungen angezeigt")).toBeVisible();

    await page.locator('[data-test-id="delete-measurement-btn"]').click();
    await expect(page.getByText("1 Messungen verfügbar")).toBeVisible();
    await expect(page.getByText("1 Messungen angezeigt")).toBeVisible();

    await page.locator('[data-test-id="delete-measurement-btn"]').click();
    await expect(page.getByText("0 Messungen verfügbar")).toBeVisible();
  });
});
