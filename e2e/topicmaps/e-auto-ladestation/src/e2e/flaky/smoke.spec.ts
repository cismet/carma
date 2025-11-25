import { test } from "@playwright/test";
import {
  runMapSmokeTest,
  setupSmokeTest,
  setupAllMocks,
  mockAdditionalData,
} from "@carma-commons/e2e";

test.describe("e-auto-ladestation smoke test", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context, [
      "bezirke",
      "quartiere",
      "poi",
      "kitas",
      "pois",
      "emob",
      "emob.data",
    ]);
    await mockAdditionalData(context, "**/data/poi.farben.json*", []);
    await setupSmokeTest(page, "/", {
      navigationTimeout: 30000,
      waitForNetworkIdle: true,
    });
  });

  test("map loads with key controls", async ({ page }) => {
    await runMapSmokeTest(page, {
      fuzzySearchTimeout: 10000,
      checkZoomControl: true,
      checkFuzzySearch: true,
      checkApplicationMenu: true,
      checkInfoBox: true,
    });
  });
});
