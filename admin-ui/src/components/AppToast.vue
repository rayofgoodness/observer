<script setup lang="ts">
import { toastState } from '../composables/useToast'
</script>

<template>
  <div
    class="toast"
    :class="{ show: toastState.show }"
    :style="{ borderColor: toastState.bad ? 'var(--red)' : 'var(--border)' }"
  >
    {{ toastState.msg }}
  </div>
</template>
