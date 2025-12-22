import { test, expect, type Page } from "@playwright/test";
import { setupAllMocks, mockGeoportalServices } from "@carma-commons/e2e";

const CONTROL_TEST_IDS = [
  "zoom-in-control",
  "home-control",
  "measurement-control",
  "3d-control",
  "compass-control",
  "feature-info-control",
  "helper-overlay-btn",
  "reload-btn",
  "kartenebenen-hinzufügen-btn",
  "hintergrundkarte-btn",
  "speichern-btn",
  "teilen-btn",
  "fuzzy-search",
] as const;

async function expectControlsVisible(page: Page, visible: boolean) {
  for (const id of CONTROL_TEST_IDS) {
    const locator = page.locator(`[data-test-id="${id}"]`);
    if (visible) {
      await expect(locator).toBeVisible();
    } else {
      await expect(locator).not.toBeVisible();
    }
  }
}

test.describe("Geoportal - Zen mode", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context);
    await mockGeoportalServices(context);

    await page.goto("/");
  });

  test("Start Zen mode, check if it is active and stop it", async ({
    page,
  }) => {
    await expectControlsVisible(page, true);

    const zenModeBtn = page.getByTestId("zen-mode-btn");
    await expect(zenModeBtn).toBeVisible();
    await zenModeBtn.click();

    await expectControlsVisible(page, false);

    // Show all controls
    await zenModeBtn.last().click();
    await expectControlsVisible(page, true);
  });
});
