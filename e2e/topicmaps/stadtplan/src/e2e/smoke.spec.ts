import { test } from "@playwright/test";
import { runMapSmokeTest, setupSmokeTest } from "@carma-commons/e2e";
import { setupAllMocks } from "@carma-commons/e2e";

test.describe("stadtplan smoke test", () => {
  test.beforeEach(async ({context, page }) => {
    await setupAllMocks(context, ["bezirke", "quartiere", 'poi', 'kitas']);


    await context.route("**/v2/data/**/poi.data.json*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            "id": 623,
            "name": "Barmeniapark",
            "stadt": "Wuppertal",
            "info": "Parkanlage",
            "geojson": {
              "type": "Point",
              "crs": {
                "type": "name",
                "properties": {
                  "name": "EPSG:25832"
                }
              },
              "coordinates": [
                371420.692539062,
                5679302.684169922
              ]
            },
            "mainlocationtype": {
              "id": 15,
              "name": "Grünanlagen und Wälder",
              "signatur": "Icon_Parkanlage_farbig.svg",
              "lebenslagen": [
                "Erholung",
                "Freizeit"
              ]
            }
          },
        ]),
      })
    );

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
