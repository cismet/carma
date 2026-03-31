import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
  root: __dirname,
  cacheDir:
    "../../../../../../node_modules/.vite/libraries/mapping/engines/cesium/react/primitives",
  plugins: [react(), nxViteTsPaths()],
  build: {
    lib: {
      entry: "src/index.ts",
      name: "cesium-react-primitives",
      formats: ["es"],
      fileName: () => "index.js",
    },
    outDir:
      "../../../../../../dist/libraries/mapping/engines/cesium/react/primitives",
    emptyOutDir: true,
    rollupOptions: {
      external: [
        /^react(\/.*)?$/,
        /^react-dom(\/.*)?$/,
        /^cesium(\/.*)?$/,
        /^@carma.*/,
      ],
    },
  },
  test: {
    watch: false,
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    reporters: ["default"],
    coverage: {
      reportsDirectory:
        "../../../../../../coverage/libraries/mapping/engines/cesium/react/primitives",
      provider: "v8",
    },
  },
});
