
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libraries/providers/selection',
  plugins: [react(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'selection',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    outDir: '../../../dist/libraries/providers/selection',
    emptyOutDir: true,
    rollupOptions: {
      // keep peer deps external
      external: [/^react(\/.*)?$/, /^react-dom(\/.*)?$/],
    },
  },
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },
  test: {
    'watch': false,
    'globals': true,
    'environment': "jsdom",
    'include': ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    'reporters': ["default"],
    'coverage': {"reportsDirectory":"../../../coverage/libraries/providers/selection","provider":"v8"},
  },
});
