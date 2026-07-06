import {
  defineNuxtPlugin,
  useCookie,
  useRoute,
  useRouter,
  useRuntimeConfig,
} from '#imports'
import { type Crumb, type ErrorLevel, encodeBatch } from './ingest.codec'

interface CapturedError {
  message: string
  stack: string
  source: 'vue' | 'window' | 'promise' | 'fetch' | 'console'
  level: ErrorLevel
  url: string
  route: string
  occurredAt: string
  breadcrumbs: Crumb[]
}

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig().public.errorTracker
  // Defensive: the module already skips registration without keys, but never
  // let a missing/partial config throw and take down the host Nuxt app.
  if (!config || !config.endpoint || !config.publicKey) return
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

  // Hard ceiling on the in-memory queue so a persistently-unreachable endpoint
  // can never grow it without bound (re-queued failed batches included).
  const MAX_QUEUE = 200

  function flush(useBeacon = false) {
    if (!queue.length) return
    // Fully defensive: nothing in the send path may throw into the host app —
    // flush runs from timers, visibilitychange, and the fetch wrapper.
    try {
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
      // network panel. NOT encryption: anyone with the schema can decode it.
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
        // Re-queue for a later retry, but never past the ceiling (drop oldest).
        if (queue.length < MAX_QUEUE) queue.unshift(...batch)
      })
    } catch {
      // Encoding/serialization failure — drop this batch rather than surface it.
    }
  }

  function scheduleFlush() {
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      flush()
    }, FLUSH_DELAY)
  }

  function capture(
    err: unknown,
    source: CapturedError['source'],
    level: ErrorLevel = 'error',
  ) {
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
        level,
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

  // dataset keys are camelCased by the DOM (data-user-id → userId); render them
  // back to the real kebab attribute name. Cap count + value length.
  // event.target is the deepest node (a <span>/<svg> inside a button), whose
  // dataset is usually empty — the data-* attrs sit on the clickable ancestor.
  // Walk up (bounded) to the nearest element that actually carries data-*.
  const formatDataAttrs = (el: Element): string => {
    let node: Element | null = el
    let dataset: DOMStringMap | undefined
    for (let depth = 0; node && depth < 5; depth++) {
      const ds = (node as HTMLElement).dataset
      if (ds && Object.keys(ds).length > 0) {
        dataset = ds
        break
      }
      node = node.parentElement
    }
    if (!dataset) return ''
    return Object.entries(dataset)
      .slice(0, 5)
      .map(
        ([k, v]) =>
          `data-${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}=${(v ?? '').slice(0, 40)}`,
      )
      .join(' ')
  }

  // Clicks: record the element (tag/id/class/data-*/short text) — never input
  // values. data-* attributes (data-testid, data-action, …) make it clear what
  // was actually clicked when tag/id/class are generic.
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
      const dataAttrs = formatDataAttrs(el)
      const text = (el.textContent ?? '').trim().slice(0, 40)
      addCrumb({
        type: 'click',
        category: 'ui.click',
        message: `${tag}${id}${cls}${dataAttrs ? ` [${dataAttrs}]` : ''}${text ? ` "${text}"` : ''}`,
      })
    },
    { capture: true, passive: true },
  )

  // Inputs (opt-in): record what the user typed, on commit (change/blur), so the
  // trail shows the data they entered. Sensitive fields are masked, never stored
  // in the clear. Fires on `change` (not keystrokes) to avoid flooding.
  if (config.captureInputs) {
    const SENSITIVE =
      /pass|secret|token|otp|onetime|one-time|cvv|cvc|card|iban|ssn|pin|auth|security/i
    const fieldLabel = (el: HTMLInputElement): string =>
      el.name ||
      el.id ||
      el.getAttribute('aria-label') ||
      el.getAttribute('placeholder') ||
      el.type ||
      'field'
    const isSensitive = (el: HTMLInputElement): boolean => {
      const type = (el.type || '').toLowerCase()
      if (type === 'password') return true
      const hint = `${el.name || ''} ${el.id || ''} ${el.getAttribute('autocomplete') || ''}`
      return SENSITIVE.test(hint)
    }

    document.addEventListener(
      'change',
      (event) => {
        try {
          const el = event.target as HTMLInputElement | null
          if (!el || !el.tagName) return
          const tag = el.tagName.toLowerCase()
          if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return
          const type = (el.type || '').toLowerCase()

          let value: string
          if (type === 'checkbox' || type === 'radio') {
            value = el.checked ? 'checked' : 'unchecked'
          } else if (isSensitive(el)) {
            const len = (el.value ?? '').length
            value = len ? `[masked, ${len} chars]` : '[empty]'
          } else {
            const raw = el.value ?? ''
            if (!raw) return // skip empty text fields
            value = raw.length > 100 ? `${raw.slice(0, 100)}…` : raw
          }

          const dataAttrs = formatDataAttrs(el)
          addCrumb({
            type: 'input',
            category: 'ui.input',
            message: `${fieldLabel(el)}${dataAttrs ? ` [${dataAttrs}]` : ''} = ${value}`,
          })
        } catch {
          // Never let breadcrumb capture disrupt the page's own change handlers.
        }
      },
      { capture: true, passive: true },
    )
  }

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

    // Detail capture (opt-out via captureFetchDetails): on a FAILED request we
    // attach full request/response detail to the breadcrumb's `data` so the
    // console shows exactly what was sent and returned. Successful requests stay
    // message-only — attaching detail to all of them would blow the 16 KB
    // server-side trail cap and leak more data than needed.
    const REDACTED = '[redacted]'
    const SENSITIVE_HEADER =
      /^(authorization|cookie|set-cookie|proxy-authorization|x-api-key|x-auth-token|x-csrf-token|x-xsrf-token)$/i
    const MAX_BODY = 2048
    const MAX_HEADER_VAL = 256

    const trunc = (s: string, max: number): string =>
      s.length > max ? `${s.slice(0, max)}…[+${s.length - max}]` : s

    const headersToObj = (
      h: HeadersInit | Headers | undefined,
    ): Record<string, string> => {
      const out: Record<string, string> = {}
      if (!h) return out
      try {
        const entries: Array<[string, string]> =
          h instanceof Headers
            ? [...h.entries()]
            : Array.isArray(h)
              ? (h as Array<[string, string]>)
              : Object.entries(h as Record<string, string>)
        for (const [k, v] of entries) {
          out[k] = SENSITIVE_HEADER.test(k)
            ? REDACTED
            : trunc(String(v), MAX_HEADER_VAL)
        }
      } catch {
        /* ignore malformed headers */
      }
      return out
    }

    const reqHeaders = (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Record<string, string> => {
      const base = input instanceof Request ? headersToObj(input.headers) : {}
      return { ...base, ...headersToObj(init?.headers) }
    }

    const readReqBody = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<string | undefined> => {
      try {
        const body = init?.body
        if (body != null) {
          if (typeof body === 'string') return trunc(body, MAX_BODY)
          if (body instanceof URLSearchParams)
            return trunc(body.toString(), MAX_BODY)
          if (typeof FormData !== 'undefined' && body instanceof FormData)
            return '[FormData]'
          if (typeof Blob !== 'undefined' && body instanceof Blob)
            return `[Blob ${body.size}b]`
          if (body instanceof ArrayBuffer)
            return `[ArrayBuffer ${body.byteLength}b]`
          return '[stream]'
        }
        // Body passed via a Request object (fetch(new Request(url, {body}))).
        if (input instanceof Request) {
          const t = await input.clone().text()
          return t ? trunc(t, MAX_BODY) : undefined
        }
      } catch {
        /* body unreadable (already consumed / stream) — skip */
      }
      return undefined
    }

    // res.clone() so reading the body here never consumes the caller's response.
    const readResBody = async (res: Response): Promise<string | undefined> => {
      try {
        const ct = res.headers.get('content-type') ?? ''
        if (!/json|text|xml|form-urlencoded/i.test(ct))
          return `[${ct || 'binary'}]`
        const len = Number(res.headers.get('content-length') ?? 0)
        if (len > MAX_BODY * 8) return `[too large ${len}b]`
        const t = await res.clone().text()
        return t ? trunc(t, MAX_BODY) : undefined
      } catch {
        /* body unreadable — skip */
      }
      return undefined
    }

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (
        init?.method ?? (input instanceof Request ? input.method : 'GET')
      ).toUpperCase()
      const reqUrl = input instanceof Request ? input.url : String(input)
      const isOwn = reqUrl.startsWith(config.endpoint)
      const startedAt = Date.now()

      try {
        const res = await originalFetch(input, init)
        if (!isOwn) {
          const failed = res.status >= 400
          let data: Record<string, unknown> | undefined
          if (failed && config.captureFetchDetails) {
            data = {
              method,
              url: reqUrl,
              status: res.status,
              statusText: res.statusText,
              durationMs: Date.now() - startedAt,
              requestHeaders: reqHeaders(input, init),
              requestBody: await readReqBody(input, init),
              responseHeaders: headersToObj(res.headers),
              responseBody: await readResBody(res),
            }
          }
          addCrumb({
            type: 'fetch',
            category: 'http',
            level: failed ? 'error' : 'info',
            message: `${method} ${reqUrl} → ${res.status}`,
            data,
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
            data: config.captureFetchDetails
              ? {
                  method,
                  url: reqUrl,
                  error: reason,
                  durationMs: Date.now() - startedAt,
                  requestHeaders: reqHeaders(input, init),
                  requestBody: await readReqBody(input, init),
                }
              : undefined,
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
      trackError: (err: unknown, level: ErrorLevel = 'error') =>
        capture(err, 'window', level),
      addBreadcrumb: (c: Crumb) => addCrumb(c),
    },
  }
})
