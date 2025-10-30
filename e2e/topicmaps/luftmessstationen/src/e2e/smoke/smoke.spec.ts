import { test } from "@playwright/test";
import {
  runMapSmokeTest,
  setupSmokeTest,
  setupAllMocks,
} from "@carma-commons/e2e";
const BLANK_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+8V/8AAAAASUVORK5CYII=";

test.describe("luftmessstationen smoke test", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context, [
      "bezirke",
      "quartiere",
      "kitas",
      "pois",
      "no2",
      "no2.data",
      "umweltzonen",
    ]);

    await context.route(
      "https://topicmaps-wuppertal.github.io/luftmessstationen/img/*",
      (route) => {
        route.fulfill({
          status: 200,
          contentType: "image/png",
          body: Buffer.from(BLANK_PNG, "base64").toString("binary"),
        });
      }
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
