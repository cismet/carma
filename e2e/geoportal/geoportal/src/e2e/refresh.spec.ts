import { setupAllMocks } from "@carma-commons/e2e";
import { test, expect } from "@playwright/test";

test.describe("Geoportal refresh", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context);
    await page.goto("/");
  });

  test("Refresh button reloads page and switches off measurement mode", async ({
    page,
  }) => {
    const reloadBtn = page.locator('[data-test-id="reload-btn"]');
    const measureCtrl = page.locator('[data-test-id="measurement-control"]');
    const emptyInfo = page.locator('[data-test-id="empty-measurement-info"]');

    await expect(reloadBtn).toBeVisible();
    await expect(measureCtrl).toBeVisible();

    await measureCtrl.click();
    await expect(emptyInfo).toBeVisible();

    // Click reload and wait for the document to re-load
    await Promise.all([
      page.waitForLoadState("domcontentloaded"),
      reloadBtn.click(),
    ]);

    await expect(emptyInfo).toHaveCount(0);
    // (Alternatively) await expect(emptyInfo).toBeHidden(); // passes if hidden OR detached
  });
});
