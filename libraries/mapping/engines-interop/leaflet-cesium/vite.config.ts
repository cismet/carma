/// <reference types='vitest' />
import * as path from "path";

import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
export default defineConfig({
  root: __dirname,
  cacheDir:
    "../../../../node_modules/.vite/libraries/mapping/engines-interop/leaflet-cesium",

  plugins: [
    nxViteTsPaths(),
    dts({
      entryRoot: "src",
      tsconfigPath: path.join(__dirname, "tsconfig.lib.json"),
    }),
  ],

  build: {
    outDir: "../../../../dist/libraries/mapping/engines-interop/leaflet-cesium",
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    lib: {
      entry: "src/index.ts",
      name: "engines-interop-leaflet-cesium",
      fileName: "index",
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: [],
    },
  },

  test: {
    globals: true,
    cache: {
      dir: "../../../../node_modules/.vitest",
    },
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    reporters: ["default"],
    coverage: {
      reportsDirectory:
        "../../../../coverage/libraries/mapping/engines-interop/leaflet-cesium",
      provider: "v8",
    },
  },
});
