<script setup lang="ts">
import { computed } from 'vue'
import { type Crumb, parseCrumb } from '../utils/breadcrumbs'

const props = defineProps<{
  crumbs: Crumb[]
  emptyText?: string
}>()

const parsed = computed(() => props.crumbs.map(parseCrumb))
</script>

<template>
  <template v-if="parsed.length">
    <h2 style="margin-top: 16px">
      User trail before error
      <span class="muted" style="font-weight: 400; text-transform: none">· latest occurrence</span>
    </h2>
    <ul class="crumbs">
      <li v-for="(c, i) in parsed" :key="i" class="crumb" :class="c.type">
        <span class="ct">{{ c.time }}</span>
        <span class="cc">{{ c.category }}</span>
        <span class="cm">
          {{ c.text }}<span v-for="(b, bi) in c.badges" :key="bi" class="cd">{{ b }}</span>
        </span>
      </li>
    </ul>
  </template>
  <div v-else-if="emptyText" class="muted" style="margin-top: 12px; font-size: 12px">
    {{ emptyText }}
  </div>
</template>
