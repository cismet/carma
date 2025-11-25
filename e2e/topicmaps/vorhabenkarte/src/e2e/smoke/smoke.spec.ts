import { test } from "@playwright/test";

import {
  runMapSmokeTest,
  setupSmokeTest,
  setupAllMocks,
  mockTopicMapData,
  mockOMTMapHosting,
} from "@carma-commons/e2e";

test.describe("vorhabenkarte smoke test", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context, [
      "bezirke",
      "quartiere",
      "pois",
      "kitas",
      "vorhabenkarte",
      "vorhabenkarte.data",
    ]);

    // Mock vorhabenkarte data with one item that will transform into feature
    await mockTopicMapData(context, "vorhabenkarte", [
      {
        id: 1,
        titel: "Neubau Grundschule Elberfeld",
        beschreibung:
          "Neubau einer dreizügigen Grundschule mit Turnhalle und Außenanlagen",
        thema: {
          id: 1,
          name: "Bildung",
          farbe: "#2E8B57",
          signatur: "Icon_Stadtentwicklung_Sicherheit.svg",
        },
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
        kontakt: {
          telefon: "+49-202-563-0",
          mail: "info@wuppertal.de",
        },
        buergerbeteiligung: true,
        abgeschlossen: false,
        stadtweit: false,
        letzte_aktualisierung: "2024-01-15T10:30:00Z",
        fotos: [],
        links: [],
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
