import { test, expect } from "@playwright/test";

const mockedAdressen = [
  {
    s: "Achenbachstr.",
    nr: 1,
    z: "",
    g: "home",
    x: 793007.83,
    y: 6668501.93,
    m: { zl: 18 },
  },
  {
    s: "Achenbachstr.",
    nr: 9,
    z: "",
    g: "home",
    x: 793053.3,
    y: 6668415.06,
    m: { zl: 18 },
  },
  {
    s: "Achenbachtreppe",
    nr: 0,
    z: "",
    g: "road",
    x: 793022.68,
    y: 6668515.97,
    m: { zl: 18 },
  },
];

test.describe("geoportal fuzzy search test", () => {
  test.beforeEach(async ({ context, page }) => {
    // 1) Mock ONLY addresses with mockedAdressen
    await context.route("**/v2/data/**/adressen.json*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockedAdressen),
      })
    );

    // 2) Keep other datasets empty so they don't add extra suggestions
    for (const name of ["bezirke", "quartiere", "pois", "kitas"]) {
      await context.route(`**/v2/data/**/${name}.json*`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "[]",
        })
      );
    }

    const BLANK_PNG =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+8V/8AAAAASUVORK5CYII=";

    await context.route(/GetMap|SERVICE=WMS/i, (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(BLANK_PNG, "base64"),
      })
    );

    // Raster tiles
    await context.route(/\/tiles\/.+\.(png|jpg|jpeg|webp)(\?.*)?$/i, (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(BLANK_PNG, "base64"),
      })
    );

    // Vector tiles (MVT): no content is valid and fast
    await context.route(/\.(pbf)(\?.*)?$/i, (route) =>
      route.fulfill({
        status: 204,
        contentType: "application/x-protobuf",
        body: "",
      })
    );

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
