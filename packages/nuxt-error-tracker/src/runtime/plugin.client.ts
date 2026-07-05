import {
  defineNuxtPlugin,
  useCookie,
  useRoute,
  useRouter,
  useRuntimeConfig,
} from '#imports'
import { type Crumb, encodeBatch } from './ingest.codec'

interface CapturedError {
  message: string
  stack: string
  source: 'vue' | 'window' | 'promise' | 'fetch' | 'console'
  url: string
  route: string
  occurredAt: string
  breadcrumbs: Crumb[]
}

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig().public.errorTracker
  const route = useRoute()

  const FLUSH_DELAY = config.flushDelay ?? 2000
  const MAX_PER_SESSION = config.maxPerSession ?? 5
  const MAX_BATCH = config.maxBatch ?? 20
  const MAX_CRUMBS = config.maxBreadcrumbs ?? 30

  const queue: CapturedError[] = []
  const sessionCounts = new Map<string, number>()
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  // --- Breadcrumbs: ring buffer of recent user actions, snapshotted at error time ---
  const crumbs: Crumb[] = []
  function addCrumb(c: Crumb) {
    crumbs.push({ ...c, timestamp: new Date().toISOString() })
    if (crumbs.length > MAX_CRUMBS) crumbs.shift()
  }

  function deviceInfo(): Record<string, unknown> {
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screen: `${window.screen.width}x${window.screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      online: navigator.onLine,
      memory: (navigator as any).deviceMemory ?? null,
      connection: (navigator as any).connection?.effectiveType ?? null,
    }
  }

  function resolveUserId(): string | null {
    return useCookie<string | null>('user_id').value ?? null
  }

  function sessionKey(message: string, stack: string): string {
    return `${message.slice(0, 120)}::${(stack.split('\n')[1] ?? '').trim()}`
  }

  function flush(useBeacon = false) {
    if (!queue.length) return
    const batch = queue.splice(0, MAX_BATCH)
    const body = {
      meta: {
        device: deviceInfo(),
        userId: resolveUserId(),
        appVersion: config.appVersion,
      },
      errors: batch,
    }

    // Binary wire format (protobuf) — payload isn't human-readable in the
    // network panel. NOT encryption: anyone with the schema can still decode it.
    const bytes = encodeBatch(body)

    if (useBeacon && navigator.sendBeacon) {
      const url = `${config.endpoint}?key=${encodeURIComponent(config.publicKey)}`
      const sent = navigator.sendBeacon(
        url,
        new Blob([bytes], { type: 'application/x-protobuf' }),
      )
      if (sent) return
    }

    fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-protobuf',
        'X-Public-Key': config.publicKey,
      },
      body: bytes,
      keepalive: true,
    }).catch(() => {
      queue.unshift(...batch)
    })
  }

  function scheduleFlush() {
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      flush()
    }, FLUSH_DELAY)
  }

  function capture(err: unknown, source: CapturedError['source']) {
    try {
      const error = err instanceof Error ? err : new Error(String(err))
      if (error.message === 'Script error.') return

      const key = sessionKey(error.message, error.stack ?? '')
      const count = sessionCounts.get(key) ?? 0
      if (count >= MAX_PER_SESSION) return
      sessionCounts.set(key, count + 1)

      queue.push({
        message: error.message.slice(0, 1000),
        stack: (error.stack ?? '').slice(0, 8000),
        source,
        url: window.location.href.slice(0, 2000),
        route: route.fullPath.slice(0, 500),
        occurredAt: new Date().toISOString(),
        // Snapshot the trail leading up to this error (copy, not reference).
        breadcrumbs: crumbs.slice(-MAX_CRUMBS),
      })
      scheduleFlush()
    } catch {}
  }

  nuxtApp.hook('vue:error', (err) => capture(err, 'vue'))

  window.addEventListener('error', (event) =>
    capture(event.error ?? event.message, 'window'),
  )
  window.addEventListener('unhandledrejection', (event) =>
    capture(event.reason, 'promise'),
  )

  // --- Instrumentation feeding the breadcrumb trail ---

  // Clicks: record the element (tag/id/class/short text) — never input values.
  document.addEventListener(
    'click',
    (event) => {
      const el = event.target as Element | null
      if (!el || !el.tagName) return
      const tag = el.tagName.toLowerCase()
      const id = el.id ? `#${el.id}` : ''
      const cls =
        typeof el.className === 'string' && el.className
          ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
          : ''
      const text = (el.textContent ?? '').trim().slice(0, 40)
      addCrumb({
        type: 'click',
        category: 'ui.click',
        message: `${tag}${id}${cls}${text ? ` "${text}"` : ''}`,
      })
    },
    { capture: true, passive: true },
  )

  // Navigation: route changes.
  useRouter().afterEach((to, from) => {
    addCrumb({
      type: 'navigation',
      category: 'navigation',
      message: `${from.fullPath} → ${to.fullPath}`,
    })
  })

  // Instrument fetch: breadcrumb for every request + capture failures (5xx /
  // network errors). Skips our own ingest calls to avoid a capture→flush loop.
  if (config.captureFetch && typeof window.fetch === 'function') {
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (
        init?.method ?? (input instanceof Request ? input.method : 'GET')
      ).toUpperCase()
      const reqUrl = input instanceof Request ? input.url : String(input)
      const isOwn = reqUrl.startsWith(config.endpoint)

      try {
        const res = await originalFetch(input, init)
        if (!isOwn) {
          addCrumb({
            type: 'fetch',
            category: 'http',
            level: res.status >= 400 ? 'error' : 'info',
            message: `${method} ${reqUrl} → ${res.status}`,
          })
          if (res.status >= 500) {
            capture(
              new Error(`HTTP ${res.status} ${method} ${reqUrl}`),
              'fetch',
            )
          }
        }
        return res
      } catch (err) {
        if (!isOwn) {
          const reason = err instanceof Error ? err.message : String(err)
          addCrumb({
            type: 'fetch',
            category: 'http',
            level: 'error',
            message: `${method} ${reqUrl} → failed: ${reason}`,
          })
          capture(
            new Error(`Fetch failed ${method} ${reqUrl}: ${reason}`),
            'fetch',
          )
        }
        throw err
      }
    }
  }

  // Patch console.error: breadcrumb + capture logged-but-not-thrown errors.
  if (config.captureConsole) {
    const originalError = console.error.bind(console)
    console.error = (...args: unknown[]) => {
      const errArg = args.find((a) => a instanceof Error) as Error | undefined
      const message =
        errArg?.message ??
        args
          .map((a) => (typeof a === 'string' ? a : String(a)))
          .join(' ')
          .slice(0, 1000)
      if (message) {
        addCrumb({
          type: 'console',
          category: 'console',
          level: 'error',
          message,
        })
        capture(errArg ?? new Error(message), 'console')
      }
      originalError(...args)
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true)
  })

  return {
    provide: {
      trackError: (err: unknown) => capture(err, 'window'),
      addBreadcrumb: (c: Crumb) => addCrumb(c),
    },
  }
})
