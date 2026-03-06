import { defineConfig } from "vite";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";

export default defineConfig({
  root: __dirname,
  cacheDir:
    "../../../../../node_modules/.vite/libraries/mapping/engines/cesium/primitives",
  plugins: [nxViteTsPaths()],
  build: {
    lib: {
      entry: "src/index.ts",
      name: "cesium-primitives",
      formats: ["es"],
      fileName: () => "index.js",
    },
    outDir: "../../../../../dist/libraries/mapping/engines/cesium/primitives",
    emptyOutDir: true,
    rollupOptions: {
      external: [/^react(\/.*)?$/, /^cesium(\/.*)?$/, /^@carma.*/],
    },
  },
  test: {
    watch: false,
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}"],
    reporters: ["default"],
    coverage: {
      reportsDirectory:
        "../../../../../coverage/libraries/mapping/engines/cesium/primitives",
      provider: "v8",
    },
  },
});
