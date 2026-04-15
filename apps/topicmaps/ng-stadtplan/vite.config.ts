/// <reference types='vitest' />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";

const base = process.env.BASE_URL || "/";

export default defineConfig({
  root: __dirname,
  cacheDir: "../../../node_modules/.vite/apps/topicmaps/ng-stadtplan",

  server: {
    port: 4200,
    host: true,
    fs: {
      allow: ["../../.."],
    },
  },

  preview: {
    port: 4300,
    host: "localhost",
  },

  plugins: [react(), nxViteTsPaths()],
  base: base,

  optimizeDeps: {
    include: ["maplibre-gl", "leaflet-snap"],
    esbuildOptions: {
      target: "es2022",
    },
  },

  esbuild: {
    supported: {
      "class-static-field": true,
    },
  },

  build: {
    outDir: "../../../dist/apps/topicmaps/ng-stadtplan",
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },

  test: {
    globals: true,
    cache: {
      dir: "../../../node_modules/.vitest",
    },
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],

    reporters: ["default"],
    coverage: {
      reportsDirectory: "../../../coverage/apps/topicmaps/ng-stadtplan",
      provider: "v8",
    },
  },
});
