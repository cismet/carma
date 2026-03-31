/// <reference types='vitest' />
import * as path from "path";

import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
export default defineConfig({
  root: __dirname,
  cacheDir: '../../../../node_modules/.vite/libraries/commons/geo/proj',
  plugins: [
    nxViteTsPaths(),
    dts({
      entryRoot: "src",
      tsconfigPath: path.join(__dirname, "tsconfig.lib.json"),
    }),
  ],
  build: {
    outDir: '../../../../dist/libraries/commons/geo/proj',
    reportCompressedSize: true,
    sourcemap: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    lib: {
      entry: "src/index.ts",
      name: "proj",
      fileName: "index",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["@carma/geo/types"],
    },
  },
});
