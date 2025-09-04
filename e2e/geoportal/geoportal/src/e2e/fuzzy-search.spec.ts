import {  setupAllMocks } from "@carma-commons/e2e";
import { test, expect } from "@playwright/test";

test.describe("geoportal fuzzy search test", () => {
  test.beforeEach(async ({ context, page }) => {

    await setupAllMocks(context);

    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("Map loads with key controls and buttons", async ({ page }) => {
    const searchInput = page.locator(".ant-select-selection-search-input");
    await expect(searchInput).toBeVisible();

    await searchInput.click();
    await searchInput.fill("A");

    await page.waitForSelector(".fuzzy-dropdownwrapper", {
      state: "attached",
      timeout: 10000,
    });
    const dropdown = page.locator(".fuzzy-dropdownwrapper");
    await expect(dropdown).toBeVisible();

    await expect(
      page.getByText("Achenbachstr. 1", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText("Achenbachstr. 9", { exact: true })
    ).toBeVisible();

    await page.getByText("Achenbachstr. 1", { exact: true }).click();
    await expect(dropdown).not.toBeVisible();
  });
});
