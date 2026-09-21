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
