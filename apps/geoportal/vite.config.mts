/// <reference types='vitest' />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { viteStaticCopy } from "vite-plugin-static-copy";

const CESIUM_PATHNAME = "__cesium__";

export default defineConfig({
  root: __dirname,
  cacheDir: "../../node_modules/.vite/apps/geoportal",

  // Pre-bundle dependencies to avoid re-transforming
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-redux',
      '@reduxjs/toolkit',
      'redux-persist',
      'localforage',
      'react-router-dom',
      'antd',
      '@ant-design/icons',
      'leaflet',
      'react-leaflet',
      'react-cismap',
    ],
    // Force deps to be bundled even in dev
    force: false,
  },

  server: {
    port: 4200,
    host: "localhost",
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
    // Skip type checking during build (use tsc separately if needed)
    emitOnTypeCheck: false,
    // Don't clear console on rebuild in watch mode
    watch: {
      clearScreen: false,
    },
    rollupOptions: {
      // Enable Rollup cache for faster rebuilds (experimental)
      cache: true,
      output: {
        // Use content hash for vendor chunks - unchanged vendors keep same hash
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
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
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],

    reporters: ["default"],
    coverage: {
      reportsDirectory: "../../coverage/apps/geoportal",
      provider: "v8",
    },
  },
});
