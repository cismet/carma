/// <reference types='vitest' />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";

// Use an environment variable to set the base URL
const base = process.env.BASE_URL || "/";

export default defineConfig({
  root: __dirname,
  cacheDir: "../../node_modules/.vite/playgrounds/fuzzy-search-playground",

  server: {
    port: 4200,
    host: "localhost",
    fs: {
      allow: ["../../"],
    },
  },

  preview: {
    port: 4300,
    host: "localhost",
  },

  plugins: [react(), nxViteTsPaths()],
  base: base,
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },

  build: {
    outDir: "../../dist/playgrounds/fuzzy-search-playground",
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
      reportsDirectory: "../../coverage/playgrounds/stadtplan-playground",
      provider: "v8",
    },
  },
});
