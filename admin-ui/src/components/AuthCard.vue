<script setup lang="ts">
import { ref } from 'vue'
import { api } from '../api'
import { toast } from '../composables/useToast'

const emit = defineEmits<{ authed: [] }>()

const mode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')

async function submit() {
  if (!email.value.trim() || !password.value)
    return toast('Email and password required', true)
  try {
    await api(
      'POST',
      mode.value === 'login' ? '/auth/login' : '/auth/register',
      {
        email: email.value.trim(),
        password: password.value,
      },
    )
    password.value = ''
    emit('authed')
  } catch (e) {
    toast((e as Error).message, true)
  }
}
</script>

<template>
  <div class="card">
    <div class="tabs">
      <button class="ghost tab" :class="{ active: mode === 'login' }" @click="mode = 'login'">Sign in</button>
      <button class="ghost tab" :class="{ active: mode === 'register' }" @click="mode = 'register'">
        Create account
      </button>
    </div>
    <div class="row">
      <div>
        <label>Email</label>
        <input v-model="email" type="email" autocomplete="username" placeholder="you@example.com" />
      </div>
      <div>
        <label>
          Password
          <span v-if="mode === 'register'" class="muted">(min 8 chars)</span>
        </label>
        <input
          v-model="password"
          type="password"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          placeholder="••••••••"
          @keydown.enter="submit"
        />
      </div>
      <div style="flex: 0 0 auto">
        <button @click="submit">{{ mode === 'login' ? 'Sign in' : 'Create account' }}</button>
      </div>
    </div>
  </div>
</template>
