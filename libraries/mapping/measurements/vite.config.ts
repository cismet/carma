/// <reference types='vitest' />
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import * as path from "path";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";

export default defineConfig({
  root: __dirname,
  cacheDir: "../../../node_modules/.vite/libraries/mapping/measurements",

  plugins: [
    nxViteTsPaths(),
    dts({
      entryRoot: "src",
      tsconfigPath: path.join(__dirname, "tsconfig.lib.json"),
    }),
  ],

  worker: {
    // This project bundles the maplibre engine source, whose module workers
    // code-split; the default iife worker output cannot express that.
    format: "es",
    plugins: () => [nxViteTsPaths()],
  },

  build: {
    outDir: "../../../dist/libraries/mapping/measurements",
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    lib: {
      entry: "src/index.ts",
      name: "carma-mapping-measurements",
      fileName: "index",
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: [],
    },
  },
});
