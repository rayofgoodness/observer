import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Prod: assets are served by the NestJS API under /ui (ServeStaticModule),
// while the HTML entry is returned at the real /admin and /dashboard URLs — so
// built asset URLs must be absolute under /ui/. Dev: serve from root and proxy
// the API routes to the running Nest instance on :3040.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/ui/' : '/',
  plugins: [vue()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      // `^/auth/` (regex, trailing slash) proxies the API endpoints
      // /auth/login|register|logout|me but NOT the bare /auth SPA route, which
      // Vite serves via its history fallback.
      '^/auth/': 'http://localhost:3040',
      '/account': 'http://localhost:3040',
      '/admin': 'http://localhost:3040',
      '/v1': 'http://localhost:3040',
    },
  },
}))
