# nuxt-error-tracker

**English** · [Українська](./README.uk.md)

Lightweight frontend error tracker for **Nuxt 3 / 4**. It captures unhandled
errors, failed requests, and a breadcrumb trail of user actions, then ships them
to **your own** Observer ingest endpoint. Client-only, batched, and built to
**never break the host app** — if it isn't configured, it does nothing.

You bring the URL and a public key; the package does the capturing. Everything
you send lands under your project in your Observer dashboard, where you view,
search and manage the logs yourself.

---

## Table of contents

- [How it works (the moving parts)](#how-it-works-the-moving-parts)
- [Install](#install)
- [Getting your endpoint and key](#getting-your-endpoint-and-key)
- [Setup](#setup)
- [Configuration via environment variables](#configuration-via-environment-variables)
- [Options](#options)
- [Runtime helpers](#runtime-helpers)
- [What gets sent to the API](#what-gets-sent-to-the-api)
- [Wire format & data types](#wire-format--data-types)
- [Viewing and controlling your logs](#viewing-and-controlling-your-logs)
- [Privacy](#privacy)
- [License](#license)

---

## How it works (the moving parts)

There are three pieces. This package is only the first one.

| Piece | What it is | Responsibility |
| --- | --- | --- |
| **This package** (`nuxt-error-tracker`) | A Nuxt module you install in your app | Hooks into the browser, captures errors + breadcrumbs, batches them, and POSTs to your endpoint. Runs **client-side only**. |
| **Your ingest endpoint** (`.../v1/ingest`) | The Observer API you host (or are given access to) | Authenticates the request by public key + origin, validates and rate-limits it, deduplicates errors by fingerprint, and stores them. |
| **Your dashboard** | The Observer console UI | Where **you** browse, search, and manage the logs — stack traces, occurrences, breadcrumb trails, retention. |

The package never decides *where* the data goes — **you do**, by pointing
`endpoint` at your host. It ships no default URL. Swap the host and your logs
follow. This is what makes it "bring your own backend": the same package works
against localhost during development and your production Observer instance in
release, just by changing the endpoint.

Inside the package itself:

- **`module.ts`** — the Nuxt module. Reads your options, and **only registers
  the capture plugin if `enabled` + `endpoint` + `publicKey` are all present**.
  Missing any of them → the plugin is never added and your app runs untouched.
  It also normalizes options (clamps `maxBatch ≤ 20`, `maxBreadcrumbs ≤ 50` to
  match server limits) and injects TypeScript types for the helpers.
- **`plugin.client.ts`** — the actual capture engine (browser only). Listens for
  errors, wraps `fetch`, patches `console.error`, records breadcrumbs, and
  manages the send queue.
- **`plugin.server.ts`** — a tiny SSR stub. Provides no-op `$trackError` /
  `$addBreadcrumb` so calling them during server-side rendering never throws.
- **`ingest.codec.ts`** — a hand-rolled protobuf encoder (no dependencies) that
  turns a batch into the binary wire format the API expects.

---

## Install

```bash
npm i nuxt-error-tracker
# or: bun add nuxt-error-tracker
```

---

## Getting your endpoint and key

The module needs exactly two things to start reporting: an **ingest endpoint**
(your URL) and a **public key** (which project the errors belong to). Both come
from your Observer dashboard.

1. Open the dashboard at `https://<your-observer-host>/dashboard`.
2. **Create an account** — enter an email and a password (min 8 chars), submit.
   You stay signed in via a secure httpOnly cookie.
3. Click **New project**, give it a name (e.g. `my-app`), and optionally list the
   origins your site runs on (comma-separated, e.g.
   `https://my-app.com, http://localhost:3000`). Empty = accept any origin. This
   is the **server-side allowlist** — requests from other origins are rejected.
4. The project now shows a **public key** (`pk_…`) and a ready-made `nuxt.config`
   snippet. Use **Copy key** / **Copy config**.
5. The **endpoint** is your host + `/v1/ingest`, i.e.
   `https://<your-observer-host>/v1/ingest`.

### What the two values actually do

- **`endpoint`** — *where* to send. This is your URL. Point it at whatever host
  runs the Observer API. There is no hosted default; you are always sending to
  your own backend.
- **`publicKey`** — *whose project* the errors are. On every request the API
  looks up the project by this key (`X-Public-Key` header, or `?key=` query for
  the beacon path), then enforces that project's origin allowlist and rate
  limit. It is a **public** value — safe to ship in client bundles. It grants
  *write-only* ingest for one project; it does **not** let anyone read your logs.
  Reading requires your dashboard login.

> **Origins matter.** If you set an allowlist, it must include **every** origin
> your app is served from — production domains **and** `http://localhost:3000`
> for local dev — or the browser's requests get a `401`. Leave it empty while
> experimenting, tighten it for production.

Once configured (below) and deployed, captured errors appear under that project
in the dashboard. Open **Logs** on the project to browse them.

---

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

That's the minimum. Everything else has sensible defaults.

### No keys? No problem

If `endpoint` or `publicKey` is empty (or `enabled: false`), the plugin is never
registered and your app runs untouched. This makes it safe to leave the module
installed while wiring keys per-environment — dev builds without a key simply
don't track. There is no crash, no console noise, no network call.

---

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

This is the recommended way to point the same build at a **different endpoint**
per environment (staging vs. production) without touching code.

---

## Options

| Option                | Type      | Default     | Description                                                        |
| --------------------- | --------- | ----------- | ------------------------------------------------------------------ |
| `endpoint`            | `string`  | `''`        | Ingest URL (`.../v1/ingest`). **Required** — your host.            |
| `publicKey`           | `string`  | `''`        | Your project's public key (`pk_…`). **Required**.                  |
| `appVersion`          | `string`  | `'unknown'` | Tags every batch with a release/version so you can filter by it.   |
| `enabled`             | `boolean` | `true`      | Master switch. `false` = fully disabled, plugin not registered.    |
| `captureFetch`        | `boolean` | `true`      | Wrap `fetch` to breadcrumb requests and report failures / 5xx.     |
| `captureFetchDetails` | `boolean` | `true`      | Attach full request/response detail (method, status, timing, headers, request payload, response body) to each fetch breadcrumb. Sensitive headers redacted, bodies truncated to 2 KB. Set `false` to keep fetch crumbs message-only (avoids capturing payloads / PII). |
| `captureConsole`      | `boolean` | `true`      | Patch `console.error` to capture logged-but-not-thrown errors.     |
| `captureInputs`       | `boolean` | `false`     | Record form input values as breadcrumbs (on change/blur). Sensitive fields masked. **Opt-in** — captures user-entered data. |
| `flushDelay`          | `number`  | `2000`      | Debounce (ms) before a queued batch is sent.                       |
| `maxPerSession`       | `number`  | `5`         | Max occurrences of the *same* error captured per session.          |
| `maxBatch`            | `number`  | `20`        | Max errors per request (clamped to server hard cap of 20).         |
| `maxBreadcrumbs`      | `number`  | `30`        | Breadcrumbs kept in the ring buffer / sent per error (clamped to 50). |

---

## Runtime helpers

The plugin injects two helpers for manual use:

```ts
const { $trackError, $addBreadcrumb } = useNuxtApp()

// Report a handled error yourself — optional severity level
// ('fatal' | 'error' | 'warning' | 'info' | 'debug', default 'error')
try {
  await mayFail()
} catch (e) {
  $trackError(e, 'warning')
}

// Add your own breadcrumb to the trail
$addBreadcrumb({
  type: 'custom',
  category: 'checkout',
  message: 'user clicked pay',
  level: 'info',
})
```

Both helpers are always callable. Real capture happens **client-side only**; on
the server (SSR — e.g. top-level `<script setup>`) they are safe no-ops, so
calling them never throws.

`$trackError` and `$addBreadcrumb` are **fully typed** — the module ships an
augmentation for `NuxtApp` and Vue's `ComponentCustomProperties`, so both
`useNuxtApp()` and template usage resolve them as functions (no `unknown` /
TS18046). No manual `.d.ts` needed.

---

## What gets sent to the API

Nothing is sent until an error occurs. The package keeps an in-memory breadcrumb
ring buffer as the user interacts; when an error is captured, it snapshots that
trail, queues the error, and (after a debounce) POSTs a **batch**.

A batch has two parts: **`meta`** (sent once per batch, applies to all errors in
it) and **`errors`** (the array of captured errors).

### `meta` (once per batch)

| Field        | Type     | Source | Notes |
| ------------ | -------- | ------ | ----- |
| `device`     | `object` | `navigator` / `window` | `userAgent`, `language`, `platform`, `screen` (`WxH`), `viewport` (`WxH`), `online` (bool), `memory` (`deviceMemory`, GB or `null`), `connection` (`effectiveType` or `null`). Server caps the JSON at 2 KB. |
| `userId`     | `string` \| `null` | `user_id` cookie | Read from a cookie named `user_id` if present, else `null`. The package never invents an id. Max 100 chars. |
| `appVersion` | `string` | your `appVersion` option | Defaults to `'unknown'`. Max 50 chars. |

### `errors[]` (per captured error)

| Field         | Type      | Description | Limit |
| ------------- | --------- | ----------- | ----- |
| `message`     | `string`  | Error message. | ≤ 1000 chars |
| `stack`       | `string`  | Stack trace. | ≤ 8000 chars |
| `source`      | `string`  | Where it came from: `vue`, `window`, `promise`, `fetch`, or `console`. | ≤ 20 chars |
| `level`       | `string`  | Severity: `fatal` \| `error` \| `warning` \| `info` \| `debug`. | one of |
| `url`         | `string`  | `window.location.href` at capture time. | ≤ 2000 chars |
| `route`       | `string`  | Nuxt route `fullPath`. | ≤ 500 chars |
| `occurredAt`  | `string`  | ISO-8601 timestamp. | ISO-8601 |
| `breadcrumbs` | `Breadcrumb[]` | The trail leading up to the error (see below). | ≤ 50 items |

Each **`Breadcrumb`**:

| Field       | Type     | Description | Limit |
| ----------- | -------- | ----------- | ----- |
| `type`      | `string` | `click`, `input`, `navigation`, `fetch`, `console`, or your custom type. | ≤ 30 chars |
| `category`  | `string` | e.g. `ui.click`, `ui.input`, `navigation`, `http`, `console`. | ≤ 60 chars |
| `message`   | `string` | Human-readable line, e.g. `POST /api/pay → 500`. | ≤ 500 chars |
| `level`     | `string` | `info` \| `error` \| … | ≤ 20 chars |
| `timestamp` | `string` | ISO-8601. | ISO-8601 |
| `data`      | `object` | Optional structured payload (fetch details: method, status, timing, headers, request/response bodies). | JSON |

**Batch caps:** at most **20 errors per request**; the client also re-queues
failed batches (bounded to 200 in memory) and dedups the *same* error to
`maxPerSession` (5) occurrences per session, so one recurring error can't flood
your quota.

---

## Wire format & data types

Payloads are encoded as **protobuf** (proto3) and POSTed as
`application/x-protobuf`. The encoder is hand-rolled and has **zero
dependencies** — no `protobufjs`, so consumers need no Vite `optimizeDeps` or
CJS-interop config.

The schema (field numbers are load-bearing — they must match the API decoder):

```proto
message Breadcrumb {
  string type      = 1;
  string category  = 2;
  string message   = 3;
  string level     = 4;
  string timestamp = 5;
  string data      = 6;  // JSON-stringified object
}

message Error {
  string message           = 1;
  string stack             = 2;
  string source            = 3;
  string url               = 4;
  string route             = 5;
  string userId            = 6;  // per-error override (unused by this client)
  string appVersion        = 7;  // per-error override (unused by this client)
  string device            = 8;  // per-error override (unused by this client)
  string occurredAt        = 9;
  repeated Breadcrumb breadcrumbs = 10;
  string level             = 11;
}

message Meta  { string device = 1; string userId = 2; string appVersion = 3; }
message Batch { Meta meta = 1; repeated Error errors = 2; }
```

`device` and breadcrumb `data` are objects, so they travel as
**JSON-stringified strings** inside the protobuf. Empty strings are omitted
(proto3 default). The binary framing just keeps the network panel tidy — it is
**not** encryption; the schema is public, so anyone with it can decode a payload.

### How it's transmitted

- Normal path: `fetch(endpoint, { method: 'POST', headers: { 'Content-Type':
  'application/x-protobuf', 'X-Public-Key': <key> }, body: <bytes>, keepalive:
  true })`.
- Page-hide path: the queue is force-flushed via `navigator.sendBeacon(endpoint
  + '?key=<key>', Blob)` — because a beacon can't set headers, the key rides in
  the `?key=` query param. Falls back to `fetch(..., { keepalive: true })` if
  `sendBeacon` is unavailable or refuses.

The API also accepts plain JSON at the same endpoint (same validation), which is
handy for scripted test posts, but the SDK always sends protobuf.

---

## Viewing and controlling your logs

The point of bringing your own endpoint: after the package sends, **you** own the
data and control it entirely from your dashboard — no third-party console.

- **Browse** — open **Logs** on the project to see error groups, each with its
  message, count, first/last seen, affected routes, and per-occurrence stack
  trace + breadcrumb trail (including captured fetch payloads/responses when
  `captureFetchDetails` is on).
- **Deduplication** — the API groups occurrences by a **fingerprint** (a hash of
  the normalized message + top stack frames), so a recurring error is one row
  with a count, not thousands of duplicates.
- **Rate limit & origins** — each project has its own per-minute rate limit and
  origin allowlist. Tighten origins to reject stray traffic; the key alone is not
  enough to get data in from an unlisted origin.
- **Retention** — occurrences are purged after a retention window (7 days by
  default on the server), so storage stays bounded without any action from you.

Because the key is write-only and reading is gated by your login, shipping the
key in your client bundle exposes no stored data.

---

## Privacy

Click breadcrumbs record the element (tag / id / class / short text / `data-*`
attributes) — **never input values**. Nothing is captured until an error occurs;
breadcrumbs live only in memory and ship attached to an error.

Input values are **only** captured when you opt in with `captureInputs: true`.
Even then, sensitive fields are masked (stored as `[masked, N chars]`, never in
the clear): any `type="password"`, plus fields whose `name` / `id` /
`autocomplete` match `pass`, `secret`, `token`, `otp`, `cvv`, `card`, `iban`,
`ssn`, `pin`, `auth`, etc. Non-sensitive values are truncated to 100 chars.

Fetch detail capture (`captureFetchDetails`, on by default) redacts sensitive
request/response headers (`authorization`, `cookie`, `x-api-key`, CSRF tokens, …)
and truncates bodies to 2 KB. Set it to `false` if you don't want request
payloads or response bodies leaving the browser at all.

---

## License

MIT
