<script setup lang="ts">
import { ref, watch } from 'vue'
import { api } from '../api'
import { toast } from '../composables/useToast'

interface AdminProject {
  id: number
  name: string
  publicKey: string
  isActive: boolean
  rateLimitPerMinute: number
  allowedOrigins?: string[]
}

const props = defineProps<{
  authHeaders: Record<string, string>
  token: string
}>()
const emit = defineEmits<{
  logs: [key: string, name: string]
  status: [ok: boolean, text: string]
}>()

const rows = ref<AdminProject[]>([])
const loadError = ref('')
const newName = ref('')
const newOrigins = ref('')
// local rate-limit edits keyed by publicKey
const rate = ref<Record<string, number>>({})

async function load() {
  if (!props.token) {
    emit('status', false, 'no token')
    return
  }
  loadError.value = ''
  try {
    rows.value = await api<AdminProject[]>(
      'GET',
      '/admin/projects',
      undefined,
      props.authHeaders,
    )
    rate.value = Object.fromEntries(
      rows.value.map((p) => [p.publicKey, p.rateLimitPerMinute]),
    )
    emit('status', true, `${rows.value.length} project(s)`)
  } catch (e) {
    loadError.value = (e as Error).message
    emit('status', false, (e as Error).message)
  }
}

async function create() {
  if (!newName.value.trim()) return toast('Name required', true)
  const allowedOrigins = newOrigins.value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  try {
    await api(
      'POST',
      '/admin/projects',
      { name: newName.value.trim(), allowedOrigins },
      props.authHeaders,
    )
    newName.value = ''
    newOrigins.value = ''
    toast('Created')
    load()
  } catch (e) {
    toast((e as Error).message, true)
  }
}

async function saveRate(p: AdminProject) {
  try {
    await api(
      'PATCH',
      `/admin/projects/${encodeURIComponent(p.publicKey)}`,
      { rateLimitPerMinute: Number(rate.value[p.publicKey]) },
      props.authHeaders,
    )
    toast('Rate limit updated')
  } catch (e) {
    toast((e as Error).message, true)
  }
}

async function toggle(p: AdminProject) {
  try {
    await api(
      'PATCH',
      `/admin/projects/${encodeURIComponent(p.publicKey)}`,
      { isActive: !p.isActive },
      props.authHeaders,
    )
    toast(p.isActive ? 'Deactivated' : 'Activated')
    load()
  } catch (e) {
    toast((e as Error).message, true)
  }
}

async function flush(p: AdminProject) {
  try {
    await api(
      'POST',
      `/admin/projects/${encodeURIComponent(p.publicKey)}/flush-cache`,
      undefined,
      props.authHeaders,
    )
    toast('Cache flushed')
  } catch (e) {
    toast((e as Error).message, true)
  }
}

function copyKey(key: string) {
  navigator.clipboard.writeText(key).then(() => toast('Copied'))
}

// Reload whenever a (new) token becomes available.
watch(() => props.token, load, { immediate: true })
defineExpose({ load })
</script>

<template>
  <div class="card">
    <h2>Create project</h2>
    <div class="row">
      <div>
        <label>Name</label>
        <input v-model="newName" type="text" placeholder="my-app" />
      </div>
      <div style="flex: 2">
        <label>Allowed origins (comma-separated, empty = any)</label>
        <input v-model="newOrigins" type="text" placeholder="https://app.example.com, http://localhost:3000" />
      </div>
      <div style="flex: 0 0 auto"><button @click="create">Create</button></div>
    </div>
  </div>

  <div class="card">
    <h2>Projects</h2>
    <table>
      <thead>
        <tr>
          <th>ID</th><th>Name</th><th>Public key</th><th>Status</th><th>Rate/min</th><th>Origins</th><th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loadError">
          <td colspan="7" class="empty">{{ loadError }}</td>
        </tr>
        <tr v-else-if="!rows.length">
          <td colspan="7" class="empty">{{ token ? 'No projects yet.' : 'Enter token to load.' }}</td>
        </tr>
        <tr v-for="p in rows" :key="p.publicKey">
          <td class="muted">{{ p.id }}</td>
          <td>{{ p.name }}</td>
          <td class="key">
            <code>{{ p.publicKey }}</code>
            <button class="ghost" style="padding: 2px 6px; font-size: 11px" @click="copyKey(p.publicKey)">copy</button>
          </td>
          <td><span class="pill" :class="p.isActive ? 'on' : 'off'">{{ p.isActive ? 'active' : 'inactive' }}</span></td>
          <td><input v-model="rate[p.publicKey]" class="rl" type="number" min="1" /></td>
          <td style="max-width: 200px; font-size: 12px" class="muted">
            <template v-if="p.allowedOrigins?.length">{{ p.allowedOrigins.join(', ') }}</template>
            <span v-else class="muted">any</span>
          </td>
          <td>
            <div class="actions">
              <button class="ghost" @click="emit('logs', p.publicKey, p.name)">Logs</button>
              <button class="ghost" @click="saveRate(p)">Save rate</button>
              <button class="ghost" @click="flush(p)">Flush cache</button>
              <button :class="{ danger: p.isActive }" @click="toggle(p)">
                {{ p.isActive ? 'Deactivate' : 'Activate' }}
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
