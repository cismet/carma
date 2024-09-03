/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { viteStaticCopy } from 'vite-plugin-static-copy';

/* 

How to fix Cesium related issues as of 2024-05-17, cesium@1.117

0. make sure vite.config.mts is marked as module type script with .mts not .ts

1. Import the styles in your app

import "cesium/Build/Cesium/Widgets/widgets.css";

2. Copy the assets to the dist folder 
see vitestaticcopy plugin

3. Adjust CESIUM_BASE_URL in window
window.CESIUM_BASE_URL = CESIUM_BASE_URL;


Resources:
https://community.cesium.com/t/is-there-a-good-way-to-use-cesium-with-vite/27545
https://cesium.com/learn/cesiumjs-learn/cesiumjs-quickstart/#step-2-set-up-the-cesiumjs-client
https://github.com/s3xysteak/vite-plugin-cesium-build/

*/

const CESIUM_PATHNAME = '__cesium__'; // also set in config of cesium eventually share via env var?

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/playgrounds/cesium',

  server: {
    port: 4200,
    host: 'localhost',
    fs: {
      allow: ['../..'],
    },
  },

  preview: {
    port: 4300,
    host: 'localhost',
  },

  plugins: [
    //cesium(), vite-plugins-cesium is your best chance but not working with nx setup
    react(),
    nxViteTsPaths(),
    // manually copy cesium assets to dist
    viteStaticCopy({
      targets: [
        {
          src: '../../node_modules/cesium/Build/Cesium/*', // dont use @cesium module folder
          dest: CESIUM_PATHNAME,
        },
      ],
      silent: false,
    }),
  ],

  // Uncomment this if you are using workers.

  worker: {
    plugins: () => [nxViteTsPaths()],
  },

  build: {
    outDir: '../../dist/playgrounds/cesium',
    reportCompressedSize: true,
    sourcemap: true, // while not in actual production,
    commonjsOptions: { transformMixedEsModules: true },
    rollupOptions: {
      onwarn: (warning, warn) => {
        // supress source map warnings on build
        if (
          warning.code === 'SOURCEMAP_ERROR' &&
          warning.id?.includes('node_modules/antd')
        ) {
          return;
        }
        warn(warning);
      },
    },
  },

  test: {
    globals: true,
    cache: {
      dir: '../../node_modules/.vitest',
    },
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],

    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/playgrounds/cesium',
      provider: 'v8',
    },
  },
});
