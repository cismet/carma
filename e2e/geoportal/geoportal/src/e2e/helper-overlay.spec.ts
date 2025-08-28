import { test, expect } from "@playwright/test";

test.describe("Geoportal overlay", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  // Work with errors

  test("Overlay helper is visible and opens all secondary popups", async ({
    page,
  }) => {
    const helperBtn = page.locator("[data-test-id=helper-overlay-btn]");
    const overlayBg = page.locator("[data-test-id=overlay-helper-bg]");
    const primaryItems = page.locator("[data-test-id=primary-with-secondary]");
    const popover = page.locator(".ant-popover-content");

    // Button visible
    await expect(helperBtn).toBeVisible();

    // Click button to open overlay
    await helperBtn.click();
    await expect(overlayBg).toBeVisible();

    const primaryCount = await primaryItems.count();
    expect(primaryCount).toBeGreaterThan(5);

    // No popovers initially
    await expect(popover).toHaveCount(0);

    // Open and close each popover
    for (let i = 0; i < primaryCount; i++) {
      const el = primaryItems.nth(i);

      // Open
      await el.click({ force: true });
      await expect(popover).toBeVisible(); // robust if exactly one opens

      // Close (click same element again)
      await el.click({ force: true });

      // In many Ant Design setups, popover is removed from DOM on close.
      // Using count(0) is more robust than "toBeHidden" here.
      await expect(popover).toHaveCount(0);
    }

    // Close overlay
    await overlayBg.click();

    // Overlay and items gone
    await expect(overlayBg).toHaveCount(0);
    await expect(primaryItems).toHaveCount(0);
  });
});
