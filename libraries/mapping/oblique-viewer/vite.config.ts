/// <reference types="vitest" />
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: __dirname,
  cacheDir: "../../../node_modules/.vite/libraries/mapping/oblique-viewer",
  plugins: [react(), nxViteTsPaths()],
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    reporters: ["default"],
    coverage: {
      reportsDirectory: "../../../coverage/libraries/mapping/oblique-viewer",
      provider: "v8",
    },
  },
});
