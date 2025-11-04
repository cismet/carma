/// <reference types='vitest' />
import { defineConfig } from "vite";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import dts from "vite-plugin-dts";
import * as path from "path";

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
