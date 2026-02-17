import { defineConfig } from "vite";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";

export default defineConfig({
  root: __dirname,
  cacheDir:
    "../../../../../../../node_modules/.vite/libraries/mapping/engines/cesium/gizmo/addons/overlay-provider",
  plugins: [nxViteTsPaths()],
  build: {
    lib: {
      entry: "src/index.ts",
      name: "gizmo-cesium-overlay-provider-adapter",
      formats: ["es"],
      fileName: () => "index.js",
    },
    outDir:
      "../../../../../../../dist/libraries/mapping/engines/cesium/gizmo/addons/overlay-provider",
    emptyOutDir: true,
    rollupOptions: {
      external: [/^react(\/.*)?$/, /^cesium(\/.*)?$/, /^@carma.*/],
    },
  },
});
