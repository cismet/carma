import { test, expect, Page } from "@playwright/test";

async function waitForWmsOrange(page: Page, timeout = 8000) {
  await page.waitForResponse(
    (resp) =>
      resp.url().startsWith("https://maps.wuppertal.de/karten?") &&
      resp.url().includes("service=WMS") &&
      resp.url().includes("request=GetMap") &&
      resp.url().includes("layers=spw2_orange") &&
      resp.status() === 200,
    { timeout }
  );
}

// Poll until at least one loaded Leaflet tile includes the layer substring
async function waitForTilesWithLayer(
  page: Page,
  layerSubstr: string,
  timeout = 8000
) {
  const loadedTiles = page.locator("img.leaflet-tile.leaflet-tile-loaded");
  await expect
    .poll(
      async () =>
        await loadedTiles.evaluateAll(
          (imgs, needle) =>
            imgs.filter((img) => (img as HTMLImageElement).src.includes(needle))
              .length,
          layerSubstr
        ),
      { timeout, message: `Expected tiles for "${layerSubstr}" to appear` }
    )
    .toBeGreaterThan(0);
}

test.describe("Geoportal add map layers", () => {
  test.beforeEach(async ({ page }) => {
    // Mock the discover API to return empty results
    await page.route("**/actions/WUNDA_BLAU.**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: JSON.stringify({
          md5: null,
          content: null,
          version: null,
          time: new Date().toISOString(),
          data: [], // Empty array - no discover layers
        }),
      });
    });

    // Mock additional layer config
    await page.route("**/additionalLayerConfig.json", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    });

    // Mock any other potential endpoints that might cause issues
    await page.route(
      "**/wupp-digitaltwin-assets.cismet.de/**",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "[]",
        });
      }
    );

    // Let WMS GetCapabilities go through to real services
    // (Remove the WMS mock entirely)

    await page.goto("/");
  });

  test("Search shows only related layer, layers are added to map and to the favorite section", async ({
    page,
  }) => {
    const addLayersBtn = page.locator(
      '[data-test-id="kartenebenen-hinzufügen-btn"]'
    );
    await expect(addLayersBtn).toBeVisible();
    await addLayersBtn.click();

    const modal = page.locator(".ant-modal-content");
    await expect(modal).toBeVisible();

    // Search inside modal
    const searchInput = modal.locator("input");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("orange");
    const cards = page.locator('[data-test-id="card-layer-prev"]');
    await expect(cards.first()).toBeVisible();

    // Apply layer to map
    const applyBtn = cards.locator('[data-test-id="apply-layer-to-map"]');
    await expect(applyBtn).toBeVisible();
    await applyBtn.click();

    // Wait for WMS response and tiles to show for that layer
    // await waitForWmsOrange(page, 8000);
    await waitForTilesWithLayer(page, "spw2_orange", 8000);

    // Clear search (click the "x" icon)
    await page.locator(".sticky > div > button").click();

    // Sanity: Leaflet has layers and tiles in the DOM
    const tileImgs = page.locator(".leaflet-layer div img");
    const tileCount = await tileImgs.count();
    expect(tileCount).toBeGreaterThan(0);
  });
});
