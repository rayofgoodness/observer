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

// Checked rows, by error id. Cleared on every (re)load — offsets and filters
// shift what's on screen, and a hidden selection would delete the unexpected.
const selected = ref<number[]>([])
const busy = ref(false)
// Inline confirmation instead of window.confirm: deletes are irreversible, and
// a native dialog blocks the whole page.
const confirmState = reactive<{
  text: string
  run: null | (() => Promise<void>)
}>({ text: '', run: null })

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
    selected.value = []
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
    // Prefer the newest occurrence that actually carries breadcrumbs, so the
    // trail isn't empty just because the very latest hit recorded none.
    const withCrumbs = detail.occurrences.findIndex(
      (o) => (o.breadcrumbs?.length ?? 0) > 0,
    )
    selectedOcc.value = withCrumbs >= 0 ? withCrumbs : 0
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

function toggleRow(id: number) {
  const i = selected.value.indexOf(id)
  if (i >= 0) selected.value.splice(i, 1)
  else selected.value.push(id)
}

const allOnPageSelected = computed(
  () =>
    list.items.length > 0 &&
    list.items.every((e) => selected.value.includes(e.id)),
)

function toggleAll() {
  selected.value = allOnPageSelected.value ? [] : list.items.map((e) => e.id)
}

function askConfirm(text: string, run: () => Promise<void>) {
  confirmState.text = text
  confirmState.run = run
}

function cancelConfirm() {
  confirmState.text = ''
  confirmState.run = null
}

async function runConfirm() {
  const fn = confirmState.run
  if (!fn || busy.value) return
  busy.value = true
  try {
    await fn()
    cancelConfirm()
  } catch (e) {
    toast((e as Error).message, true)
  } finally {
    busy.value = false
  }
}

/**
 * Reload after a delete. When the current page just lost its last rows, step
 * back one page so the user doesn't land on an empty screen.
 */
async function reloadAfterDelete(removed: number) {
  if (list.offset > 0 && list.offset >= list.total - removed) {
    list.offset = Math.max(0, list.offset - PAGE_SIZE.value)
  }
  await loadList()
}

function askDeleteOne(id: number) {
  askConfirm(
    'Delete this error group and all of its occurrences?',
    async () => {
      await api('DELETE', `${props.apiBase}/errors/${id}`)
      toast('Error deleted')
      if (view.value === 'detail') view.value = 'list'
      await reloadAfterDelete(1)
    },
  )
}

function askDeleteSelected() {
  const ids = [...selected.value]
  if (!ids.length) return
  askConfirm(
    `Delete ${ids.length} error group(s) and all of their occurrences?`,
    async () => {
      const res = await api<{ deleted: number }>(
        'POST',
        `${props.apiBase}/errors/bulk-delete`,
        { ids },
      )
      toast(`Deleted ${res.deleted} error(s)`)
      await reloadAfterDelete(res.deleted)
    },
  )
}

