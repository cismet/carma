import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";

export default defineConfig({
  root: __dirname,
  cacheDir: "../../../node_modules/.vite/libraries/providers/locking",
  plugins: [react(), nxViteTsPaths()],
  build: {
    lib: {
      entry: "src/index.ts",
      name: "locking",
      formats: ["es"],
      fileName: () => "index.js",
    },
    outDir: "../../../dist/libraries/providers/locking",
    emptyOutDir: true,
    rollupOptions: {
      external: [/^react(\/.*)?$/, /^react-dom(\/.*)?$/, /^antd(\/.*)?$/],
    },
  },
});
