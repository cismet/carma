/// <reference types='vitest' />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { viteStaticCopy } from "vite-plugin-static-copy";

const CESIUM_PATHNAME = "__cesium__";

export default defineConfig({
  root: __dirname,
  cacheDir: "../../node_modules/.vite/playgrounds/cesium-reference",

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
          src: "../../node_modules/cesium/Build/Cesium/*",
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
    outDir: "../../dist/playgrounds/cesium-reference",
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },

  test: {
    globals: true,
    cache: {
      dir: "../../node_modules/.vitest",
    },
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],

    reporters: ["default"],
    coverage: {
      reportsDirectory: "../../coverage/playgrounds/cesium-reference",
      provider: "v8",
    },
  },
});
