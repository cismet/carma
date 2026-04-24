/// <reference types="vitest" />
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { defineConfig } from "vite";

export default defineConfig({
  root: __dirname,
  cacheDir:
    "../../../../node_modules/.vite/libraries/mapping/annotations/builtin-tools",
  plugins: [nxViteTsPaths()],
  build: {
    lib: {
      entry: "src/index.ts",
      name: "annotations-builtin-tools",
      formats: ["es"],
      fileName: () => "index.js",
    },
    outDir: "../../../../dist/libraries/mapping/annotations/builtin-tools",
    emptyOutDir: true,
    rollupOptions: {
      external: [/^react(\/.*)?$/, /^@carma.*/],
    },
  },
  test: {
    watch: false,
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.spec.{ts,tsx}"],
    reporters: ["default"],
    coverage: {
      reportsDirectory:
        "../../../../coverage/libraries/mapping/annotations/builtin-tools",
      provider: "v8",
    },
  },
});
