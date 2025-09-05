import { test, expect } from "@playwright/test";
import { setupAllMocks, mockOMTMapHosting } from "@carma-commons/e2e";

test.describe("lagis smoke test", () => {
  let userData: any;

  test.beforeAll(async () => {
    // Load test data from fixtures
    userData = require("../fixtures/devSecrets.json");
  });

  test("main page show map, menu, cards, combo boxes after authorisation", async ({
    page,
    context,
  }) => {
    await setupAllMocks(context);
    await mockOMTMapHosting(context);
    await context.route("https://lagis-api.cismet.de/graphql/LAGIS/execute", route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: "[]",
      })
    );
    // Navigate to the application
    await page.goto("/");
    // Check initial page load
    // await expect(page.locator('text=LagIS')).toBeVisible();

    // Perform authentication
    await page.fill('input[type="email"]', userData.cheatingUser);
    await page.fill('input[type="password"]', userData.cheatingPassword);
    await page.click(".ant-btn");

    // Wait for authentication and page load
    await page.waitForTimeout(5000);

    // Verify authenticated state - check for fuzzy search component
    await expect(page.locator("[data-test-id=fuzzy-search]")).toBeVisible();

    // Check for menu items
    const menuItems = page.locator(".ant-menu-item");
    await expect(menuItems).toHaveCount(9);

    // Check for "Karte" text
    await expect(page.locator("text=Karte")).toBeVisible();

    // Logout
    await page.click(".logout");

    // Verify logout - should see LagIS Desktop
    // await expect(page.locator('text=LagIS Desktop')).toBeVisible();
  });
});
