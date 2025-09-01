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
    const popover = page.locator(".ant-popover-content:visible");

    // Button visible
    await expect(helperBtn).toBeVisible();
    await expect(overlayBg).toBeHidden();
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
      // await expect(popover).toBeVisible();

      // await el.click({ force: true });
      await expect(popover).toHaveCount(1);
    }

    // await overlayBg.click();
    // await page.mouse.click(5, 5);
    await overlayBg.click({ position: { x: 10, y: 10 } });

    await overlayBg.waitFor({ state: "detached" });
    await expect(overlayBg).toBeHidden();
    // await expect(overlayBg).toBeHidden({ timeout: 10_000 });
    // await expect(overlayBg).toHaveCount(0, { timeout: 10_000 });
  });
});
