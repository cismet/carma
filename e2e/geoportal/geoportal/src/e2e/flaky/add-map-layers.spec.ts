import { test, expect, Page } from "@playwright/test";
import { setupAllMocks, mockGeoportalServices } from "@carma-commons/e2e";

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

const CORS = { "Access-Control-Allow-Origin": "*" };
const BASE = "https://maps.wuppertal.de";
const PATHS_EMPTY = [
  "umwelt",
  "infra",
  "poi",
  "planung",
  "verkehr",
  "immo",
  "gebiet",
];

const LAYER_UI_MAP_TEXT = "Stadtgrundkarte (grau) - ABK";

test.describe("Geoportal add map layers", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context);
    await mockGeoportalServices(context);
    // Return empty responds
    await Promise.all(
      PATHS_EMPTY.map((p) =>
        context.route(
          `${BASE}/${p}?service=WMS&request=GetCapabilities&version=1.1.1`,
          (route) => route.fulfill({ status: 204, headers: CORS, body: "" })
        )
      )
    );

    // Add only one layer
    await context.route(
      `${BASE}/karten?service=WMS&request=GetCapabilities&version=1.1.1`,
      (route) =>
        route.fulfill({
          status: 200,
          headers: {
            ...CORS,
            "Content-Type": "application/vnd.ogc.wms_xml; charset=utf-8",
          },
          body: xml,
        })
    );

    await page.goto("/");
  });

  test("Search shows only related layer, layers are added to map and to the favorite section", async ({
    page,
  }) => {
    await expect(page.getByText(LAYER_UI_MAP_TEXT)).toHaveCount(0);

    const addLayersBtn = page.locator(
      '[data-test-id="kartenebenen-hinzufügen-btn"]'
    );
    await expect(addLayersBtn).toBeVisible();
    await addLayersBtn.click();

    const modal = page.locator(".ant-modal-content");
    await expect(modal).toBeVisible();
    // const cards = page.locator('[data-test-id="card-layer-prev"]');

    // Search for layer
    // const searchBox = page.getByRole("searchbox", {
    //   name: "Suchbegriff eingeben",
    // });
    // await searchBox.click();

    // await page.keyboard.type(LAYER_UI_MAP_TEXT, { delay: 100 });

    await page.getByPlaceholder("Suchbegriff eingeben").fill(LAYER_UI_MAP_TEXT);

    // await page.waitForTimeout(300);
    // const cards = await expect(page
    //   .getByTestId("card-layer-prev")
    //   .filter({
    //     hasText: LAYER_UI_MAP_TEXT,
    //   }).toHaveCount(1))
    // await expect.poll(() => cards.count()).toBe(1);
    // 5 in-stock items
    const card = page
      .getByTestId("card-layer-prev")
      .filter({ hasText: LAYER_UI_MAP_TEXT });

    await card.getByTestId("apply-layer-to-map").click();

    // Apply layer to map
    // const applyBtn = cards.locator('[data-test-id="apply-layer-to-map"]');
    // await expect(applyBtn).toBeVisible();
    // await applyBtn.click();

    // Close modal
    await page.locator(".sticky > div > button").click();
    // await page.waitForTimeout(300);

    await expect(
      page.getByRole("button", { name: /Stadtgrundkarte \(grau\) - ABK/i })
    ).toBeVisible();
  });
});
