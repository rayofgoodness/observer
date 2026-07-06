<script setup lang="ts">
import { computed } from 'vue'
import { type Crumb, parseCrumb } from '../utils/breadcrumbs'

const props = defineProps<{
  crumbs: Crumb[]
  emptyText?: string
  subtitle?: string
}>()

const parsed = computed(() => props.crumbs.map(parseCrumb))

// Render failed-fetch detail as readable sections (headers as key: value lines,
// bodies pretty-printed when JSON, else raw). Falls back to JSON on any error.
function formatDetail(d: Record<string, unknown>): string {
  try {
    const lines: string[] = []
    const scalar = (k: string) => {
      if (d[k] !== undefined && d[k] !== null && typeof d[k] !== 'object')
        lines.push(`${k}: ${d[k]}`)
    }
    scalar('method')
    scalar('url')
    scalar('status')
    scalar('statusText')
    scalar('error')
    scalar('durationMs')

    const headers = (label: string, key: string) => {
      const h = d[key] as Record<string, unknown> | undefined
      if (h && typeof h === 'object' && Object.keys(h).length) {
        lines.push('', `${label}:`)
        for (const [k, v] of Object.entries(h)) lines.push(`  ${k}: ${v}`)
      }
    }
    const body = (label: string, key: string) => {
      const b = d[key]
      if (typeof b === 'string' && b.length) {
        let pretty = b
        try {
          pretty = JSON.stringify(JSON.parse(b), null, 2)
        } catch {
          /* not JSON — show raw */
        }
        lines.push('', `${label}:`, pretty)
      }
    }
    headers('request headers', 'requestHeaders')
    body('request body', 'requestBody')
    headers('response headers', 'responseHeaders')
    body('response body', 'responseBody')
    return lines.join('\n')
  } catch {
    return JSON.stringify(d, null, 2)
  }
}
</script>

<template>
  <template v-if="parsed.length">
    <h2 style="margin-top: 16px">
      User trail before error
      <span class="muted" style="font-weight: 400; text-transform: none">· {{ subtitle || 'latest occurrence' }}</span>
    </h2>
    <ul class="crumbs">
      <li v-for="(c, i) in parsed" :key="i" class="crumb" :class="c.type">
        <span class="ct">{{ c.time }}</span>
        <span class="cc">{{ c.category }}</span>
        <span class="cm">
          {{ c.text }}<span v-for="(b, bi) in c.badges" :key="bi" class="cd">{{ b }}</span>
          <details v-if="c.detail" class="cdetail">
            <summary>request / response detail</summary>
            <pre>{{ formatDetail(c.detail) }}</pre>
          </details>
        </span>
      </li>
    </ul>
  </template>
  <div v-else-if="emptyText" class="muted" style="margin-top: 12px; font-size: 12px">
    {{ emptyText }}
  </div>
</template>

<style scoped>
.cdetail {
  margin-top: 4px;
}
.cdetail summary {
  cursor: pointer;
  font-size: 11px;
  opacity: 0.7;
  user-select: none;
}
.cdetail summary:hover {
  opacity: 1;
}
.cdetail pre {
  margin: 6px 0 0;
  padding: 8px 10px;
  max-height: 320px;
  overflow: auto;
  border-radius: 6px;
  background: rgba(127, 127, 127, 0.1);
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
