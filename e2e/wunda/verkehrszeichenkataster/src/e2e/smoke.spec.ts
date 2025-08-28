import { test, expect } from "@playwright/test";

test.describe("verkehrszeichenkataster smoke test", () => {
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

    // Check for "Karte" text
    await expect(page.locator("text=Karte")).toBeVisible();

    // Logout - the button has the image/SVG element, .locator("path") looks for a child element <path> inside it
    await page.getByRole("img", { name: "logout" }).locator("path").click();
  });
});
