import {
  defineNuxtPlugin,
  useCookie,
  useRoute,
  useRuntimeConfig,
} from '#imports'

interface CapturedError {
  message: string
  stack: string
  source: 'vue' | 'window' | 'promise'
  url: string
  route: string
  userId: string | null
  appVersion: string
  device: Record<string, unknown>
  occurredAt: string
}

const MAX_PER_SESSION = 5
const FLUSH_DELAY = 2000
const MAX_BATCH = 20

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig().public.errorTracker
  const route = useRoute()

  const queue: CapturedError[] = []
  const sessionCounts = new Map<string, number>()
  let flushTimer: ReturnType<typeof setTimeout> | null = null

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
    const body = { errors: batch }

    if (useBeacon && navigator.sendBeacon) {
      const url = `${config.endpoint}?key=${encodeURIComponent(config.publicKey)}`
      navigator.sendBeacon(
        url,
        new Blob([JSON.stringify(body)], { type: 'application/json' }),
      )
      return
    }

    fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Public-Key': config.publicKey,
      },
      body: JSON.stringify(body),
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
        message: error.message,
        stack: error.stack ?? '',
        source,
        url: window.location.href,
        route: route.fullPath,
        userId: resolveUserId(),
        appVersion: config.appVersion,
        device: deviceInfo(),
        occurredAt: new Date().toISOString(),
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

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true)
  })

  return {
    provide: {
      trackError: (err: unknown) => capture(err, 'window'),
    },
  }
})
