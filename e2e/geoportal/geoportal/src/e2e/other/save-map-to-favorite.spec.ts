import { test, expect } from "@playwright/test";
import { setupAllMocks, mockGeoportalServices } from "@carma-commons/e2e";

test.describe("Geoportal - save map to favorite", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context);
    await mockGeoportalServices(context);

    await page.goto(
      "/#/?lat=51.2586922&lng=7.1510696&zoom=12&config=847e07f9bee9a4f8&appKey=sharedurl"
    );
  });

  test("Save Map dialog — save map with layers to Favorites", async ({
    page,
  }) => {
    const addLayersBtn = page.locator(
      '[data-test-id="kartenebenen-hinzufügen-btn"]'
    );
    await expect(addLayersBtn).toBeVisible();
    await addLayersBtn.click();
  });
});
