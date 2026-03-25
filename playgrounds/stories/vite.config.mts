/// <reference types='vitest' />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { nxCopyAssetsPlugin } from "@nx/vite/plugins/nx-copy-assets.plugin";
import { viteStaticCopy } from "vite-plugin-static-copy";

const CESIUM_PATHNAME = "__cesium__";

export default defineConfig({
  root: __dirname,
  cacheDir: "../../node_modules/.vite/playgrounds/stories",
  base: process.env.BASE_URL || "/",
  // Work around Storybook + Vite preview stalls around `/sb-preview/runtime.js`.
  // See storybookjs/storybook#25256 for background.
  assetsInclude: ["/sb-preview/runtime.js"],
  server: {
    proxy: {
      "/__wupp_terrain__": {
        target: "https://cesium-wupp-terrain.cismet.de",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/__wupp_terrain__/, ""),
      },
      "/__wupp_3d__": {
        target: "https://wupp-3d-data.cismet.de",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/__wupp_3d__/, ""),
      },
    },
  },
  plugins: [
    react(),
    nxViteTsPaths(),
    nxCopyAssetsPlugin(["*.md"]),
    // Copy Cesium assets to dist
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
  optimizeDeps: {
    include: ["cesium"],
  },
});
