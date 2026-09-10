/// <reference types='vitest' />
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import * as path from 'path';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libraries/mapping/core',

  plugins: [
    nxViteTsPaths(),
    dts({
      entryRoot: 'src',
      tsconfigPath: path.join(__dirname, 'tsconfig.lib.json'),
    }),
  ],

  worker: {
    // Module workers need ES output for their dynamically imported chunks.
    format: 'es',
    // The worker sub-build resolves the wildcard tsconfig paths like the main build.
    plugins: () => [nxViteTsPaths()],
  },

  build: {
    outDir: '../../../dist/libraries/mapping/core',
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    lib: {
      entry: 'src/index.ts',
      name: 'mapping-core',
      fileName: 'index',
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: [],
    },
  },

  test: {
    globals: true,
    cache: {
      dir: '../../../node_modules/.vitest',
    },
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libraries/mapping/core',
      provider: 'v8',
    },
  },
});
