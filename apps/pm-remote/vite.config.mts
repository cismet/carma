/// <reference types='vitest' />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";

export default defineConfig({
  root: __dirname,
  cacheDir: "../../node_modules/.vite/apps/pm-remote",

  // `host: true` so a phone on the same network reaches the dev server
  server: {
    port: 4210,
    host: true,
    fs: {
      allow: ["../.."],
    },
    // The deployed relay only answers the Pages origin. Relay base `/relay`
    // reaches it through this server, so a dev remote (desk or phone) can
    // drive the real display without a local relay.
    proxy: {
      "/relay": {
        target: "https://relay-wupp-digitaltwin.cismet.de",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/relay/, ""),
      },
      // The relay `npx nx run map-relay:serve` starts, for a phone that
      // reaches this server over the network (e.g. https via flexo) and
      // cannot see the desk's localhost.
      "/local-relay": {
        target: "http://localhost:8099",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/local-relay/, ""),
      },
    },
  },

  preview: {
    port: 4310,
    host: true,
  },

  plugins: [react(), nxViteTsPaths()],

  build: {
    outDir: "../../dist/apps/pm-remote",
    emptyOutDir: true,
    reportCompressedSize: true,
  },

  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts"],
  },
});
