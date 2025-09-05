import { test, expect } from "@playwright/test";
import { setupAllMocks } from "@carma-commons/e2e";

test.describe("verdis-desktop smoke test", () => {
  let userData: any;

  test.beforeAll(async () => {
    // Load test data from fixtures
    userData = require("../fixtures/devSecrets.json");
  });

  test("main page show map, menu, cards, combo boxes after authorisation", async ({
    page,
    context,
  }) => {
    // Navigate to the application
    await page.goto("/");
    await setupAllMocks(context);
    await context.route("https://wunda-api.cismet.de/configattributes/virtualcitymap_secret", route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: "{}",
      })
    );
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
