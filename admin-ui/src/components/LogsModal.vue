<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { api } from '../api'
import { toast } from '../composables/useToast'
import { type Crumb } from '../utils/breadcrumbs'
import { fmtDate } from '../utils/format'
import BreadcrumbTrail from './BreadcrumbTrail.vue'

interface ErrorRow {
  id: number
  occurrences_count: number
  level?: string
  source: string
  status: string
  message: string
  last_seen: string
  jira_key?: string
  first_seen?: string
  stack?: string
}
interface Occurrence {
  occurred_at: string
  route?: string
  user_id?: string
  app_version?: string
  breadcrumbs?: Crumb[]
}

const props = defineProps<{
  open: boolean
  apiBase: string
  projectKey: string
  projectName: string
  // admin gets status filter tabs + status-change actions + pagination
  advanced?: boolean
}>()
const emit = defineEmits<{ close: [] }>()

const PAGE_SIZE = computed(() => (props.advanced ? 25 : 50))
const STATUSES = ['', 'new', 'resolved', 'ignored']

const view = ref<'list' | 'detail'>('list')
const loading = ref(false)
const list = reactive<{
  items: ErrorRow[]
  total: number
  offset: number
  status: string
}>({
  items: [],
  total: 0,
  offset: 0,
  status: '',
})
const detail = reactive<{ error: ErrorRow | null; occurrences: Occurrence[] }>({
  error: null,
  occurrences: [],
})

async function loadList() {
  loading.value = true
  try {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE.value),
      offset: String(list.offset),
    })
    if (list.status) params.set('status', list.status)
    const res = await api<{ items: ErrorRow[]; total: number }>(
      'GET',
      `${props.apiBase}/projects/${encodeURIComponent(props.projectKey)}/errors?${params}`,
    )
    list.items = res.items
    list.total = res.total
  } catch (e) {
    toast((e as Error).message, true)
  } finally {
    loading.value = false
  }
}

async function openDetail(id: number) {
  view.value = 'detail'
  loading.value = true
  try {
    const d = await api<{ error: ErrorRow; occurrences: Occurrence[] }>(
      'GET',
      `${props.apiBase}/errors/${id}`,
    )
    detail.error = d.error
    detail.occurrences = d.occurrences || []
  } catch (e) {
    toast((e as Error).message, true)
    view.value = 'list'
  } finally {
    loading.value = false
  }
}

async function setStatus(status: string) {
  if (!detail.error) return
  try {
    await api('PATCH', `${props.apiBase}/errors/${detail.error.id}`, { status })
    toast(`Status → ${status}`)
    openDetail(detail.error.id)
  } catch (e) {
    toast((e as Error).message, true)
  }
}

function setFilter(status: string) {
  list.status = status
  list.offset = 0
  loadList()
}
function prev() {
  if (list.offset > 0) {
    list.offset -= PAGE_SIZE.value
    loadList()
  }
}
function next() {
  if (list.offset + PAGE_SIZE.value < list.total) {
    list.offset += PAGE_SIZE.value
    loadList()
  }
}
function backToList() {
  view.value = 'list'
}

const crumbs = computed<Crumb[]>(() => detail.occurrences[0]?.breadcrumbs || [])
const from = computed(() => (list.total ? list.offset + 1 : 0))
const to = computed(() => Math.min(list.offset + PAGE_SIZE.value, list.total))

// (Re)load whenever the modal is opened for a project.
watch(
  () => [props.open, props.projectKey] as const,
  ([open]) => {
    if (open) {
      view.value = 'list'
      list.offset = 0
      list.status = ''
      loadList()
    }
  },
  { immediate: true },
)

function onOverlayClick(e: MouseEvent) {
  if (e.target === e.currentTarget) emit('close')
}
</script>

