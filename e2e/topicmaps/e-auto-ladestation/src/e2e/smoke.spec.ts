import { test } from "@playwright/test";
import { runMapSmokeTest, setupSmokeTest } from "@carma/pw-helper";

test.describe("e-auto-ladestation smoke test", () => {
  test.beforeEach(async ({ page }) => {
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
