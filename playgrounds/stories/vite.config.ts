/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

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
  plugins: [react(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
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
