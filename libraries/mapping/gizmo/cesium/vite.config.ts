import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { defineConfig } from "vite";
export default defineConfig({
  root: __dirname,
  cacheDir: "../../../../node_modules/.vite/libraries/mapping/gizmo/cesium",
  plugins: [nxViteTsPaths()],
  build: {
    lib: {
      entry: "src/index.ts",
      name: "gizmo-cesium",
      formats: ["es"],
      fileName: () => "index.js",
    },
    outDir: "../../../../dist/libraries/mapping/gizmo/cesium",
    emptyOutDir: true,
    rollupOptions: {
      external: [/^react(\/.*)?$/, /^cesium(\/.*)?$/, /^@carma.*/],
    },
  },
});