function askDeleteAll() {
  const scope = list.status ? `all "${list.status}" errors` : 'ALL errors'
  askConfirm(
    `Delete ${scope} of "${props.projectName || props.projectKey}"? This cannot be undone.`,
    async () => {
      const qs = list.status ? `?status=${encodeURIComponent(list.status)}` : ''
      const res = await api<{ deleted: number }>(
        'DELETE',
        `${props.apiBase}/projects/${encodeURIComponent(props.projectKey)}/errors${qs}`,
      )
      toast(`Deleted ${res.deleted} error(s)`)
      list.offset = 0
      await loadList()
    },
  )
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

// Which occurrence's trail is shown. Defaults to the latest (0); clicking a row
// in "Recent occurrences" switches it, so details saved on any occurrence — not
// just the newest — are viewable.
const selectedOcc = ref(0)
const crumbs = computed<Crumb[]>(
  () => detail.occurrences[selectedOcc.value]?.breadcrumbs || [],
)
const trailLabel = computed(() => {
  const o = detail.occurrences[selectedOcc.value]
  return o ? fmtDate(o.occurred_at) : ''
})
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
      cancelConfirm()
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

      <div v-if="confirmState.run" class="confirm">
        <span>{{ confirmState.text }}</span>
        <div class="actions">
          <button class="ghost" :disabled="busy" @click="cancelConfirm">Cancel</button>
          <button class="danger" :disabled="busy" @click="runConfirm">
            {{ busy ? 'Deleting…' : 'Delete' }}
          </button>
        </div>
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
        <template v-else>
          <div class="bulkbar">
            <span class="muted" style="font-size: 12px">
              <template v-if="selected.length">{{ selected.length }} selected</template>
              <template v-else>Select rows to delete, or wipe the project.</template>
            </span>
            <div class="actions">
              <button class="ghost" :disabled="!selected.length || busy" @click="askDeleteSelected">
                Delete selected<template v-if="selected.length"> ({{ selected.length }})</template>
              </button>
              <button class="danger" :disabled="busy" @click="askDeleteAll">
                Delete all<template v-if="list.status"> "{{ list.status }}"</template>
              </button>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th class="cb">
                  <input
                    type="checkbox"
                    :checked="allOnPageSelected"
                    title="Select all on this page"
                    @change="toggleAll"
                  />
                </th>
                <th>Count</th><th>Level</th><th>Source</th><th>Status</th><th>Message</th><th>Last seen</th><th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in list.items" :key="e.id" class="err-row" @click="openDetail(e.id)">
                <td class="cb" @click.stop>
                  <input
                    type="checkbox"
                    :checked="selected.includes(e.id)"
                    @change="toggleRow(e.id)"
                  />
                </td>
                <td>{{ e.occurrences_count }}</td>
                <td><span class="lvl" :class="e.level || 'error'">{{ e.level || 'error' }}</span></td>
                <td><span class="src">{{ e.source }}</span></td>
                <td>
                  <span class="badge" :class="e.status">{{ e.status }}</span>
                  <span v-if="e.jira_key" class="muted" style="font-size: 11px"> {{ e.jira_key }}</span>
                </td>
                <td style="max-width: 360px">{{ e.message }}</td>
                <td class="muted" style="font-size: 12px">{{ fmtDate(e.last_seen) }}</td>
                <td @click.stop>
                  <button class="ghost del" :disabled="busy" @click="askDeleteOne(e.id)">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </template>
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
          <div class="actions">
            <template v-if="advanced">
              <button class="ghost" :disabled="detail.error.status === 'resolved'" @click="setStatus('resolved')">Resolve</button>
              <button class="ghost" :disabled="detail.error.status === 'ignored'" @click="setStatus('ignored')">Ignore</button>
              <button class="ghost" :disabled="detail.error.status === 'new'" @click="setStatus('new')">Reopen</button>
            </template>
            <button class="danger" :disabled="busy" @click="askDeleteOne(detail.error.id)">Delete</button>
          </div>
        </div>
        <div style="font-weight: 600; margin-bottom: 2px">{{ detail.error.message }}</div>
        <pre>{{ detail.error.stack || '(no stack)' }}</pre>

        <BreadcrumbTrail
          :crumbs="crumbs"
          :subtitle="trailLabel"
          empty-text="No breadcrumbs recorded for this occurrence."
        />

        <h2 style="margin-top: 16px">
          Recent occurrences
          <span class="muted" style="font-weight: 400; text-transform: none; font-size: 12px">
            · click a row to view its trail
          </span>
        </h2>
        <table>
          <thead>
            <tr>
              <th>When</th><th>Route</th><th v-if="advanced">User</th><th>App ver</th><th>Trail</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!detail.occurrences.length"><td colspan="5" class="empty">No occurrences.</td></tr>
            <tr
              v-for="(o, i) in detail.occurrences"
              :key="i"
              class="occ-row"
              :class="{ active: i === selectedOcc }"
              @click="selectedOcc = i"
            >
              <td class="muted" style="font-size: 12px">{{ fmtDate(o.occurred_at) }}</td>
              <td style="font-size: 12px">{{ o.route || '—' }}</td>
              <td v-if="advanced" class="muted" style="font-size: 12px">{{ o.user_id || '—' }}</td>
              <td class="muted" style="font-size: 12px">{{ o.app_version || '—' }}</td>
              <td style="font-size: 12px">
                <span v-if="o.breadcrumbs?.length" class="crumb-count">{{ o.breadcrumbs.length }}</span>
                <span v-else class="muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </template>
    </div>
  </div>
</template>

<style scoped>
.confirm {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(239, 68, 68, 0.45);
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.1);
  font-size: 13px;
}
.bulkbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.cb {
  width: 28px;
  text-align: center;
}
.cb input {
  cursor: pointer;
  margin: 0;
  width: auto;
}
.del {
  padding: 2px 8px;
  font-size: 11px;
}
.occ-row {
  cursor: pointer;
}
.occ-row:hover {
  background: rgba(127, 127, 127, 0.08);
}
.occ-row.active {
  background: rgba(99, 102, 241, 0.14);
}
.crumb-count {
  display: inline-block;
  min-width: 18px;
  padding: 0 6px;
  border-radius: 9px;
  text-align: center;
  font-size: 11px;
  background: rgba(99, 102, 241, 0.18);
}
</style>
