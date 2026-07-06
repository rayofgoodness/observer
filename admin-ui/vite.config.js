import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
// The SPA is served by the NestJS API under /ui (ServeStaticModule). The old
// /admin and /dashboard URLs 302-redirect here, so bookmarks keep working.
// In dev, proxy the API routes to the running Nest instance on :3040.
export default defineConfig({
    base: '/ui/',
    plugins: [vue()],
    build: { outDir: 'dist', emptyOutDir: true },
    server: {
        port: 5173,
        proxy: {
            '/auth': 'http://localhost:3040',
            '/account': 'http://localhost:3040',
            '/admin': 'http://localhost:3040',
            '/v1': 'http://localhost:3040',
        },
    },
});
