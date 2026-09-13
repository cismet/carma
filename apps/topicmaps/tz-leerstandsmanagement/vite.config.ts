/// <reference types='vitest' />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";

export default defineConfig({
  root: __dirname,
  cacheDir: "../../../node_modules/.vite/apps/topicmaps/tz-leerstandsmanagement",

  server: {
    port: 4213,
    host: true,
    fs: {
      allow: ["../../.."],
    },
  },

  preview: {
    port: 4313,
    host: "localhost",
  },

  plugins: [react(), nxViteTsPaths()],

  // maplibre-gl stringifies functions to build its workers; esbuild's
  // __publicField helper for downlevelled class fields is missing in that
  // worker scope and the GeoJSON source dies with "__publicField is not
  // defined". Keep class fields native in dev pre-bundling and in the build.
  optimizeDeps: {
    include: ["maplibre-gl"],
    esbuildOptions: {
      target: "es2022",
      supported: {
        "class-field": true,
        "class-static-field": true,
      },
    },
  },

  esbuild: {
    supported: {
      "class-field": true,
      "class-static-field": true,
    },
  },

  build: {
    outDir: "../../../dist/apps/topicmaps/tz-leerstandsmanagement",
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },

  define: {
    "import.meta.vitest": undefined,
  },
});
