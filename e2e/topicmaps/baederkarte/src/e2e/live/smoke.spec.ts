import { test } from "@playwright/test";

import {
  runMapSmokeTest,
  setupSmokeTest,
  setupAllMocks,
  mockTopicMapData,
} from "@carma-commons/e2e";

test.describe("baederkarte smoke test", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context);

    // Mock baeder data using the universal function
    await mockTopicMapData(context, "baeder", [
      {
        id: 216,
        name: "Freibad Vohwinkel",
        adresse: "Gräfrather Straße 43c",
        stadt: "Wuppertal",
        tel: "+49-202-2791737",
        info: "öffentliches Freibad in Vereinsregie (Förderverein Freibad Vohwinkel e.V.)",
        email: "vorstand@freibad-wuppertal-vohwinkel.de",
        url: "http://www.freibad-wuppertal-vohwinkel.de",
        signatur: "Icon_Freibad_farbig.svg",
        geojson: {
          type: "Point",
          crs: {
            type: "name",
            properties: {
              name: "EPSG:25832",
            },
          },
          coordinates: [365254.600742188, 5676822.244472656],
        },
        mainlocationtype: {
          id: 5,
          name: "Schwimmbäder",
          lebenslagen: ["Freizeit", "Sport"],
        },
        more: {
          typ: "Freibad",
          betreiber: "Verein",
          zugang: "öffentlich",
        },
      },
    ]);
    await setupSmokeTest(page, "/", {
      navigationTimeout: 30000,
      waitForNetworkIdle: true,
    });
  });

  test("map loads with key controls", async ({ page }) => {
    // Run the comprehensive smoke test from the shared library
    await runMapSmokeTest(page, {
      fuzzySearchTimeout: 10000,
      checkZoomControl: true,
      checkFuzzySearch: true,
      checkApplicationMenu: true,
      checkInfoBox: true,
    });
  });
});
