# nuxt-error-tracker

Lightweight frontend error tracker for **Nuxt 3 / 4**. Captures unhandled
errors, failed requests, and a breadcrumb trail of user actions, then ships them
to your Observer ingest endpoint. Client-only, batched, and built to **never
break the host app** — if it isn't configured, it does nothing.

## Features

- Captures Vue errors, `window.onerror`, unhandled promise rejections
- Optional `fetch` instrumentation — auto-reports network failures and 5xx
- Optional `console.error` capture
- **Breadcrumbs**: ring buffer of clicks, route changes, fetches and console
  errors, snapshotted onto each error
- Batched + debounced sending; force-flush on page hide via `sendBeacon`
- Per-session dedup so one recurring error can't flood your quota
- Safe by default: missing keys → plugin is a no-op, never throws

## Install

```bash
npm i nuxt-error-tracker
# or: bun add nuxt-error-tracker
```

## Setup

Add the module and point it at your ingest endpoint with your project's public
key:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-error-tracker'],
  errorTracker: {
    endpoint: 'https://<your-observer-host>/v1/ingest',
    publicKey: 'pk_xxxxxxxxxxxxxxxxxxxxxxxx',
  },
})
```

> The public key identifies your project on the ingest side. It's a **public**
> value — safe to ship in client bundles. Origin allowlisting and rate limiting
> are enforced server-side.

### No keys? No problem

If `endpoint` or `publicKey` is empty (or `enabled: false`), the plugin is never
registered and your app runs untouched. This makes it safe to leave the module
installed while wiring keys per-environment — dev builds without a key simply
don't track.

## Configuration via environment variables

Every option can be driven from the environment instead of hardcoding it, using
Nuxt's `runtimeConfig` public-env convention:

```ini
NUXT_PUBLIC_ERROR_TRACKER_ENDPOINT=https://<your-observer-host>/v1/ingest
NUXT_PUBLIC_ERROR_TRACKER_PUBLIC_KEY=pk_xxxxxxxxxxxxxxxxxxxxxxxx
NUXT_PUBLIC_ERROR_TRACKER_APP_VERSION=1.4.2
```

Wire them in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['nuxt-error-tracker'],
  runtimeConfig: {
    public: {
      errorTracker: {
        endpoint: process.env.NUXT_PUBLIC_ERROR_TRACKER_ENDPOINT,
        publicKey: process.env.NUXT_PUBLIC_ERROR_TRACKER_PUBLIC_KEY,
        appVersion: process.env.NUXT_PUBLIC_ERROR_TRACKER_APP_VERSION,
      },
    },
  },
})
```

## Options

| Option            | Type      | Default     | Description                                                        |
| ----------------- | --------- | ----------- | ------------------------------------------------------------------ |
| `endpoint`        | `string`  | `''`        | Ingest URL (`.../v1/ingest`). Required.                            |
| `publicKey`       | `string`  | `''`        | Your project's public key. Required.                               |
| `appVersion`      | `string`  | `'unknown'` | Tag every error with a release/version.                            |
| `enabled`         | `boolean` | `true`      | Master switch. `false` = fully disabled.                           |
| `captureFetch`    | `boolean` | `true`      | Wrap `fetch` to breadcrumb requests and report failures/5xx.       |
| `captureConsole`  | `boolean` | `true`      | Patch `console.error` to capture logged-but-not-thrown errors.     |
| `flushDelay`      | `number`  | `2000`      | Debounce (ms) before a batch is sent.                              |
| `maxPerSession`   | `number`  | `5`         | Max occurrences of the *same* error captured per session.          |
| `maxBatch`        | `number`  | `20`        | Max errors per request (server also hard-caps at 20).              |
| `maxBreadcrumbs`  | `number`  | `30`        | Breadcrumbs kept in the ring buffer / sent per error (max 50).     |

## Runtime helpers

The plugin injects two helpers for manual use:

```ts
const { $trackError, $addBreadcrumb } = useNuxtApp()

// Report a handled error yourself
try {
  await risky()
} catch (e) {
  $trackError(e)
}

// Add your own breadcrumb to the trail
$addBreadcrumb({
  type: 'custom',
  category: 'checkout',
  message: 'user clicked pay',
  level: 'info',
})
```

## What gets sent

Per error: `message`, `stack`, `source` (`vue` | `window` | `promise` |
`fetch` | `console`), `url`, `route`, timestamp, and the breadcrumb trail. Once
per batch: `device` info (user agent, language, screen/viewport, connection),
`userId` (read from a `user_id` cookie if present), and `appVersion`. Field
lengths are truncated client-side to match server limits.

### Privacy

Click breadcrumbs record the element (tag / id / class / short text) — **never
input values**. Nothing is captured until an error occurs; breadcrumbs live only
in memory and ship attached to an error.

## How it sends

Payloads are encoded as **protobuf** and POSTed as `application/x-protobuf`. On
page-hide the queue is force-flushed via `navigator.sendBeacon`, falling back to
`fetch(..., { keepalive: true })`. Binary framing keeps the network panel tidy —
it is **not** encryption; the schema is public.

## License

MIT
