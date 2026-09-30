/// <reference types="vitest" />

import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: __dirname,
  cacheDir: "../../../node_modules/.vite/libraries/mapping/tile-diagnostics-ui",
  plugins: [react(), nxViteTsPaths()],
  test: {
    watch: false,
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.spec.{ts,tsx}"],
    reporters: ["default"],
    coverage: {
      reportsDirectory: "../../../coverage/libraries/mapping/tile-diagnostics-ui",
      provider: "v8",
    },
  },
});
