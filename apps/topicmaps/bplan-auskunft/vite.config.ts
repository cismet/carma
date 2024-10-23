/// <reference types='vitest' />
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import react from '@vitejs/plugin-react'
import * as path from "path";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";


export default defineConfig({
  root: __dirname,
  cacheDir: "../../../node_modules/.vite/apps/topicmaps/bplan-auskunft",

  server: {
    port: 4200,
    host: "localhost",
    fs: {
      allow: ["../../.."],
    },
  },

  preview: {
    port: 4300,
    host: "localhost",
  },
  logLevel: "info",

  plugins: [
    nxViteTsPaths(),
    react(),
    dts({
      entryRoot: "src",
      tsconfigPath: path.join(__dirname, "tsconfig.json"),
    }),
  ],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },

  build: {
    outDir: "../../../dist/apps/topicmaps/bplan-auskunft",
    reportCompressedSize: true,
    commonjsOptions: {   },
    rollupOptions: {
      logLevel: "info",
      // preserveSymlinks: true,
      //external: ["@carma-collab/wuppertal/bplan-auskunft"],
    },
  },

  define: {
    "import.meta.vitest": undefined,
  },

  test: {
    globals: true,
    cache: {
      dir: "../../../node_modules/.vitest",
    },
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    includeSource: ["src/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    reporters: ["default"],
    coverage: {
      reportsDirectory: "../../../coverage/apps/topicmaps/bplan-auskunft",
      provider: "v8",
    },
  },
});
