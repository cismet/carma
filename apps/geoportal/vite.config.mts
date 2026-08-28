/// <reference types='vitest' />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { viteStaticCopy } from "vite-plugin-static-copy";

const CESIUM_PATHNAME = "__cesium__";

export default defineConfig({
  root: __dirname,
  cacheDir: "../../node_modules/.vite/apps/geoportal",

  // @excalidraw/excalidraw's entry reads process.env, which the browser has not
  define: {
    "process.env.IS_PREACT": JSON.stringify("true"),
  },

  server: {
    port: 4200,
    host: true,
    allowedHosts: ["localhost", "flexo.kg6.cismet.de"],
    fs: {
      allow: ["../.."],
    },
  },

  preview: {
    port: 4300,
    host: "localhost",
    cors: true,
  },

  plugins: [
    react(),
    nxViteTsPaths(),
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

  worker: {
    plugins: () => [nxViteTsPaths()],
  },

  // Terra-draw (used by @carma-mapping/measurements) ships class field
  // declarations. Without telling esbuild they're natively supported, esbuild
  // rewrites them through a `__publicField` helper that isn't reliably bundled
  // here — which surfaces at runtime as "__publicField is not defined". The
  // measurements-playground sets the same supported flags for the same reason.
  optimizeDeps: {
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
    outDir: "../../dist/apps/geoportal",
    reportCompressedSize: true,
    // 'hidden' generates sourcemaps but doesn't reference them in bundle
    sourcemap: process.env.NODE_ENV === 'production' ? 'hidden' : true,
    // Disable minification in development for readable stack traces
    minify: process.env.NODE_ENV === 'production' ? 'esbuild' : false,
    // Reduce memory pressure during build
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Optimize chunks by load priority for better initial load & caching
        manualChunks: {
          'vendor-react-core': [
            'react',
            'react-dom',
            'react-redux',
            '@reduxjs/toolkit',
            'redux-persist',
            'localforage',
            'react-router-dom'
          ],
          'vendor-ui': ['antd', '@ant-design/icons'],
          'vendor-ui-icons': [
            '@fortawesome/react-fontawesome',
            '@fortawesome/fontawesome-svg-core',
            '@fortawesome/free-solid-svg-icons',
            '@fortawesome/free-regular-svg-icons',
          ],
          'vendor-leaflet': [
            'leaflet',
            'react-leaflet',
            'leaflet-draw',
            'leaflet-editable',
          ],
          'vendor-cismap': ['react-cismap'],
          'vendor-cesium': ['cesium'],
          'vendor-maplibre': ['maplibre-gl'],
        },
        // Exclude vendor chunks from sourcemaps to save memory, but keep Cesium for debugging
        sourcemapExcludeSources: true,
        sourcemapIgnoreList: (relativeSourcePath) => {
          // Exclude all node_modules EXCEPT cesium from sourcemaps
          return relativeSourcePath.includes('node_modules') && 
                 !relativeSourcePath.includes('node_modules/cesium') &&
                 !relativeSourcePath.includes('node_modules/leaflet') &&
                 !relativeSourcePath.includes('node_modules/react-cismap');
        },
      },
    },
  },

  test: {
    globals: true,
    cache: {
      dir: "../../node_modules/.vitest",
    },
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.spec.{ts,tsx}"],

    reporters: ["default"],
    coverage: {
      reportsDirectory: "../../coverage/apps/geoportal",
      provider: "v8",
    },
  },
});
