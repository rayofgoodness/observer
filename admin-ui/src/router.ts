import { createRouter, createWebHistory } from 'vue-router'
import AdminView from './views/AdminView.vue'
import DashboardView from './views/DashboardView.vue'

// Served at the real URLs /admin and /dashboard (the API returns index.html for
// both; assets load from /ui via ServeStaticModule). The /admin entry keeps its
// server-side admin-role gate (AdminUiMiddleware) untouched.
export const router = createRouter({
  history: createWebHistory('/'),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', component: DashboardView },
    { path: '/admin', component: AdminView },
  ],
})
