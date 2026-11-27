/// <reference types='vitest' />
import * as path from "path";

import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
export default defineConfig({
  root: __dirname,
  cacheDir:
    "../../../../node_modules/.vite/libraries/mapping/engines-interop/view-state",

  plugins: [
    nxViteTsPaths(),
    dts({
      entryRoot: "src",
      tsconfigPath: path.join(__dirname, "tsconfig.lib.json"),
    }),
  ],

  build: {
    outDir: "../../../../dist/libraries/mapping/engines-interop/view-state",
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    lib: {
      // `cesium` backs the `view-state/cesium` path, which apps built
      // against dist (buildLibsFromSource: false) resolve to dist/cesium
      entry: { index: "src/index.ts", cesium: "src/cesium.ts" },
      name: "engines-interop-view-state",
      fileName: (format, entryName) =>
        `${entryName}.${format === "es" ? "mjs" : "js"}`,
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
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.spec.{ts,tsx}"],
    reporters: ["default"],
    coverage: {
      reportsDirectory:
        "../../../../coverage/libraries/mapping/engines-interop/view-state",
      provider: "v8",
    },
  },
});
