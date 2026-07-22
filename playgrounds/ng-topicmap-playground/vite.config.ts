/// <reference types='vitest' />

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";

export default defineConfig(() => ({
    root: __dirname,
    cacheDir: "../../node_modules/.vite/playgrounds/ng-topicmap-playground",

    server: {
      port: 4200,
      host: true,
      fs: {
        allow: ["../../"],
      },
    },

    preview: {
      port: 4300,
      host: "localhost",
    },

    plugins: [react(), nxViteTsPaths()],
    base: process.env.BASE_URL || "/",
    // Uncomment this if you are using workers.
    // worker: {
    //  plugins: [ nxViteTsPaths() ],
    // },

    optimizeDeps: {
      include: ["maplibre-gl"],
      esbuildOptions: {
        target: "es2022",
      },
    },

    esbuild: {
      supported: {
        "class-field": true,
        "class-static-field": true,
      },
    },

    build: {
      target: "es2022",
      outDir: "../../dist/playgrounds/ng-topicmap-playground",
      // Vite does not empty output directories outside the project root unless
      // explicitly told to. This also removes obsolete data copied by older
      // builds before Nx snapshots the new application output.
      emptyOutDir: true,
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
        reportsDirectory: "../../coverage/playgrounds/ng-topicmap-playground",
        provider: "v8",
      },
    },
  },
));
