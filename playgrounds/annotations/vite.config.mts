/// <reference types='vitest' />
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const CESIUM_PATHNAME = "__cesium__";
const require = createRequire(import.meta.url);
const cesiumPackageJsonPath = require.resolve("cesium/package.json");
const workspaceNodeModulesPath = dirname(dirname(cesiumPackageJsonPath));
const cesiumBuildPath = join(
  dirname(cesiumPackageJsonPath),
  "Build",
  "Cesium",
  "*"
);

export default defineConfig({
  root: __dirname,
  cacheDir: join(workspaceNodeModulesPath, ".vite", "playgrounds", "annotations"),

  server: {
    port: 4200,
    host: "localhost",
    fs: {
      allow: ["../.."],
    },
  },

  preview: {
    port: 4300,
    host: "localhost",
    cors: true,
  },

  plugins: [
    react(),
    nxViteTsPaths(),
    viteStaticCopy({
      targets: [
        {
          src: cesiumBuildPath,
          dest: CESIUM_PATHNAME,
        },
      ],
      silent: false,
    }),
  ],

  worker: {
    plugins: () => [nxViteTsPaths()],
  },

  build: {
    outDir: "../../dist/playgrounds/annotations",
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },

  test: {
    globals: true,
    cache: {
      dir: join(workspaceNodeModulesPath, ".vitest"),
    },
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],

    reporters: ["default"],
    coverage: {
      reportsDirectory: "../../coverage/playgrounds/annotations",
      provider: "v8",
    },
  },
});
