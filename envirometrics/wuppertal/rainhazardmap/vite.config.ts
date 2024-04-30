/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import path from 'path';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/envirometrics/wuppertal/rainhazardmap',

  server: {
    port: 4200,
    host: 'localhost',
    fs: {
      // Restrict file serving to only allow files in the project root and below
      allow: [
        path.resolve(__dirname, './'), // Allow project root
        path.resolve(__dirname, '../..'), // Adjust this to include any necessary directories
      ],
    },
  },

  preview: {
    port: 4300,
    host: 'localhost',
  },

  plugins: [react(), nxViteTsPaths()],

  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },

  build: {
    outDir: '../../../dist/envirometrics/wuppertal/rainhazardmap',
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
      reportsDirectory:
        '../../../coverage/envirometrics/wuppertal/rainhazardmap',
      provider: 'v8',
    },
  },
});
