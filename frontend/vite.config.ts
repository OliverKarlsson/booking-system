/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
// `vitest/config` rather than `vite` so the `test` block is typed in this file.
import { defineConfig } from 'vitest/config';

// The API is proxied rather than called cross-origin so the app runs against a single
// origin in dev exactly as it does behind a reverse proxy in Docker. That keeps
// apiClient's base URL empty in both, so there is no CORS-only code path to maintain.
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:5006';

// `@booking/shared` is a *linked* workspace package, so its real path is `../shared/dist`
// rather than somewhere under `node_modules`. That one fact breaks `vite build`, and only
// `vite build`: the package compiles to CommonJS (one build serving the CJS backend and
// this bundler, see shared/tsconfig.json), and Vite's bundled @rollup/plugin-commonjs
// defaults to `include: [/node_modules/]` — which the symlinked path does not match. The
// plugin skips it, Rollup parses `__exportStar(...)` as ESM, finds no named exports, and
// fails with "createRentalUnitSchema is not exported by ../shared/dist/index.js".
//
// The dev server and Vitest transform on demand and never hit this, so the failure appears
// only in a production build — which is to say, only in Docker.
const SHARED_DIST = /shared[\\/]dist[\\/].*\.js$/;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    commonjsOptions: {
      include: [SHARED_DIST, /node_modules/],
    },
  },
  optimizeDeps: {
    // Pre-bundle it in dev for the same reason: a linked package is not pre-bundled by
    // default, and this keeps dev and build resolving it identically.
    include: ['@booking/shared'],
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
