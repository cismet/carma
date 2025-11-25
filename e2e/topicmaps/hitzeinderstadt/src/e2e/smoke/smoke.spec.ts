import { test } from "@playwright/test";

import {
  runMapSmokeTest,
  setupSmokeTest,
  setupAllMocks,
  mockTopicMapData,
  mockOMTMapHosting,
} from "@carma-commons/e2e";

test.describe("hitzeinderstadt smoke test", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context);

    // Mock map style JSON files
    const mockStyleJson = {
      version: 8,
      name: "Mock Style",
      sources: {},
      layers: [],
    };

    await context.route("https://tiles.cismet.de/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockStyleJson),
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
