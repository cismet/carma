/// <reference types='vitest' />
import { nxCopyAssetsPlugin } from "@nx/vite/plugins/nx-copy-assets.plugin";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { Readable } from "node:stream";
const CESIUM_PATHNAME = "__cesium__";
const THREE_DRACO_PATHNAME = "__three_draco__";
const DZ_B_PRM_PATHNAME = "__dz_b_prm__";

const dzbPrmProxyPlugin: Plugin = {
  name: "carma-dz-b-prm-proxy",
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const requestUrl = request.url;
      if (!requestUrl?.startsWith(`/${DZ_B_PRM_PATHNAME}/`)) {
        next();
        return;
      }

      const upstreamUrl = `https://adhocdata.cismet.de/DZ_B_PRM${requestUrl.replace(
        new RegExp(`^/${DZ_B_PRM_PATHNAME}`),
        ""
      )}`;
      const requestHeaders: Record<string, string> = {};
      for (const headerName of ["range", "if-none-match", "if-modified-since"]) {
        const headerValue = request.headers[headerName];
        if (typeof headerValue === "string") {
          requestHeaders[headerName] = headerValue;
        }
      }

      try {
        const upstreamResponse = await fetch(upstreamUrl, {
          headers: requestHeaders,
        });
        response.statusCode = upstreamResponse.status;
        upstreamResponse.headers.forEach((value, name) => {
          response.setHeader(name, value);
        });

        if (!upstreamResponse.body) {
          response.end();
          return;
        }

        Readable.fromWeb(upstreamResponse.body).pipe(response);
      } catch (error) {
        next(error);
      }
    });
  },
};

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
    dzbPrmProxyPlugin,
    nxCopyAssetsPlugin(["*.md"]),
    // Copy Cesium assets to dist
    viteStaticCopy({
      targets: [
        {
          src: "../../node_modules/cesium/Build/Cesium/*",
          dest: CESIUM_PATHNAME,
        },
        {
          src: "../../node_modules/three/examples/jsm/libs/draco/*",
          dest: THREE_DRACO_PATHNAME,
        },
      ],
      silent: false,
    }),
  ],
  worker: {
    plugins: () => [nxViteTsPaths()],
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  optimizeDeps: {
    include: ["cesium"],
  },
});
