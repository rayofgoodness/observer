<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { api } from '../api'
import { toast } from '../composables/useToast'
import LogsModal from './LogsModal.vue'
import ProjectCard, { type Project } from './ProjectCard.vue'

// The signed-in user's own projects (owner-scoped /account/* API, session
// cookie). Header + sign-out live in HomeView.
const projects = ref<Project[]>([])
const projectsError = ref('')
const newName = ref('')
const newOrigins = ref('')
const modal = reactive({ open: false, key: '', name: '' })

async function loadProjects() {
  projectsError.value = ''
  try {
    projects.value = await api<Project[]>('GET', '/account/projects')
  } catch (e) {
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

function openLogs(key: string, name: string) {
  modal.key = key
  modal.name = name
  modal.open = true
}

onMounted(loadProjects)
</script>

<template>
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
    <ProjectCard v-for="p in projects" :key="p.publicKey" :project="p" @logs="openLogs" />
  </div>

  <LogsModal
    :open="modal.open"
    api-base="/account"
    :project-key="modal.key"
    :project-name="modal.name"
    @close="modal.open = false"
  />
</template>
