import { test, expect } from "@playwright/test";

test.describe("geoportal fuzzy search test", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("Map loads with key controls and buttons", async ({ page }) => {
    const searchInput = page.locator(".ant-select-selection-search-input");
    await expect(searchInput).toBeVisible({ timeout: 30000 });

    await searchInput.click();
    await searchInput.fill("achenbachter");

    await page.waitForSelector(".fuzzy-dropdownwrapper", {
      state: "attached",
      timeout: 10000,
    });

    const dropdown = page.locator(".fuzzy-dropdownwrapper");
    await expect(dropdown).toBeVisible({ timeout: 20000 });

    const option = page.getByText("Achenbachtreppe", { exact: true });
    await expect(option).toBeVisible({ timeout: 10000 });
    await option.click();

    await expect(dropdown).not.toBeVisible();
  });
});
