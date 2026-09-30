import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages project sites are served from this repository subpath.
  base: '/multi-spin-wheel-of-fortune/',
  server: {
    allowedHosts: true,
  },
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        verify: fileURLToPath(new URL('./verify/index.html', import.meta.url)),
        perf: fileURLToPath(new URL('./perf/index.html', import.meta.url)),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/testSetup.ts'],
    restoreMocks: true,
    clearMocks: true,
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 95,
        branches: 90,
      },
    },
  },
});
