/// <reference types='vitest' />
import * as path from "path";

import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
export default defineConfig({
  root: __dirname,
  cacheDir:
    "../../../../../node_modules/.vite/libraries/mapping/engines/three/primitives",

  plugins: [
    nxViteTsPaths(),
    dts({
      entryRoot: "src",
      tsconfigPath: path.join(__dirname, "tsconfig.lib.json"),
    }),
  ],

  build: {
    outDir: "../../../../../dist/libraries/mapping/engines/three/primitives",
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    lib: {
      entry: "src/index.ts",
      name: "carma-map-engines-three-primitives",
      fileName: "index",
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: ["three"],
    },
  },
});