<template>
  <div class="overlay" :class="{ show: open }" @click="onOverlayClick">
    <div class="modal">
      <div class="modal-head">
        <h3>Errors · {{ projectName || projectKey }}</h3>
        <button class="x" @click="emit('close')">✕ Close</button>
      </div>

      <div v-if="loading" class="empty">Loading…</div>

      <!-- list -->
      <template v-else-if="view === 'list'">
        <div v-if="advanced" class="lognav">
          <div class="tabs" style="margin-bottom: 0">
            <button
              v-for="s in STATUSES"
              :key="s"
              class="ghost tab"
              :class="{ active: list.status === s }"
              @click="setFilter(s)"
            >
              {{ s || 'all' }}
            </button>
          </div>
          <div class="pager">
            <span class="muted" style="font-size: 12px">{{ from }}–{{ to }} of {{ list.total }}</span>
            <button class="ghost" :disabled="list.offset === 0" @click="prev">← Prev</button>
            <button class="ghost" :disabled="to >= list.total" @click="next">Next →</button>
          </div>
        </div>

        <div v-if="!list.items.length" class="empty">
          No errors<template v-if="list.status"> with status "{{ list.status }}"</template>.
        </div>
        <table v-else>
          <thead>
            <tr>
              <th>Count</th><th>Level</th><th>Source</th><th>Status</th><th>Message</th><th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in list.items" :key="e.id" class="err-row" @click="openDetail(e.id)">
              <td>{{ e.occurrences_count }}</td>
              <td><span class="lvl" :class="e.level || 'error'">{{ e.level || 'error' }}</span></td>
              <td><span class="src">{{ e.source }}</span></td>
              <td>
                <span class="badge" :class="e.status">{{ e.status }}</span>
                <span v-if="e.jira_key" class="muted" style="font-size: 11px"> {{ e.jira_key }}</span>
              </td>
              <td style="max-width: 360px">{{ e.message }}</td>
              <td class="muted" style="font-size: 12px">{{ fmtDate(e.last_seen) }}</td>
            </tr>
          </tbody>
        </table>
      </template>

      <!-- detail -->
      <template v-else-if="detail.error">
        <button class="ghost back" @click="backToList">← Back to list</button>
        <div class="det-head">
          <div>
            <span class="lvl" :class="detail.error.level || 'error'">{{ detail.error.level || 'error' }}</span>
            <span class="src">{{ detail.error.source }}</span>
            <span class="badge" :class="detail.error.status">{{ detail.error.status }}</span>
            <span class="muted" style="font-size: 12px">
              · {{ detail.error.occurrences_count }} occurrence(s)
              <template v-if="detail.error.first_seen">· first {{ fmtDate(detail.error.first_seen) }}</template>
            </span>
          </div>
          <div v-if="advanced" class="actions">
            <button class="ghost" :disabled="detail.error.status === 'resolved'" @click="setStatus('resolved')">Resolve</button>
            <button class="ghost" :disabled="detail.error.status === 'ignored'" @click="setStatus('ignored')">Ignore</button>
            <button class="ghost" :disabled="detail.error.status === 'new'" @click="setStatus('new')">Reopen</button>
          </div>
        </div>
        <div style="font-weight: 600; margin-bottom: 2px">{{ detail.error.message }}</div>
        <pre>{{ detail.error.stack || '(no stack)' }}</pre>

        <BreadcrumbTrail :crumbs="crumbs" empty-text="No breadcrumbs recorded for this occurrence." />

        <h2 style="margin-top: 16px">Recent occurrences</h2>
        <table>
          <thead>
            <tr>
              <th>When</th><th>Route</th><th v-if="advanced">User</th><th>App ver</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!detail.occurrences.length"><td colspan="4" class="empty">No occurrences.</td></tr>
            <tr v-for="(o, i) in detail.occurrences" :key="i">
              <td class="muted" style="font-size: 12px">{{ fmtDate(o.occurred_at) }}</td>
              <td style="font-size: 12px">{{ o.route || '—' }}</td>
              <td v-if="advanced" class="muted" style="font-size: 12px">{{ o.user_id || '—' }}</td>
              <td class="muted" style="font-size: 12px">{{ o.app_version || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </template>
    </div>
  </div>
</template>
