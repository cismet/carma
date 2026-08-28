/// <reference types="vitest" />

import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: __dirname,
  cacheDir: "../../../node_modules/.vite/libraries/mapping/shadow-simulation",
  plugins: [react(), nxViteTsPaths()],
  build: {
    lib: {
      entry: "src/index.ts",
      name: "mapping-shadow-simulation",
      formats: ["es"],
      fileName: () => "index.js",
    },
    outDir: "../../../dist/libraries/mapping/shadow-simulation",
    emptyOutDir: true,
    rollupOptions: {
      external: [/^react(\/.*)?$/, /^react-dom(\/.*)?$/, /^@carma.*/],
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
      reportsDirectory: "../../../coverage/libraries/mapping/shadow-simulation",
      provider: "v8",
    },
  },
});
