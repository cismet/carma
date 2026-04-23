/// <reference types='vitest' />
import { mkdirSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import * as path from 'path';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

const secondaryEntryPoints = [
    {
      entryName: 'fetching',
      entryPath: 'src/lib/fetching/index.ts',
      typesTarget: './lib/fetching/index',
    },
    {
      entryName: 'number-format',
      entryPath: 'src/lib/number-format/index.ts',
      typesTarget: './lib/number-format/index',
    },
    {
      entryName: 'promise',
      entryPath: 'src/lib/promise/index.ts',
      typesTarget: './lib/promise/index',
    },
    {
      entryName: 'window',
      entryPath: 'src/lib/window/index.ts',
      typesTarget: './lib/window/index',
    },
] as const;

export default defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libraries/commons/utils',

  plugins: [
    react(),
    nxViteTsPaths(),
    dts({
      entryRoot: 'src',
      tsconfigPath: path.join(__dirname, 'tsconfig.lib.json'),
    }),
    {
      name: 'write-secondary-entrypoint-shims',
      closeBundle() {
        const outDir = path.resolve(__dirname, '../../../dist/libraries/commons/utils');

        for (const { entryName, typesTarget } of secondaryEntryPoints) {
          mkdirSync(outDir, { recursive: true });
          writeFileSync(
            path.join(outDir, `${entryName}.d.ts`),
            `export * from "${typesTarget}";\n`
          );
          writeFileSync(
            path.join(outDir, entryName),
            `export * from "./${entryName}.mjs";\n`
          );
        }
      },
    },
  ],

  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },

  // Configuration for building your library.
  // See: https://vitejs.dev/guide/build.html#library-mode
  build: {
    outDir: '../../../dist/libraries/commons/utils',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    lib: {
      entry: {
        index: path.resolve(__dirname, 'src/index.ts'),
        ...Object.fromEntries(
          secondaryEntryPoints.map(({ entryName, entryPath }) => [
            entryName,
            path.resolve(__dirname, entryPath),
          ])
        ),
      },
      name: 'utils',
      fileName: (format, entryName) => {
        const extension = format === 'es' ? 'mjs' : 'js';
        return `${entryName}.${extension}`;
      },
      // Change this to the formats you want to support.
      // Don't forget to update your package.json as well.
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      // External packages that should not be bundled into your library.
      external: ['react', 'react-dom', 'react/jsx-runtime'],
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
      reportsDirectory: '../../../coverage/libraries/commons/utils',
      provider: 'v8',
    },
  },
});
