/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const CESIUM_PATHNAME = '__cesium__';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/playgrounds/stories',
  server:{
    port: 4200,
    host: 'localhost',
    sourcemapIgnoreList: false, // Don't ignore any sources in source maps
  },
  preview:{
    port: 4300,
    host: 'localhost',
  },
  plugins: [
    react(),
    nxViteTsPaths(),
    nxCopyAssetsPlugin(['*.md']),
    // Copy Cesium assets to dist
    viteStaticCopy({
      targets: [
        {
          src: '../../node_modules/cesium/Build/Cesium/*',
          dest: CESIUM_PATHNAME,
        },
      ],
      silent: false,
    }),
  ],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },
  build: {
    outDir: '../../dist/playgrounds/stories',
    emptyOutDir: true,
    reportCompressedSize: true,
    sourcemap: true, // Enable source maps for production builds
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  optimizeDeps: {
    include: ['cesium'], // Pre-bundle Cesium for better dev experience
    esbuildOptions: {
      sourcemap: true, // Enable source maps in dependency pre-bundling
    },
  },
});
