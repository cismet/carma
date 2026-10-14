import { test } from "@playwright/test";
import {
  runMapSmokeTest,
  setupSmokeTest,
  setupAllMocks,
  mockAdditionalData,
} from "@carma-commons/e2e";

test.describe("stadtplan smoke test", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context, [
      "bezirke",
      "quartiere",
      "poi",
      "kitas",
      "pois",
    ]);

    // Mock the POI GeoJSON the MapLibre layer loads (shape of tiles.cismet.de/poi/poi.json)
    await mockAdditionalData(context, "**/poi/poi.json*", {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [7.157583, 51.250573],
          },
          properties: {
            id: 623,
            geographicidentifier: "Barmeniapark",
            info: "Parkanlage",
            kombi: "Erholung, Freizeit",
            signatur: "park",
            schrift: "#638555",
          },
        },
      ],
    });

    // also answers the .md5 request of md5FetchJSON
    await mockAdditionalData(context, "**/data/poi.farben.json*", {});

    await setupSmokeTest(page, "/", {
      navigationTimeout: 30000,
      waitForNetworkIdle: true,
    });
  });

  test("map loads with key controls", async ({ page }) => {
    // Run the comprehensive smoke test from the shared library
    // No welcome infobox: the MapLibre topicmap only shows an infobox for a
    // selected feature.
    await runMapSmokeTest(page, {
      fuzzySearchTimeout: 10000,
      checkZoomControl: true,
      checkFuzzySearch: true,
      checkApplicationMenu: true,
      checkInfoBox: false,
    });
  });
});
