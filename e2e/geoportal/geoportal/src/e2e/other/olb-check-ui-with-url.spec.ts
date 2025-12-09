import { setupAllMocks } from "@carma-commons/e2e";
import { test, expect } from "@playwright/test";

test.describe("Geoportal oblique", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context);

    await context.route(
      "https://wupp-oblique.cismet.de/2024/metadata/fprfc.geojson",
      (route) =>
        route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "FeatureCollection", features: [] }),
        })
    );

    await context.route(
      "https://wupp-oblique.cismet.de/2024/metadata/exterior_orientations_utm32.noNadir.json",
      (route) =>
        route.fulfill({
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify([]),
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
    await context.route(
      "https://wupp-3d-data.cismet.de/mesh2024/**/tileset.json",
      (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            asset: { version: "1.0" },
            geometricError: 500,
            root: {
              boundingVolume: {
                box: [0, 0, 0, 100, 0, 0, 0, 100, 0, 0, 0, 100],
              },
              geometricError: 0,
              children: [],
            },
          }),
        });
      }
    );

    // Mock 3D mesh B3DM files (binary 3D model data)
    await context.route(
      "https://wupp-3d-data.cismet.de/mesh2024/**/*.b3dm",
      (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/octet-stream",
          body: Buffer.alloc(0), // Empty binary mesh data
        });
      }
    );

    // Mock additional config endpoints with empty arrays
    await context.route(
      "https://wupp-digitaltwin-assets.cismet.de/data/additionalLayerConfig.json",
      (route) =>
        route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify([]),
        })
    );

    await context.route(
      "https://wupp-digitaltwin-assets.cismet.de/data/additionalSensorConfig.json",
      (route) =>
        route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify([]),
        })
    );

    // Mock LOD2 tileset
    await context.route(
      "https://wupp-3d-data.cismet.de/lod2/tileset.json",
      (route) =>
        route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            geometricError: 2000,
            root: {
              transform: [
                1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3970031, 499062.90625,
                4950279.5, 1,
              ],
              geometricError: 2000,
              refine: "ADD",
              boundingVolume: {
                region: [
                  0.12226067974737088, 0.8928562784091272, 0.12784253788775005,
                  0.8957448976424668, 98.434, 397.752,
                ],
              },
              content: {
                uri: "content/{level}_{x}_{y}.glb",
              },
              implicitTiling: {
                availableLevels: 7,
                subdivisionScheme: "QUADTREE",
                subtreeLevels: 4,
                subtrees: {
                  uri: "subtrees/{level}_{x}_{y}.subtree",
                },
              },
            },
            asset: {
              generator: "pg2b3dm 2.8.1.0",
              version: "1.1",
            },
          }),
        })
    );

    // Mock Cesium IAU2006_XYS orientation data files
    context.route("**/__cesium__/Assets/IAU2006_XYS/*.json", (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          version: "1.0",
          updated: "2008 Dec 02 20:00:00 UTC",
          interpolationOrder: 9,
          xysAlgorithm: "SOFA_DEL_PSI_EPS",
          sampleZeroJulianEphemerisDate: 2442396.5,
          stepSizeDays: 1,
          startIndex: 0,
          numberOfSamples: 1,
          // Use an array-of-arrays to reflect "one sample with three values"
          samples: [[0.0, 0.0, 0.0]],
        }),
      })
    );

    // Mock Matomo analytics
    await context.route("**/matomo.php*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/gif",
        body: Buffer.alloc(0),
      })
    );

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

    // Helper to verify URL changes after button click ()
    const expectUrlChangeAfterClick = async (
      button: ReturnType<typeof page.locator>,
      buttonName: string
    ) => {
      const urlBefore = page.url();
      await button.click();
      await expect
        .poll(() => page.url(), {
          message: `URL should change after clicking ${buttonName}`,
          timeout: 10000,
        })
        .not.toBe(urlBefore);
    };

    // Test each control button changes the URL
    //await expectUrlChangeAfterClick(rotateRight, "rotateRight");
    //await expectUrlChangeAfterClick(rotateLeft, "rotateLeft");
    // await expectUrlChangeAfterClick(arrowUp, "arrowUp");
    // await expectUrlChangeAfterClick(arrowDown, "arrowDown");
    // await expectUrlChangeAfterClick(arrowLeft, "arrowLeft");
    // await expectUrlChangeAfterClick(arrowRight, "arrowRight");
  });
});
