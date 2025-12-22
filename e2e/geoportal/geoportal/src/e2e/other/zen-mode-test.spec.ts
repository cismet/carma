import { test, expect } from "@playwright/test";
import { setupAllMocks, mockGeoportalServices } from "@carma-commons/e2e";

test.describe("Geoportal - Zen mode", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context);
    await mockGeoportalServices(context);

    await page.goto("/");
  });

  test("Start Zen mode, check if it is active and stop it", async ({
    page,
  }) => {
    await expect(
      page.locator('[data-test-id="zoom-in-control"]')
    ).toBeVisible();
    await expect(page.locator('[data-test-id="home-control"]')).toBeVisible();
    await expect(
      page.locator('[data-test-id="measurement-control"]')
    ).toBeVisible();
    await expect(page.locator('[data-test-id="3d-control"]')).toBeVisible();

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
    const zenModeBtn = await page.getByTestId("zen-mode-btn");

    await expect(zenModeBtn).toBeVisible();
    await zenModeBtn.click();
    // Hide all controls
    await expect(
      page.locator('[data-test-id="zoom-in-control"]')
    ).not.toBeVisible();

    await expect(
      page.locator('[data-test-id="home-control"]')
    ).not.toBeVisible();
    await expect(
      page.locator('[data-test-id="measurement-control"]')
    ).not.toBeVisible();
    await expect(page.locator('[data-test-id="3d-control"]')).not.toBeVisible();

    await expect(
      page.locator('[data-test-id="compass-control"]')
    ).not.toBeVisible();
    await expect(
      page.locator('[data-test-id="feature-info-control"]')
    ).not.toBeVisible();
    await expect(
      page.locator('[data-test-id="helper-overlay-btn"]')
    ).not.toBeVisible();
    await expect(page.locator('[data-test-id="reload-btn"]')).not.toBeVisible();
    await expect(
      page.locator('[data-test-id="kartenebenen-hinzufügen-btn"]')
    ).not.toBeVisible();
    await expect(
      page.locator('[data-test-id="hintergrundkarte-btn"]')
    ).not.toBeVisible();
    await expect(
      page.locator('[data-test-id="speichern-btn"]')
    ).not.toBeVisible();
    await expect(page.locator('[data-test-id="teilen-btn"]')).not.toBeVisible();
    await expect(
      page.locator('[data-test-id="fuzzy-search"]')
    ).not.toBeVisible();

    // Show all controls
    await zenModeBtn.last().click();
    await expect(
      page.locator('[data-test-id="zoom-in-control"]')
    ).toBeVisible();
    await expect(page.locator('[data-test-id="home-control"]')).toBeVisible();
    await expect(
      page.locator('[data-test-id="measurement-control"]')
    ).toBeVisible();
    await expect(page.locator('[data-test-id="3d-control"]')).toBeVisible();

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
  });
});
