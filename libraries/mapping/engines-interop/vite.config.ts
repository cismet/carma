import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libraries/mapping/engines-interop',
  plugins: [react(), nxViteTsPaths()],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'engines-interop',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    outDir: '../../../dist/libraries/mapping/engines-interop',
    emptyOutDir: true,
    rollupOptions: {
      external: [/^react(\/.*)?$/, /^react-dom(\/.*)?$/],
    },
  },
  test: {
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libraries/mapping/engines-interop',
      provider: 'v8',
    },
  },
});
