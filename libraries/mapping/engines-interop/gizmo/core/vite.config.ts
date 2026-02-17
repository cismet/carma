import { defineConfig } from "vite";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";

export default defineConfig({
  root: __dirname,
  cacheDir:
    "../../../../../node_modules/.vite/libraries/mapping/engines-interop/gizmo/core",
  plugins: [nxViteTsPaths()],
  build: {
    lib: {
      entry: "src/index.ts",
      name: "gizmo-core",
      formats: ["es"],
      fileName: () => "index.js",
    },
    outDir: "../../../../../dist/libraries/mapping/engines-interop/gizmo/core",
    emptyOutDir: true,
  },
});
