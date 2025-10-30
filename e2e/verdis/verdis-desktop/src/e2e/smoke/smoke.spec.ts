import { test, expect } from "@playwright/test";
import { setupAllMocks } from "@carma-commons/e2e";

test.describe("verdis-desktop smoke test", () => {
  test("main page show map, menu, cards, combo boxes after authorisation", async ({
    page,
    context,
  }) => {
    // Navigate to the application
    await setupAllMocks(context);
    await context.route(
      "https://wunda-api.cismet.de/configattributes/virtualcitymap_secret",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "{}",
        })
    );

    await context.route("**/*.md5", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/plain", // fine even if server uses octet-stream
        body: "0123456789abcdef0123456789abcdef",
      });
    });

    await context.route(
      "https://verdis-api.cismet.de/graphql/VERDIS_GRUNDIS/execute",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "[]",
        })
    );

    await context.route(
      "https://wunda-api.cismet.de/graphql/WUNDA_BLAU/execute",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "[]",
        })
    );

    await context.route("https://verdis-api.cismet.de/users", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: "cismet",
          domain: "VERDIS_GRUNDIS",
          jwt: "0000000",
          passHash: "0000000",
          userGroups: ["VORN_schreiben_KA_cismet", "VORN_schreiben_KA"],
        }),
      })
    );

    await page.goto("/");

    // Perform authentication
    await page.locator("#username").fill("cismet");
    await page.fill('input[type="password"]', "cismet");
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
