<script setup lang="ts">
import { reactive } from 'vue'
import AdminProjects from './AdminProjects.vue'
import AdminSchedules from './AdminSchedules.vue'
import LogsModal from './LogsModal.vue'

// Platform-wide admin console. Authorized by the admin-role session (AdminGuard
// also accepts it), so no X-Admin-Token to paste. Header + sign-out: HomeView.
const modal = reactive({ open: false, key: '', name: '' })

function openLogs(key: string, name: string) {
  modal.key = key
  modal.name = name
  modal.open = true
}
</script>

<template>
  <AdminProjects @logs="openLogs" />
  <AdminSchedules />

  <LogsModal
    :open="modal.open"
    api-base="/admin"
    :project-key="modal.key"
    :project-name="modal.name"
    advanced
    @close="modal.open = false"
  />
</template>
