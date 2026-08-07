import {
  addPlugin,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'

export interface ModuleOptions {
  endpoint: string
  publicKey: string
  appVersion?: string
  enabled?: boolean
  /** Wrap window.fetch to capture failed requests (network errors + 5xx). Default true. */
  captureFetch?: boolean
  /**
   * Attach full request/response detail (method, url, status, timing, headers,
   * request payload, response body) to every fetch breadcrumb's `data` for
   * precise debugging. Sensitive headers (authorization/cookie/…) are redacted;
   * bodies are truncated. Default true; set false to keep fetch breadcrumbs
   * message-only (e.g. to avoid capturing request payloads / PII).
   */
  captureFetchDetails?: boolean
  /** Patch console.error to capture logged-but-not-thrown errors. Default true. */
  captureConsole?: boolean
  /**
   * Record form input values as breadcrumbs (on change/blur). Sensitive fields
   * (password/email/tel + name/id matching card/cvv/token/secret/otp/…) are
   * masked. Default false — opt in, since it can capture user-entered data.
   */
  captureInputs?: boolean
  /**
   * How often batches leave the browser (debounce before a flush), in ms.
   * A flush is scheduled `flushDelay` after the first queued error; more errors
   * arriving in that window ride the same batch. Default 2000.
   */
  flushDelay?: number
  /**
   * Floor on the spacing between consecutive flushes, in ms. Unlike `flushDelay`
   * (a per-batch debounce), this throttles the *rate* of network requests during
   * a sustained error storm: a flush never fires sooner than `minFlushInterval`
   * after the previous one. Default 0 (off — `flushDelay` alone governs cadence).
   */
  minFlushInterval?: number
  /**
   * Client-side sampling: fraction (0..1) of captured errors to actually send;
   * the rest are dropped before they ever queue. 1 = send everything (default),
   * 0.3 = keep ~30%. Thins volume at the source so a high-traffic app doesn't
   * flood the per-project server rate limit. Applied per occurrence, before the
   * per-session dedup — so with a low rate even a rare error may be dropped.
   */
  sampleRate?: number
  /**
   * Client-side hard cap on errors *queued* per rolling minute (fixed window);
   * anything over is dropped. Mirrors the server's per-project rate limit so the
   * browser stops emitting instead of shipping batches that get rejected.
   * Default 0 (off — unlimited).
   */
  maxPerMinute?: number
  /**
   * Collapse repeats of the *same* error (same `message` + `source`) that land
   * within this many ms into a single captured occurrence; the repeats are
   * dropped at capture. Aimed at client-side retry loops, which fire a second
   * identical request milliseconds after the first and would otherwise double
   * every occurrence counter for one user-visible failure. Default 0 (off).
   */
  dedupeWindowMs?: number
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

// Coerce to a 0..1 fraction (env provides strings), else fallback.
function clamp01(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : fallback
}

// Coerce to a non-negative integer (0 = disabled), else fallback.
function nonNegInt(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-error-tracker',
    configKey: 'errorTracker',
  },
  defaults: {
    endpoint: '',
    publicKey: '',
    appVersion: 'unknown',
    enabled: true,
    captureFetch: true,
    captureFetchDetails: true,
    captureConsole: true,
    captureInputs: false,
    flushDelay: 2000,
    minFlushInterval: 0,
    sampleRate: 1,
    maxPerMinute: 0,
    dedupeWindowMs: 0,
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
      captureFetchDetails: options.captureFetchDetails !== false,
      captureConsole: options.captureConsole !== false,
      captureInputs: options.captureInputs === true,
      flushDelay: posInt(options.flushDelay, 2000),
      minFlushInterval: nonNegInt(options.minFlushInterval, 0),
      sampleRate: clamp01(options.sampleRate, 1),
      maxPerMinute: nonNegInt(options.maxPerMinute, 0),
      dedupeWindowMs: nonNegInt(options.dedupeWindowMs, 0),
      maxPerSession: posInt(options.maxPerSession, 5),
      // Server hard-caps batches at 20 — never emit larger, even if misconfigured.
      maxBatch: Math.min(posInt(options.maxBatch, 20), 20),
      // Server DTO caps at 50 breadcrumbs — stay at or below.
      maxBreadcrumbs: Math.min(posInt(options.maxBreadcrumbs, 30), 50),
    }

    const resolver = createResolver(import.meta.url)
    // Client plugin does the real capture; server stub provides no-op helpers
    // so $trackError/$addBreadcrumb never throw during SSR.
    addPlugin({
      src: resolver.resolve('./runtime/plugin.server'),
      mode: 'server',
    })
    addPlugin({
      src: resolver.resolve('./runtime/plugin.client'),
      mode: 'client',
    })

    // Type the injected helpers so consumers get `$trackError` / `$addBreadcrumb`
    // as functions (not `unknown`) in both `useNuxtApp()` and templates.
    addTypeTemplate({
      filename: 'types/nuxt-error-tracker.d.ts',
      getContents: () => `
interface Breadcrumb {
  type?: string
  category?: string
  message?: string
  level?: string
  timestamp?: string
  data?: Record<string, unknown>
}
type ErrorLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug'
interface ErrorTrackerHelpers {
  $trackError: (err: unknown, level?: ErrorLevel) => void
  $addBreadcrumb: (crumb: Breadcrumb) => void
}
declare module '#app' {
  interface NuxtApp extends ErrorTrackerHelpers {}
}
declare module 'vue' {
  interface ComponentCustomProperties extends ErrorTrackerHelpers {}
}
export {}
`,
    })
  },
})
