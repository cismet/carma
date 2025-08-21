import { test, expect } from "@playwright/test";

test.describe("geoportal smoke test", () => {
  test.beforeEach(async ({ page }) => {
    // Make sure you set `use.baseURL` in playwright.config to allow `page.goto('/')`
    await page.goto("/");
  });

  test("Map loads with key controls and buttons", async ({ page }) => {
    await expect(page.locator('[data-test-id="zoom-control"]')).toBeVisible();
    await expect(page.locator('[data-test-id="home-control"]')).toBeVisible();
    await expect(
      page.locator('[data-test-id="measurement-control"]')
    ).toBeVisible();
    await expect(page.locator('[data-test-id="3d-control"]')).toBeVisible();

    // Cypress `.should("not.exist")` -> Playwright: expect zero matches
    await expect(page.locator('[data-test-id="2d-control"]')).toHaveCount(0);

    await expect(
      page.locator('[data-test-id="compass-control"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-test-id="feature-info-control"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-test-id="helper-overlay-btn"]')
    ).toBeVisible();
    await expect(page.locator('[data-test-id="reload-btn"]')).toBeVisible();
    await expect(
      page.locator('[data-test-id="kartenebenen-hinzufügen-btn"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-test-id="hintergrundkarte-btn"]')
    ).toBeVisible();
    await expect(page.locator('[data-test-id="speichern-btn"]')).toBeVisible();
    await expect(page.locator('[data-test-id="teilen-btn"]')).toBeVisible();
    await expect(page.locator('[data-test-id="fuzzy-search"]')).toBeVisible();

    // Modal should not exist initially
    await expect(page.locator("#cmdCloseModalApplicationMenu")).toHaveCount(0);

    // Open modal
    await page.locator('[data-test-id="modal-menu-btn"]').click();
    await expect(page.locator("#cmdCloseModalApplicationMenu")).toBeVisible();

    // Close modal
    await page.locator("#cmdCloseModalApplicationMenu").click();
    await expect(page.locator("#cmdCloseModalApplicationMenu")).toHaveCount(0);
  });
});
