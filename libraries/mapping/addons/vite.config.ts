/// <reference types='vitest' />
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { defineConfig } from "vite";

// The library has no build step — it is consumed through its path alias. This
// config exists for the unit tests of the picking core, which run without a map.
export default defineConfig({
  root: __dirname,
  cacheDir: "../../../node_modules/.vite/libraries/mapping/addons",
  plugins: [nxViteTsPaths()],
  test: {
    watch: false,
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.spec.{ts,tsx}"],
    reporters: ["default"],
    coverage: {
      reportsDirectory: "../../../coverage/libraries/mapping/addons",
      provider: "v8",
    },
  },
});
