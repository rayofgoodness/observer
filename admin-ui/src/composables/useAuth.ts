import { reactive } from 'vue'
import { api } from '../api'

export interface Me {
  id: number
  email: string
  role: string | null
}

// Shared session state. `ready` flips true after the first /auth/me resolves so
// the router guard only fetches once per load.
const state = reactive<{ me: Me | null; ready: boolean }>({
  me: null,
  ready: false,
})

export function useAuth() {
  return {
    state,
    async fetchMe(): Promise<void> {
      try {
        state.me = await api<Me>('GET', '/auth/me')
      } catch {
        state.me = null
      } finally {
        state.ready = true
      }
    },
    async logout(): Promise<void> {
      try {
        await api('POST', '/auth/logout')
      } catch {}
      state.me = null
    },
    isAdmin(): boolean {
      return state.me?.role === 'admin'
    },
  }
}
