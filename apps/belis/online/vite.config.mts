/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { comlink } from 'vite-plugin-comlink';
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/apps/belis/online',

  server: {
    port: 4200,
    host: 'localhost',
    fs: {
      allow: ['../../..'],
    },
  },

  preview: {
    port: 4300,
    host: 'localhost',
  },


  plugins: [react(), nxViteTsPaths(), comlink()],

  // plugins: [
  //   react(), 
  //   nxViteTsPaths(), 
  //   comlink(),
  //   viteStaticCopy({
  //     targets: [
  //       {
  //         src: './src/service-worker.js',
  //         dest: './',
  //       },
  //     ],
  //   }),
  // ],

  // base: './',

  // Uncomment this if you are using workers.
  // worker: {
  //   plugins: () => [nxViteTsPaths()],
  // },

  // Uncomment this if you are using workers.
  worker: {
    plugins: () => [comlink()],
  },

  build: {
    outDir: '../../../dist/apps/belis/online',
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },

  define: {
    'import.meta.vitest': undefined,
  },

});
