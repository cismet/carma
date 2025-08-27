import { test, expect } from "@playwright/test";

test.describe("verdis-desktop smoke test", () => {
  let userData: any;

  test.beforeAll(async () => {
    // Load test data from fixtures
    userData = require("../fixtures/devSecrets.json");
  });

  test("main page show map, menu, cards, combo boxes after authorisation", async ({
    page,
  }) => {
    // Navigate to the application
    await page.goto("/");

    // Perform authentication
    await page.locator("#username").fill(userData.cheatingUser);
    await page.fill('input[type="password"]', userData.cheatingPassword);
    await page.click(".ant-btn");

    // Wait for authentication and page load
    await page.waitForTimeout(5000);

    // Verify authenticated state - check for fuzzy search component
    await expect(page.locator("[data-test-id=fuzzy-search]")).toBeVisible();

    // Check for "Karte" text
    await expect(page.locator("text=Karte")).toBeVisible();

    // Logout
    await page.getByRole("img", { name: "logout" }).locator("path").click();
  });
});
