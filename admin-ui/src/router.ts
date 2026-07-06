import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from './composables/useAuth'
import AuthView from './views/AuthView.vue'
import HomeView from './views/HomeView.vue'

// Everything lives at '/' (HomeView renders the user's projects or, for admins,
// the admin console — decided from /auth/me). Sign-in/registration is the only
// thing at '/auth'. Unknown paths fold back to '/'.
export const router = createRouter({
  history: createWebHistory('/'),
  routes: [
    { path: '/auth', name: 'auth', component: AuthView },
    { path: '/', name: 'home', component: HomeView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  const { state, fetchMe } = useAuth()
  if (!state.ready) await fetchMe()
  if (to.name !== 'auth' && !state.me) return { name: 'auth' }
  if (to.name === 'auth' && state.me) return { name: 'home' }
})
