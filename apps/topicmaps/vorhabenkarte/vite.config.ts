/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/apps/topicmaps/vorhabenkarte',

  server: {
    port: 4200,
    host: true,
    allowedHosts: ['localhost', 'flexo.kg6.cismet.de'],
    fs: {
      allow: ['../../..'],
    },
  },

  preview: {
    port: 4300,
    host: 'localhost',
    cors: true,
  },

  plugins: [react(), nxViteTsPaths()],

  // MapLibre builds its worker by stringifying its own chunk functions. With
  // the default esbuild target the dep pre-bundle injects a `__publicField`
  // helper into those functions, which then does not exist inside the worker
  // ("__publicField is not defined" on geojson sources). Native class fields
  // avoid the helper; same setup as ng-topicmap-playground.
  optimizeDeps: {
    include: ['maplibre-gl'],
    esbuildOptions: {
      target: 'es2022',
    },
  },

  esbuild: {
    supported: {
      'class-field': true,
      'class-static-field': true,
    },
  },

  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },

  build: {
    target: 'es2022',
    outDir: '../../../dist/apps/topicmaps/vorhabenkarte',
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },

  define: {
    'import.meta.vitest': undefined,
  },
  test: {
    globals: true,
    cache: {
      dir: '../../../node_modules/.vitest',
    },
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    includeSource: ['src/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/apps/topicmaps/vorhabenkarte',
      provider: 'v8',
    },
  },
});
