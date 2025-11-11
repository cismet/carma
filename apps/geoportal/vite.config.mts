/// <reference types='vitest' />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { viteStaticCopy } from "vite-plugin-static-copy";

const CESIUM_PATHNAME = "__cesium__";

export default defineConfig({
  root: __dirname,
  cacheDir: "../../node_modules/.vite/apps/geoportal",

  server: {
    port: 4200,
    host: "localhost",
    sourcemapIgnoreList: false, // Include all sourcemaps in dev server
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
      // Limit parallel operations to reduce memory spikes
      maxParallelFileOps: 20,
      output: {
        // Optimize chunks by load priority for better initial load & caching
        manualChunks: process.env.NODE_ENV === 'production' ? {
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
        } : undefined,
        // In development: include full source content for debugging
        // In production: exclude vendor sources to save memory
        sourcemapExcludeSources: process.env.NODE_ENV === 'production',
        sourcemapIgnoreList: (relativeSourcePath) => {
          // In production: Exclude all node_modules EXCEPT debugging libraries
          if (process.env.NODE_ENV === 'production') {
            return relativeSourcePath.includes('node_modules') && 
                   !relativeSourcePath.includes('node_modules/cesium') &&
                   !relativeSourcePath.includes('node_modules/leaflet') &&
                   !relativeSourcePath.includes('node_modules/react-cismap');
          }
          // In development/preview: include all sourcemaps
          return false;
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
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],

    reporters: ["default"],
    coverage: {
      reportsDirectory: "../../coverage/apps/geoportal",
      provider: "v8",
    },
  },
});
