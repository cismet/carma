import fs from "fs";
import path from "path";
import {
  setupAllMocks,
  mockGeoportalServices,
  mockObliqueServices,
} from "@carma-commons/e2e";
import { test, expect } from "@playwright/test";

test.describe("Geoportal oblique", () => {
  test.beforeEach(async ({ context, page }) => {
    test.slow();
    await setupAllMocks(context);
    // await mockGeoportalServices(context);
    const filePath = path.resolve(__dirname, "../../test-data/fprfc.geojson");
    const body = fs.readFileSync(filePath, "utf8");
    const samplePath = path.resolve(
      __dirname,
      "../../test-data/exterior_orientations_sample.json"
    );
    const sample = fs.readFileSync(samplePath, "utf8");

    await context.route("**/2024/metadata/fprfc.geojson", (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "application/geo+json; charset=utf-8" },
        body,
      })
    );

    await context.route(
      "**/2024/metadata/exterior_orientations_utm32.noNadir.json",
      (route) =>
        route.fulfill({
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
          body: sample,
        })
    );

    // Mock only specific terrain requests to avoid overriding oblique images
    await context.route(
      "https://cesium-wupp-terrain.cismet.de/terrain2020/**",
      (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/octet-stream",
          body: Buffer.alloc(0), // Empty terrain data
        });
      }
    );
    await context.route(
      "https://cesium-wupp-terrain.cismet.de/dom_2024_1m/layer.json",
      (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/octet-stream",
          body: Buffer.alloc(0), // Empty terrain data
        });
      }
    );

    // Mock 3D mesh tileset JSON files
    // await context.route(
    //   "https://wupp-3d-data.cismet.de/mesh2024/**/tileset.json",
    //   (route) => {
    //     console.log("🏗️ Mesh Tileset JSON:", route.request().url());
    //     route.fulfill({
    //       status: 200,
    //       contentType: "application/json",
    //       body: JSON.stringify({
    //         asset: { version: "1.0" },
    //         geometricError: 500,
    //         root: {
    //           boundingVolume: {
    //             box: [0, 0, 0, 100, 0, 0, 0, 100, 0, 0, 0, 100],
    //           },
    //           geometricError: 0,
    //           children: [],
    //         },
    //       }),
    //     });
    //   }
    // );

    // Mock 3D mesh B3DM files (binary 3D model data)
    // await context.route(
    //   "https://wupp-3d-data.cismet.de/mesh2024/**/*.b3dm",
    //   (route) => {
    //     console.log("🏭 Mesh B3DM File:", route.request().url());
    //     route.fulfill({
    //       status: 200,
    //       contentType: "application/octet-stream",
    //       body: Buffer.alloc(0), // Empty binary mesh data
    //     });
    //   }
    // );

    // await mockGeoportalServices(context);
    // await mockObliqueServices(context);
    // Mock Cesium IAU2006_XYS orientation data files
    // context.route("**/__cesium__/Assets/IAU2006_XYS/*.json", (route) =>
    //   route.fulfill({
    //     status: 200,
    //     headers: { "content-type": "application/json; charset=utf-8" },
    //     body: JSON.stringify({
    //       version: "1.0",
    //       updated: "2008 Dec 02 20:00:00 UTC",
    //       interpolationOrder: 9,
    //       xysAlgorithm: "SOFA_DEL_PSI_EPS",
    //       sampleZeroJulianEphemerisDate: 2442396.5,
    //       stepSizeDays: 1,
    //       startIndex: 0,
    //       numberOfSamples: 1,
    //       // Use an array-of-arrays to reflect "one sample with three values"
    //       samples: [[0.0, 0.0, 0.0]],
    //     }),
    //   })
    // );

    // Mock Cesium approximateTerrainHeights.json - used for terrain height estimation
    // Returns minimal valid data structure with a few sample tiles
    context.route(
      "**/__cesium__/Assets/approximateTerrainHeights.json",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            "6-0-0": [-60.9, 1359.39],
            "6-0-1": [-734.16, 2871.77],
            "6-1-0": [-100, 500],
            "6-1-1": [-200, 600],
          }),
        })
    ),
      await page.goto(
        "/#/?lat=51.2527066&lng=7.2051585&h=925.81&heading=324.58&pitch=311.88&fov=40.76&m=1&ff=oblq&is3d=1"
      );
  });

  test("All UI controls are displayed", async ({ page }) => {
    const luftBuild = page.getByText("Luftbild");
    await expect(luftBuild).toBeVisible();
    const oblModeButton = page.locator(".ant-btn").first();
    await expect(oblModeButton).toBeVisible();
    await oblModeButton.click();

    // Rotate controls
    const rotateLeft = page
      .locator("#mapContainer")
      .getByRole("button")
      .filter({ hasText: /^$/ })
      .first();
    await expect(rotateLeft).toBeVisible();
    // await rotateLeft.click();
    const rotateRight = page
      .locator("#mapContainer")
      .getByRole("button")
      .filter({ hasText: /^$/ })
      .nth(1);
    await expect(rotateRight).toBeVisible();
    const arrowUp = page.getByRole("button", { name: "↑" });
    await expect(arrowUp).toBeVisible();
    const arrowDown = page.getByRole("button", { name: "↓" });
    await expect(arrowDown).toBeVisible();

    const arrowLeft = page.getByRole("button", { name: "←" });
    await expect(arrowLeft).toBeVisible();
    const arrowRight = page.getByRole("button", { name: "→" });
    await expect(arrowRight).toBeVisible();

    // const url1 = page.url();
    await rotateRight.click();
    // await expect(async () => {
    //   const url2 = page.url();
    //   expect(url2).not.toBe(url1);
    // }).toPass({ timeout: 10000 });

    // Action buttons
    const flightToImg = page.getByText("Flug zum Bild");
    await expect(flightToImg).toBeVisible();
    const openImage = page.getByRole("button", { name: "Bild öffnen" });
    await expect(openImage).toBeVisible();
    const downloadImage = page.getByRole("button", { name: "Herunterladen" });
    await expect(downloadImage).toBeVisible();
    const feedback = page.getByRole("button", { name: "Rückmeldung" });
    await expect(feedback).toBeVisible();

    // Wait for URL to change (indicates rotation completed)
    // await page.waitForURL((url) => url.toString() !== url1, {
    //   timeout: 10000,
    // });
    // const url2 = page.url();
    // expect(url2).not.toBe(url1);

    // const urlTwo = page.url();
    // await rotateLeft.click();
    // await expect(async () => {
    //   const url3 = page.url();
    //   expect(url3).not.toBe(urlTwo);
    // }).toPass({ timeout: 10000 });

    // const urlThree = page.url();
    // await arrowUp.click();
    // await expect(async () => {
    //   const url4 = page.url();
    //   expect(url4).not.toBe(urlThree);
    // }).toPass({ timeout: 10000 });
  });
});
