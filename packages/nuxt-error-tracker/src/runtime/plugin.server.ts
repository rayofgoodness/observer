import { defineNuxtPlugin } from '#imports'
import type { Crumb } from './ingest.codec'

// The capture pipeline is client-only (needs window/document). This server-side
// stub provides matching no-op helpers so `$trackError` / `$addBreadcrumb` are
// always callable — including from a component's `<script setup>`, which runs
// during SSR. Without it, calling them on the server throws "not a function".
export default defineNuxtPlugin(() => ({
  provide: {
    trackError: (_err: unknown) => {},
    addBreadcrumb: (_c: Crumb) => {},
  },
}))
