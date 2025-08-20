import { test } from "@playwright/test";
import { runMapSmokeTest, setupSmokeTest } from "@carma/pw-helper";

test.describe("potenzialflaechen-online smoke test", () => {
  test.beforeEach(async ({ page }) => {
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
