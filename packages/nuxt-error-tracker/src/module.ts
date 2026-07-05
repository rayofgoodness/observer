import {
  addPlugin,
  createResolver,
  defineNuxtModule,
  extendViteConfig,
} from '@nuxt/kit'

export interface ModuleOptions {
  endpoint: string
  publicKey: string
  appVersion?: string
  enabled?: boolean
  /** Wrap window.fetch to capture failed requests (network errors + 5xx). Default true. */
  captureFetch?: boolean
  /** Patch console.error to capture logged-but-not-thrown errors. Default true. */
  captureConsole?: boolean
  /** Debounce before a batch is flushed, in ms. Default 2000. */
  flushDelay?: number
  /** Max occurrences of the same error captured per session. Default 5. */
  maxPerSession?: number
  /** Max errors per flushed batch. Default 20 (server also caps at 20). */
  maxBatch?: number
  /** Max breadcrumbs kept in the ring buffer / sent per error. Default 30. */
  maxBreadcrumbs?: number
}

// Coerce env-provided strings/undefined to a positive integer, else fallback.
function posInt(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@ray_of_goodness_/nuxt-error-tracker',
    configKey: 'errorTracker',
  },
  defaults: {
    endpoint: '',
    publicKey: '',
    appVersion: 'unknown',
    enabled: true,
    captureFetch: true,
    captureConsole: true,
    flushDelay: 2000,
    maxPerSession: 5,
    maxBatch: 20,
    maxBreadcrumbs: 30,
  },
  setup(options, nuxt) {
    if (!options.enabled || !options.endpoint || !options.publicKey) return

    nuxt.options.runtimeConfig.public.errorTracker = {
      endpoint: options.endpoint,
      publicKey: options.publicKey,
      appVersion: options.appVersion ?? 'unknown',
      captureFetch: options.captureFetch !== false,
      captureConsole: options.captureConsole !== false,
      flushDelay: posInt(options.flushDelay, 2000),
      maxPerSession: posInt(options.maxPerSession, 5),
      // Server hard-caps batches at 20 — never emit larger, even if misconfigured.
      maxBatch: Math.min(posInt(options.maxBatch, 20), 20),
      // Server DTO caps at 50 breadcrumbs — stay at or below.
      maxBreadcrumbs: Math.min(posInt(options.maxBreadcrumbs, 30), 50),
    }

    // protobufjs is CJS — pre-bundle it so Vite doesn't discover it at
    // runtime and force a dev-server page reload on first error capture.
    extendViteConfig((config) => {
      config.optimizeDeps ||= {}
      config.optimizeDeps.include ||= []
      if (!config.optimizeDeps.include.includes('protobufjs')) {
        config.optimizeDeps.include.push('protobufjs')
      }
    })

    const resolver = createResolver(import.meta.url)
    addPlugin({
      src: resolver.resolve('./runtime/plugin.client'),
      mode: 'client',
    })
  },
})
