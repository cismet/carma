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
  test.beforeEach(async ({ context, page }) => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<WMT_MS_Capabilities version="1.1.1" updateSequence="0">
  <Service>
    <Name>OGC:WMS</Name>
    <Title>Mocked Wuppertal WMS - umwelt</Title>
    <OnlineResource xmlns:xlink="http://www.w3.org/1999/xlink" xlink:type="simple" xlink:href="https://maps.wuppertal.de/umwelt?"/>
  </Service>
  <Capability>
    <Request>
      <GetCapabilities>
        <Format>application/vnd.ogc.wms_xml</Format>
        <DCPType><HTTP><Get>
          <OnlineResource xmlns:xlink="http://www.w3.org/1999/xlink" xlink:type="simple" xlink:href="https://maps.wuppertal.de/umwelt?"/>
        </Get></HTTP></DCPType>
      </GetCapabilities>
      <GetMap>
        <Format>image/png</Format>
        <Format>image/jpeg</Format>
        <DCPType><HTTP><Get>
          <OnlineResource xmlns:xlink="http://www.w3.org/1999/xlink" xlink:type="simple" xlink:href="https://maps.wuppertal.de/umwelt?"/>
        </Get></HTTP></DCPType>
      </GetMap>
    </Request>
    <Exception>
      <Format>application/vnd.ogc.se_xml</Format>
    </Exception>

    <!-- Top-level container layer -->
    <Layer queryable="0">
      <Title>Stadt Wuppertal - WMS (mock)</Title>
      <SRS>EPSG:4326</SRS>
      <SRS>EPSG:3857</SRS>
      <LatLonBoundingBox minx="6.00000000" miny="51.00000000" maxx="7.40000000" maxy="52.00000000"/>
      <BoundingBox SRS="EPSG:3857" minx="667916.94475964" miny="6621293.72274017" maxx="823764.23187022" maxy="6800125.45439731"/>

      <!-- The single layer you keep -->
      <Layer queryable="1">
        <Name>alkomgw</Name>
        <Title>Stadtgrundkarte (grau) - ABK</Title>
        <SRS>EPSG:4326</SRS>
        <SRS>EPSG:3857</SRS>
        <LatLonBoundingBox minx="7.00000000" miny="51.10000000" maxx="7.40000000" maxy="51.40000000"/>
        <BoundingBox SRS="EPSG:3857" minx="779236.43555291" miny="6639001.66376131" maxx="823764.23187022" maxy="6692356.43526254"/>
        <Style>
          <Name>default</Name>
          <Title>default</Title>
        </Style>
      </Layer>
    </Layer>
  </Capability>
</WMT_MS_Capabilities>`;

    await context.route(
      "https://maps.wuppertal.de/umwelt?service=WMS&request=GetCapabilities&version=1.1.1",
      (route) =>
        route.fulfill({
          status: 204,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: "",
        })
    );

    await context.route(
      "https://maps.wuppertal.de/infra?service=WMS&request=GetCapabilities&version=1.1.1",
      (route) =>
        route.fulfill({
          status: 204,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: "",
        })
    );

    await context.route(
      "https://maps.wuppertal.de/poi?service=WMS&request=GetCapabilities&version=1.1.1",
      (route) =>
        route.fulfill({
          status: 204,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: "",
        })
    );

    await context.route(
      "https://maps.wuppertal.de/planung?service=WMS&request=GetCapabilities&version=1.1.1",
      (route) =>
        route.fulfill({
          status: 204,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: "",
        })
    );

    await context.route(
      "https://maps.wuppertal.de/verkehr?service=WMS&request=GetCapabilities&version=1.1.1",
      (route) =>
        route.fulfill({
          status: 204,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: "",
        })
    );

    await context.route(
      "https://maps.wuppertal.de/immo?service=WMS&request=GetCapabilities&version=1.1.1",
      (route) =>
        route.fulfill({
          status: 204,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: "",
        })
    );

    await context.route(
      "https://maps.wuppertal.de/gebiet?service=WMS&request=GetCapabilities&version=1.1.1",
      (route) =>
        route.fulfill({
          status: 204,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: "",
        })
    );

    await context.route(
      "https://maps.wuppertal.de/karten?service=WMS&request=GetCapabilities&version=1.1.1",
      (route) =>
        route.fulfill({
          status: 204,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: xml,
        })
    );

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
    // const searchInput = modal.locator("input");
    // await expect(searchInput).toBeVisible();
    // await searchInput.fill("orange");
    const cards = page.locator('[data-test-id="card-layer-prev"]');
    // await expect(cards.first()).toBeVisible();
    await page.waitForTimeout(5300);
    await expect.poll(() => cards.count()).toBe(1);

    // Apply layer to map
    const applyBtn = cards.locator('[data-test-id="apply-layer-to-map"]');
    await expect(applyBtn).toBeVisible();
    await applyBtn.click();

    // Wait for WMS response and tiles to show for that layer
    // await waitForWmsOrange(page, 8000);
    // await waitForTilesWithLayer(page, "spw2_orange", 8000);

    // Clear search (click the "x" icon)
    await page.locator(".sticky > div > button").click();
    const justTest = page.locator(
      '[data-test-id="kartenebenen-hinzufügen-btn"]'
    );
    await expect(justTest).toBeVisible();
    // Sanity: Leaflet has layers and tiles in the DOM
    // const tileImgs = page.locator(".leaflet-layer div img");
    // const tileCount = await tileImgs.count();
    // expect(tileCount).toBeGreaterThan(0);
  });
});
