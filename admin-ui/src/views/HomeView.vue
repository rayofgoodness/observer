<script setup lang="ts">
import { useRouter } from 'vue-router'
import AdminPanel from '../components/AdminPanel.vue'
import UserPanel from '../components/UserPanel.vue'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { state, logout, isAdmin } = useAuth()

async function onLogout() {
  await logout()
  router.replace('/auth')
}
</script>

<template>
  <div class="wrap">
    <header>
      <h1 style="flex: 1">Observer</h1>
      <span v-if="state.me" class="muted" style="font-size: 12px">
        {{ state.me.email }}<template v-if="isAdmin()"> · admin</template>
      </span>
      <button class="ghost" @click="onLogout">Sign out</button>
    </header>

    <AdminPanel v-if="isAdmin()" />
    <UserPanel v-else />
  </div>
</template>
