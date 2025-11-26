import { setupAllMocks, mockGeoportalServices } from "@carma-commons/e2e";
import { test, expect } from "@playwright/test";

test("fullscreen button toggles fullscreen", async ({ context, page }) => {
  await setupAllMocks(context);
  await mockGeoportalServices(context);
  await page.goto("/");

  // Locate the fullscreen control by attribute
  const control = page.locator("[data-test-id=full-screen-control]");
  await expect(control).toBeVisible();

  // Click to enter fullscreen
  await control.click();

  // Wait until something is in fullscreen
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);

  // Click again (or Esc) to exit fullscreen
  await control.click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(false);
});
