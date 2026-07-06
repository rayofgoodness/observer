<script setup lang="ts">
import { useRouter } from 'vue-router'
import AuthCard from '../components/AuthCard.vue'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { fetchMe } = useAuth()

// After sign-in/registration, re-resolve the session then land on the app root;
// HomeView picks user- vs admin-content from the freshly loaded role.
async function onAuthed() {
  await fetchMe()
  router.replace('/')
}
</script>

<template>
  <div class="wrap">
    <header><h1>Observer</h1></header>
    <AuthCard @authed="onAuthed" />
  </div>
</template>
