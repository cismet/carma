/// <reference types="vitest" />
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
  root: __dirname,
  cacheDir: "../../../node_modules/.vite/libraries/commons/image-streaming",
  plugins: [react(), nxViteTsPaths()],
  test: { globals: true, environment: "node", include: ["src/**/*.{test,spec}.{ts,tsx}"], reporters: ["default"], coverage: { reportsDirectory: "../../../coverage/libraries/commons/image-streaming", provider: "v8" } },
});
