import { test, expect } from "@playwright/test";
import { setupAllMocks, mockOMTMapHosting } from "@carma-commons/e2e";

test.describe("verkehrszeichenkataster smoke test", () => {
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
    await setupAllMocks(context);
    await mockOMTMapHosting(context);
    await context.route("https://wunda-cloud.cismet.de/wunda/api/graphql/WUNDA_BLAU/execute", route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: "[]",
      })
    );

    await context.route("https://unpkg.com/@excalidraw/excalidraw@0.17.6/dist/excalidraw-assets-dev/vendor-39727f4653a274cf18f6.js", route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: "[]",
      })
    );

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
