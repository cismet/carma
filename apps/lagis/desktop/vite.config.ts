/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/apps/lagis/desktop',

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

  plugins: [react(), nxViteTsPaths()],

  // @carma-mapping/engines/maplibre ships module workers that import through
  // the workspace path aliases, so the worker build needs the same resolver.
  worker: {
    // Module workers need ES output for their dynamically imported chunks.
    format: 'es',
    plugins: () => [nxViteTsPaths()],
  },

  optimizeDeps: {
    include: ['maplibre-gl'],
    esbuildOptions: {
      target: 'es2022',
      supported: {
        'class-field': true,
        'class-static-field': true,
      },
    },
  },

  esbuild: {
    supported: {
      'class-field': true,
      'class-static-field': true,
    },
  },

  build: {
    outDir: '../../../dist/apps/lagis/desktop',
    reportCompressedSize: true,
    target: 'es2022',
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
      reportsDirectory: '../../../coverage/apps/lagis/desktop',
      provider: 'v8',
    },
  },
});
