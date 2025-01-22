/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { viteStaticCopy } from "vite-plugin-static-copy";
import path from 'path';

const CESIUM_PATHNAME = "__cesium__";

export default defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/envirometrics/wuppertal/floodingmap',

  server: {
    port: 4200,
    host: 'localhost',
    fs: {
      allow: [
        path.resolve(__dirname, './'), // Allow project root
        path.resolve(__dirname, '../../..'), // Adjust this to include any necessary directories
      ],
    },
  },

  preview: {
    port: 4300,
    host: 'localhost',
  },

  plugins: [
    react(),
     nxViteTsPaths(),
     viteStaticCopy({
    targets: [
      {
        src: "../../../node_modules/cesium/Build/Cesium/*",
        dest: CESIUM_PATHNAME,
      },
    ],
    silent: false,
  }),],

  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },

  build: {
    outDir: '../../../dist/envirometrics/wuppertal/floodingmap',
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },

  test: {
    globals: true,
    cache: {
      dir: '../../../node_modules/.vitest',
    },
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],

    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/envirometrics/wuppertal/floodingmap',
      provider: 'v8',
    },
  },
});
