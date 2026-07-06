<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import AdminProjects from '../components/AdminProjects.vue'
import AdminSchedules from '../components/AdminSchedules.vue'
import LogsModal from '../components/LogsModal.vue'
import { toast } from '../composables/useToast'

const TOKEN_KEY = 'observer_admin_token'

const token = ref(localStorage.getItem(TOKEN_KEY) || '')
const tokenInput = ref(token.value)
const status = reactive({ ok: false, text: token.value ? '' : 'no token' })

// Admin API calls authenticate with X-Admin-Token (stored in this browser only).
const authHeaders = computed(() => ({ 'X-Admin-Token': token.value }))

const modal = reactive({ open: false, key: '', name: '' })

function saveToken() {
  token.value = tokenInput.value.trim()
  localStorage.setItem(TOKEN_KEY, token.value)
  toast('Token saved')
}

function onStatus(ok: boolean, text: string) {
  status.ok = ok
  status.text = text
}

function openLogs(key: string, name: string) {
  modal.key = key
  modal.name = name
  modal.open = true
}
</script>

<template>
  <div class="wrap">
    <header>
      <span class="dot" :class="status.ok ? 'ok' : 'bad'" />
      <h1>Observer · Admin</h1>
      <span class="muted" style="font-size: 12px">{{ status.text }}</span>
    </header>

    <div class="card">
      <h2>Admin token</h2>
      <div class="row">
        <div style="flex: 3">
          <label>X-Admin-Token (stored in this browser only)</label>
          <input
            v-model="tokenInput"
            type="password"
            placeholder="paste ADMIN_TOKEN"
            autocomplete="off"
            @keydown.enter="saveToken"
          />
        </div>
        <div style="flex: 0 0 auto">
          <button @click="saveToken">Save &amp; load</button>
        </div>
      </div>
    </div>

    <AdminProjects :token="token" :auth-headers="authHeaders" @logs="openLogs" @status="onStatus" />
    <AdminSchedules :token="token" :auth-headers="authHeaders" />

    <LogsModal
      :open="modal.open"
      api-base="/admin"
      :project-key="modal.key"
      :project-name="modal.name"
      advanced
      :auth-headers="authHeaders"
      @close="modal.open = false"
    />
  </div>
</template>
