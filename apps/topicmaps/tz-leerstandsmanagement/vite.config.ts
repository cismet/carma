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
