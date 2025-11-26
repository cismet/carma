import { setupAllMocks, mockGeoportalServices } from "@carma-commons/e2e";
import { test, expect } from "@playwright/test";

test.describe("geoportal fuzzy search test", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context);
    // await mockGeoportalServices(context);
    // ---- Log browser console to CI output ----
    // page.on("console", (msg) => {
    //   console.log(`[browser:${msg.type()}] ${msg.text()}`);
    // });

    // ---- Log ALL requests/responses to help spot wrong patterns ----
    // page.on("request", (r) => console.log("[req]", r.method(), r.url()));
    // page.on("response", async (r) =>
    //   console.log("[res]", r.status(), r.url())
    // );

    // Mock the additionalLayerConfig.json endpoint
    await context.route("**/data/additionalLayerConfig.json*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      })
    );

    await context.route("https://wupp-3d-data.cismet.de/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      })
    );

    await context.route("https://cesium-wupp-terrain.cismet.de/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      })
    );

    await context.route("https://wupptomo.cismet.de/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      })
    );

    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("Map loads with key controls and buttons", async ({ page }) => {
    const searchInput = page.locator(".ant-select-selection-search-input");
    await expect(searchInput).toBeVisible();

    await searchInput.click();
    // Use keyboard.type so AntD AutoComplete gets key events (triggers onSearch reliably)
    await page.keyboard.type("A", { delay: 20 });

    // Retry briefly in case Fuse index/gaz data is still initializing in CI
    await expect
      .poll(
        async () => {
          const dropdownCount = await page
            .locator(".fuzzy-dropdownwrapper")
            .count();
          if (dropdownCount === 0) {
            // retrigger input to fire onSearch again
            await searchInput.click();
            await page.keyboard.press("Backspace");
            await page.keyboard.type("A", { delay: 20 });
          }
          return dropdownCount;
        },
        { timeout: 15000 }
      )
      .toBeGreaterThan(0);

    await page.waitForSelector(".fuzzy-dropdownwrapper", {
      state: "attached",
      timeout: 15000,
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
