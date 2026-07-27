/// <reference types='vitest' />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";

export default defineConfig({
  root: __dirname,
  cacheDir: "../../../node_modules/.vite/libraries/mapping/layers",

  plugins: [react(), nxViteTsPaths()],

  test: {
    globals: true,
    cache: {
      dir: "../../../node_modules/.vitest",
    },
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // the component tests render the full layer library modal, which needs
    // more than the 5s default on a cold run
    testTimeout: 20000,

    reporters: ["default"],
    coverage: {
      reportsDirectory: "../../../coverage/libraries/mapping/layers",
      provider: "v8",
    },
  },
});
