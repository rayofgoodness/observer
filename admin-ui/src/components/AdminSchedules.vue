<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import { toast } from '../composables/useToast'

interface Schedule {
  id?: string
  key: string
  cron?: string
  next?: string | number
}

const rows = ref<Schedule[]>([])
const loadError = ref('')
const cron = ref('0 3 * * *')
const days = ref(7)

// /admin/* authenticates with the admin-role session cookie (AdminGuard).
async function load() {
  loadError.value = ''
  try {
    rows.value = await api<Schedule[]>('GET', '/admin/schedules')
  } catch (e) {
    loadError.value = (e as Error).message
  }
}

async function create() {
  if (!cron.value.trim() || !days.value)
    return toast('Cron and days required', true)
  try {
    await api('POST', '/admin/schedules', {
      cron: cron.value.trim(),
      olderThanDays: Number(days.value),
    })
    toast('Schedule added')
    load()
  } catch (e) {
    toast((e as Error).message, true)
  }
}

async function runNow() {
  try {
    await api('POST', '/admin/schedules/run', {
      olderThanDays: Number(days.value) || 7,
    })
    toast(`Cleanup queued (${Number(days.value) || 7}d)`)
  } catch (e) {
    toast((e as Error).message, true)
  }
}

async function remove(key: string) {
  try {
    await api('DELETE', `/admin/schedules?key=${encodeURIComponent(key)}`)
    toast('Schedule removed')
    load()
  } catch (e) {
    toast((e as Error).message, true)
  }
}

function fmtNext(n: string | number | undefined) {
  return n ? new Date(n).toLocaleString() : '—'
}

onMounted(load)
defineExpose({ load })
</script>

<template>
  <div class="card">
    <h2>Scheduled maintenance · error retention</h2>
    <p class="muted sec-intro">
      By default, errors are kept for <strong>7 days</strong> — a daily job purges older occurrences and error
      groups. Add your own schedules or run a cleanup now.
    </p>
    <div class="row">
      <div>
        <label>Cron (min hour day month weekday)</label>
        <input v-model="cron" type="text" placeholder="0 3 * * *" />
      </div>
      <div>
        <label>Delete older than (days)</label>
        <input v-model="days" type="number" min="1" />
      </div>
      <div style="flex: 0 0 auto"><button @click="create">Add schedule</button></div>
      <div style="flex: 0 0 auto"><button class="ghost" @click="runNow">Run cleanup now</button></div>
    </div>
    <table style="margin-top: 12px">
      <thead>
        <tr><th>Job</th><th>Cron</th><th>Next run</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-if="loadError"><td colspan="4" class="empty">{{ loadError }}</td></tr>
        <tr v-else-if="!rows.length"><td colspan="4" class="empty">No schedules.</td></tr>
        <tr v-for="s in rows" :key="s.key">
          <td>{{ s.id || '—' }}</td>
          <td><code style="font-size: 12px">{{ s.cron || '—' }}</code></td>
          <td class="muted" style="font-size: 12px">{{ fmtNext(s.next) }}</td>
          <td><button class="danger" @click="remove(s.key)">Delete</button></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
