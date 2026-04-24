import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { defineConfig } from "vite";

export default defineConfig({
  root: __dirname,
  cacheDir: "../../../../node_modules/.vite/libraries/mapping/annotations/core",
  plugins: [nxViteTsPaths()],
  build: {
    lib: {
      entry: "src/index.ts",
      name: "annotations-core",
      formats: ["es"],
      fileName: () => "index.js",
    },
    outDir: "../../../../dist/libraries/mapping/annotations/core",
    emptyOutDir: true,
    rollupOptions: {
      external: [/^react(\/.*)?$/, /^@carma.*/],
    },
  },
  test: {
    watch: false,
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.spec.{ts,tsx}"],
    reporters: ["default"],
    coverage: {
      reportsDirectory: "../../../../coverage/libraries/mapping/annotations/core",
      provider: "v8",
    },
  },
});
