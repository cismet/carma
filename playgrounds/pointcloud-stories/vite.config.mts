/// <reference types="vitest" />
import { basename, resolve } from "node:path";

import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

import { serveRangeDataFile } from "./vite-range-data";

const COPC_FILES = new Map<string, string>([
  [
    "awg-2-segmentierung-mesh2024-ao-v1-c7b7ccc83cb8.copc.laz",
    "awg-2-segmentierung.copc.laz",
  ],
  [
    "kaiser-wilhelm-hain-rgb-mesh2024-ao-v1-084aca0cfdcf.copc.laz",
    "kaiser-wilhelm-hain-rgb.copc.laz",
  ],
  [
    "wuppertal-oelberg-mls-2025-09-11-mesh2024-ao-v1-8a2e89b90856.copc.laz",
    "wuppertal-oelberg-mls-2025-09-11.copc.laz",
  ],
  [
    "nordbahntrasse-2025-12-segments-mesh2024-ao-v1-48badd4f8e68.copc.laz",
    "nordbahntrasse-2025-12-segments.copc.laz",
  ],
]);
const GEORADAR_VOLUME_FILES = new Set([
  "capture-026-10m.json",
  "capture-026-10m-noise-gated.r16",
  "capture-026-10m-noise-gated.u10",
  "capture-026-10m.r16",
  "capture-026-5x10m.json",
  "capture-026-5x10m.r16",
  "capture-026-11x10m.json",
  "capture-026-11x10m.r16",
  "capture-026-21x10m.json",
  "capture-026-21x10m.r16",
  "capture-026-27x10m.json",
  "capture-026-27x10m.r16",
]);
const localInvestigationData = (
  pointcloudRoot: string,
  georadarVolumeRoot: string,
  georadarMdioRoot: string,
  georadarSurveyRoot: string,
  capture026SceneRoot: string,
  nivControlPointRoot: string,
  fraunhoferRoot: string,
  pointcloudTilesetRoot: string
): Plugin => {
  const fraunhoferGeoJsonFiles = new Map([
    [
      "all_vegetation.geojson",
      resolve(fraunhoferRoot, "00000_00500m/Polygone/all_vegetation.geojson"),
    ],
  ]);

  return {
    name: "pointcloud-local-investigation-data",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = decodeURIComponent(
          new URL(request.url ?? "/", "http://localhost").pathname
        );
        const fileName = basename(pathname);
        const localCopcFileName = COPC_FILES.get(fileName);

        try {
          if (
            pathname.startsWith("/pointclouds/") &&
            localCopcFileName
          ) {
            serveRangeDataFile(
              request,
              response,
              resolve(pointcloudRoot, localCopcFileName)
            );
            return;
          }

          if (
            pathname.startsWith("/georadar-volume/") &&
            GEORADAR_VOLUME_FILES.has(fileName)
          ) {
            serveRangeDataFile(
              request,
              response,
              resolve(georadarVolumeRoot, fileName)
            );
            return;
          }

          const georadarMdioMatch = pathname.match(
            /^\/georadar-mdio\/(capture-\d{3}(?:-\d+x10m)?\.mdio\/(?:zarr\.json|(?:amplitude|slice_m|trace_m|depth_m|horizontal_component|basis_axis|enu_component|anchor_horizontal_m|basis_frd_enu|elevation_offset_m|pose_status)\/(?:zarr\.json|c(?:\/\d+){1,3})))$/
          );
          if (georadarMdioMatch) {
            serveRangeDataFile(
              request,
              response,
              resolve(georadarMdioRoot, georadarMdioMatch[1])
            );
            return;
          }

          if (
            /^\/georadar-survey\/(?:survey|capture-\d{3}(?:-scene)?)\.(?:json|r16)$/.test(
              pathname
            )
          ) {
            serveRangeDataFile(
              request,
              response,
              resolve(georadarSurveyRoot, fileName)
            );
            return;
          }

          if (pathname === "/niv-control-points/niv-points-ecef.json") {
            serveRangeDataFile(
              request,
              response,
              resolve(nivControlPointRoot, "niv-points-ecef.json")
            );
            return;
          }

          const captureSceneMatch = pathname.match(
            /^\/capture-026-scene\/(capture-026-scene(?:-(?:11|21|27)x10m)?\.json|image-textures\.json|planar-[23]\/sideview_\d+_\d+\.jpg|image-(?:display|previews)\/(?:planar-[23]|panorama)\/[A-Za-z0-9._-]+\.jpg)$/
          );
          if (captureSceneMatch) {
            serveRangeDataFile(
              request,
              response,
              resolve(capture026SceneRoot, captureSceneMatch[1])
            );
            return;
          }

          // Locally generated 3D Tiles point tilesets (copc-to-3dtiles.mjs)
          // so a tileset can be reviewed before it is published.
          const tilesetMatch = pathname.match(
            /^\/pointcloud-3dtiles\/([A-Za-z0-9._/-]+\.(?:json|glb))$/
          );
          if (tilesetMatch && !tilesetMatch[1].includes("..")) {
            serveRangeDataFile(
              request,
              response,
              resolve(pointcloudTilesetRoot, tilesetMatch[1])
            );
            return;
          }

          if (pathname.startsWith("/fraunhofer-geojson/")) {
            const filePath = fraunhoferGeoJsonFiles.get(fileName);
            if (filePath) {
              serveRangeDataFile(request, response, filePath);
              return;
            }
          }
        } catch (error) {
          response.statusCode = 500;
          response.end(error instanceof Error ? error.message : String(error));
          return;
        }

        next();
      });
    },
  };
};

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, __dirname, "");
  const dataRoot = resolve(
    __dirname,
    environment.POINTCLOUD_DATA_ROOT || ".data"
  );
  const pointcloudRoot = resolve(dataRoot, "derived");
  const georadarVolumeRoot = resolve(pointcloudRoot, "georadar-volume");
  const georadarMdioRoot = resolve(pointcloudRoot, "georadar-mdio");
  const georadarSurveyRoot = resolve(pointcloudRoot, "georadar-survey");
  const capture026SceneRoot = resolve(pointcloudRoot, "capture-026-scene");
  const nivControlPointRoot = resolve(pointcloudRoot, "niv-control-points");
  const fraunhoferRoot = resolve(dataRoot, "source-inputs/nordbahntrasse");
  const pointcloudTilesetRoot = resolve(pointcloudRoot, "pointcloud-3dtiles");

  return {
    root: __dirname,
    cacheDir: "../../node_modules/.vite/playgrounds/pointcloud-stories",
    base: process.env.BASE_URL || "/",
    assetsInclude: ["/sb-preview/runtime.js"],
    server: {
      proxy: {
        "/__wupp_terrain__": {
          target: "https://cesium-wupp-terrain.cismet.de",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/__wupp_terrain__/, ""),
        },
      },
    },
    plugins: [
      react(),
      nxViteTsPaths(),
      localInvestigationData(
        pointcloudRoot,
        georadarVolumeRoot,
        georadarMdioRoot,
        georadarSurveyRoot,
        capture026SceneRoot,
        nivControlPointRoot,
        fraunhoferRoot,
        pointcloudTilesetRoot
      ),
    ],
    // The COPC decode worker (copc-stream.worker.ts) is bundled in a separate
    // Rollup pass that does not inherit the top-level `plugins`. Without
    // nxViteTsPaths here, workspace aliases the worker pulls in transitively
    // (e.g. @carma-geo/proj via copcLoader) fail to resolve in production
    // builds. Vite 5 requires the function form. The worker is created with
    // { type: "module" }, so emit an ES worker bundle.
    worker: {
      format: "es",
      plugins: () => [nxViteTsPaths()],
    },
    build: {
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
  };
});
