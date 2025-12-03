import { setupAllMocks, mockGeoportalServices } from "@carma-commons/e2e";
import { test, expect } from "@playwright/test";

test.describe("Geoportal overlay", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context);
    await mockGeoportalServices(context);

    await page.goto("/");
  });

  test("Overlay helper is visible and opens all secondary popups", async ({
    page,
  }) => {
    const helperBtn = page.getByTestId("helper-overlay-btn");
    const overlayBg = page.getByTestId("overlay-helper-bg");
    const primaryItems = page.getByTestId("primary-with-secondary");

    // Button visible
    await expect(helperBtn).toBeVisible();
    await expect(overlayBg).toBeHidden();
    // Click button to open overlay
    await helperBtn.click();
    await expect(overlayBg).toBeVisible();

    const primaryCount = await primaryItems.count();
    expect(primaryCount).toBeGreaterThan(5);

    // Open and close each popover
    for (let i = 0; i < 7; i++) {
      const el = primaryItems.nth(i);
      const popover = page.getByTestId("secondary-content").last();

      // Open
      await el.click();

      await expect(popover).toBeVisible();

      const firstPopoverWithText = page
        .getByTestId("secondary-content")
        .filter({ hasText: /.+/ })
        .last();

      // Verify it exists and is visible
      await expect(firstPopoverWithText).toBeVisible();
      await firstPopoverWithText.click();
      // await expect(popover).toBeHidden();
      // await el.click({ force: true });
      await expect(popover).not.toBeVisible({ timeout: 10000 });
    }
  });
});
