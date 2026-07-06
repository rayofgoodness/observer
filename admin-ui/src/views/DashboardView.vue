<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { api, type ApiError } from '../api'
import AuthCard from '../components/AuthCard.vue'
import LogsModal from '../components/LogsModal.vue'
import ProjectCard, { type Project } from '../components/ProjectCard.vue'
import { toast } from '../composables/useToast'

const me = ref<{ email: string } | null>(null)
const booting = ref(true)
const projects = ref<Project[]>([])
const projectsError = ref('')
const newName = ref('')
const newOrigins = ref('')

const modal = reactive({ open: false, key: '', name: '' })

async function boot() {
  booting.value = true
  try {
    me.value = await api<{ email: string }>('GET', '/auth/me')
    await loadProjects()
  } catch {
    me.value = null
  } finally {
    booting.value = false
  }
}

async function loadProjects() {
  projectsError.value = ''
  try {
    projects.value = await api<Project[]>('GET', '/account/projects')
  } catch (e) {
    if ((e as ApiError).unauth) return boot()
    projectsError.value = (e as Error).message
  }
}

async function createProject() {
  if (!newName.value.trim()) return toast('Name required', true)
  const allowedOrigins = newOrigins.value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  try {
    await api('POST', '/account/projects', {
      name: newName.value.trim(),
      allowedOrigins,
    })
    newName.value = ''
    newOrigins.value = ''
    toast('Project created')
    loadProjects()
  } catch (e) {
    toast((e as Error).message, true)
  }
}

async function logout() {
  try {
    await api('POST', '/auth/logout')
  } catch {}
  me.value = null
  projects.value = []
}

function openLogs(key: string, name: string) {
  modal.key = key
  modal.name = name
  modal.open = true
}

onMounted(boot)
</script>

<template>
  <div class="wrap">
    <header>
      <h1 style="flex: 1">Observer</h1>
      <span v-if="me" class="muted" style="font-size: 12px">{{ me.email }}</span>
      <button v-if="me" class="ghost" @click="logout">Sign out</button>
    </header>

    <div v-if="booting" class="empty">Loading…</div>

    <AuthCard v-else-if="!me" @authed="boot" />

    <template v-else>
      <div class="card">
        <h2>New project</h2>
        <div class="row">
          <div>
            <label>Name</label>
            <input v-model="newName" type="text" placeholder="my-app" />
          </div>
          <div style="flex: 2">
            <label>Allowed origins (comma-separated, empty = any)</label>
            <input v-model="newOrigins" type="text" placeholder="https://app.example.com, http://localhost:3000" />
          </div>
          <div style="flex: 0 0 auto">
            <button @click="createProject">Create</button>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Your projects</h2>
        <div v-if="projectsError" class="empty">{{ projectsError }}</div>
        <div v-else-if="!projects.length" class="empty">No projects yet. Create one above.</div>
        <ProjectCard
          v-for="p in projects"
          :key="p.publicKey"
          :project="p"
          @logs="openLogs"
        />
      </div>
    </template>

    <LogsModal
      :open="modal.open"
      api-base="/account"
      :project-key="modal.key"
      :project-name="modal.name"
      @close="modal.open = false"
    />
  </div>
</template>
