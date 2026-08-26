/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
// `vitest/config` rather than `vite` so the `test` block is typed in this file.
import { defineConfig } from 'vitest/config';

// The API is proxied rather than called cross-origin so the app runs against a single
// origin in dev exactly as it does behind a reverse proxy in Docker. That keeps
// apiClient's base URL empty in both, so there is no CORS-only code path to maintain.
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:5006';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/v1': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
