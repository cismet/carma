import { setupAllMocks } from "@carma-commons/e2e";
import { test, expect } from "@playwright/test";

test.describe("Geoportal overlay", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context);
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

    // No popovers initially
    // await expect(popover).toHaveCount(0);

    // Open and close each popover
    for (let i = 0; i < primaryCount; i++) {
      const el = primaryItems.nth(i);
      const popover = page.getByTestId("secondary-content").last();

      // Open
      // console.log("xxx popoversCount 1--" + i, await popover.count());
      await el.click();
      // console.log("xxx popoversCount 2--" + i, await popover.count());

      await expect(popover).toBeVisible();

      const firstPopoverWithText = page
        .getByTestId("secondary-content")
        .filter({ hasText: /.+/ })
        .last();

      // console.log("xxx popoversCount 3--" + i, await popover.count());
      // Verify it exists and is visible
      await expect(firstPopoverWithText).toBeVisible();
      await firstPopoverWithText.click();
      await expect(popover).toBeHidden();
      // await el.click({ force: true });
      await expect(popover).not.toBeVisible();

      // console.log("xxx popoversCount 3", await popover.count());
    }

    // First, try clicking the overlay background directly
    await overlayBg.click({ force: true });
    await page.waitForTimeout(300);

    // If still visible, try clicking at different positions
    if (await overlayBg.isVisible()) {
      const box = await overlayBg.boundingBox();
      if (box) {
        // Try clicking in different corners of the overlay
        await page.mouse.click(box.x + 10, box.y + 10);
        await page.waitForTimeout(300);

        if (await overlayBg.isVisible()) {
          await page.mouse.click(box.x + box.width - 10, box.y + 10);
          await page.waitForTimeout(300);
        }

        if (await overlayBg.isVisible()) {
          await page.mouse.click(box.x + box.width / 2, box.y + 10);
          await page.waitForTimeout(300);
        }
      }
    }

    // Wait for the overlay to be detached with increased timeout
    await overlayBg.waitFor({ state: "detached", timeout: 10000 });
    await expect(overlayBg).toBeHidden();
  });
});
