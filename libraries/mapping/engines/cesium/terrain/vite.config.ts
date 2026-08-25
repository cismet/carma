/// <reference types="vitest" />
import * as path from "path";

import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  root: __dirname,
  cacheDir:
    "../../../../../node_modules/.vite/libraries/mapping/engines/cesium/terrain",
  plugins: [
    nxViteTsPaths(),
    dts({
      entryRoot: "src",
      tsconfigPath: path.join(__dirname, "tsconfig.lib.json"),
    }),
  ],
  build: {
    outDir: "../../../../../dist/libraries/mapping/engines/cesium/terrain",
    emptyOutDir: true,
    reportCompressedSize: true,
    lib: {
      entry: "src/index.ts",
      name: "carma-cesium-terrain",
      fileName: "index",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["@carma-cesium"],
    },
  },
  test: {
    watch: false,
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    reporters: ["default"],
    coverage: {
      reportsDirectory:
        "../../../../../coverage/libraries/mapping/engines/cesium/terrain",
      provider: "v8",
    },
  },
});
