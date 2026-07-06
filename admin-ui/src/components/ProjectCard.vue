<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '../api'
import { toast } from '../composables/useToast'

export interface Project {
  publicKey: string
  name: string
  isActive: boolean
  allowedOrigins?: string[]
  telegramChatId?: string
  telegramEnabled?: boolean
  telegramConfigured?: boolean
}

const props = defineProps<{ project: Project }>()
const emit = defineEmits<{ logs: [key: string, name: string] }>()

const tgChat = ref(props.project.telegramChatId || '')
const tgEnabled = ref(!!props.project.telegramEnabled)

const originsText = computed(() =>
  props.project.allowedOrigins?.length
    ? props.project.allowedOrigins.join(', ')
    : '',
)

const snippet = computed(() => {
  const endpoint = `${location.origin}/v1/ingest`
  return `// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-error-tracker'],
  errorTracker: {
    endpoint: '${endpoint}',
    publicKey: '${props.project.publicKey}',
  },
})`
})

function copyKey() {
  navigator.clipboard
    .writeText(props.project.publicKey)
    .then(() => toast('Key copied'))
}
function copyConfig() {
  navigator.clipboard
    .writeText(snippet.value)
    .then(() => toast('Config copied'))
}
async function saveTelegram() {
  try {
    await api(
      'PATCH',
      `/account/projects/${encodeURIComponent(props.project.publicKey)}`,
      {
        telegramChatId: tgChat.value.trim(),
        telegramEnabled: tgEnabled.value,
      },
    )
    toast('Telegram saved')
  } catch (e) {
    toast((e as Error).message, true)
  }
}
async function testTelegram() {
  try {
    const r = await api<{ ok: boolean; reason?: string }>(
      'POST',
      `/account/projects/${encodeURIComponent(props.project.publicKey)}/telegram/test`,
    )
    toast(
      r.ok ? 'Test sent ✅' : `Test failed: ${r.reason || 'unknown'}`,
      !r.ok,
    )
  } catch (e) {
    toast((e as Error).message, true)
  }
}
</script>

<template>
  <div class="proj">
    <div class="proj-head">
      <span class="name">{{ project.name }}</span>
      <span v-if="!project.isActive" style="font-size: 12px">inactive</span>
      <button class="ghost" @click="emit('logs', project.publicKey, project.name)">Logs</button>
    </div>
    <div class="key">
      <code>{{ project.publicKey }}</code>
      <button class="ghost" style="padding: 4px 10px; font-size: 12px" @click="copyKey">Copy key</button>
    </div>
    <div class="muted" style="font-size: 12px">
      Origins:
      <template v-if="originsText">{{ originsText }}</template>
      <span v-else class="muted">any origin</span>
    </div>

    <div class="snip-head">
      <span>Paste into your Nuxt app</span>
      <button class="ghost" style="padding: 3px 10px; font-size: 11px" @click="copyConfig">Copy config</button>
    </div>
    <pre>{{ snippet }}</pre>

    <div class="tg">
      <div class="snip-head">
        <span>Telegram notifications</span>
        <span
          v-if="!project.telegramConfigured"
          class="muted"
          style="font-size: 11px; text-transform: none"
        >
          bot not set up on server
        </span>
      </div>
      <div class="muted" style="font-size: 11px; margin: 2px 0 8px">
        Add the bot to your chat/group, then paste the chat id. New errors get pushed there.
      </div>
      <div class="row" style="align-items: center">
        <div style="flex: 2">
          <label>Chat id</label>
          <input v-model="tgChat" type="text" placeholder="e.g. -1001234567890" />
        </div>
        <label style="display: flex; align-items: center; gap: 6px; flex: 0 0 auto; margin-top: 16px">
          <input v-model="tgEnabled" type="checkbox" style="width: auto" /> Enabled
        </label>
        <div style="flex: 0 0 auto; margin-top: 16px">
          <button class="ghost" @click="saveTelegram">Save</button>
        </div>
        <div style="flex: 0 0 auto; margin-top: 16px">
          <button class="ghost" @click="testTelegram">Send test</button>
        </div>
      </div>
    </div>
  </div>
</template>
