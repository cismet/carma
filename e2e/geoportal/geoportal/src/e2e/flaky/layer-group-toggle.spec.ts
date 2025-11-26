import { setupAllMocks, mockGeoportalServices } from "@carma-commons/e2e";
import { test, expect } from "@playwright/test";

test.describe("geoportal layer group icon", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context);
    await mockGeoportalServices(context);
    await page.goto("/");
  });

  test("Toggle visibility of layer group button", async ({ page }) => {
    const btn = page.locator("#layer-karte").getByRole("button");
    const slider = page.getByText("Transparenz:");
    await expect(slider).toHaveCount(0);

    await expect(btn).toBeVisible();

    await btn.click();
    await expect(slider).toBeVisible();

    await btn.click();
    await expect(slider).toHaveCount(0);
  });
});
