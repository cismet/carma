import { defineConfig } from "vitest/config";
import dts from "vite-plugin-dts";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";

export default defineConfig({
  root: __dirname,
  cacheDir: "../../../node_modules/.vite/libraries/commons/worker-scaling",
  plugins: [nxViteTsPaths(), dts({ entryRoot: "src", tsconfigPath: `${__dirname}/tsconfig.lib.json` })],
  build: {
    outDir: "../../../dist/libraries/commons/worker-scaling",
    lib: { entry: "src/index.ts", name: "worker-scaling", fileName: "index", formats: ["es"] },
  },
  test: { environment: "node", include: ["src/**/*.spec.ts"], reporters: ["default"] },
});
