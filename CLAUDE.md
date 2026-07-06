# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Multi-tenant frontend error-tracking SaaS (Sentry-like). Three independent packages, **no workspace tooling**:
- `api/` — NestJS 11 (Express), Knex + Postgres, ioredis, BullMQ, protobufjs
- `packages/nuxt-error-tracker/` — publishable Nuxt 3 client SDK (ESM-only)
- `admin-ui/` — Vue 3 + Vite SPA (the console; repo-root package, NOT under `packages/`)

## Commands

Package manager is **bun** (README says `npm i` — bun is canonical; every package has its own `bun.lock`).

- Local infra (Postgres + Redis): `docker compose up -d` — mapped to non-default host ports **5434** (Postgres) and **6381** (Redis) because 5432/6379 are taken by unrelated containers on this machine; `.env.example` matches
- API dev: `cd api && bun run start:dev` — the script kills whatever listens on `$PORT`/3040 first (avoids EADDRINUSE)
- Migrations: `cd api && bun run migrate` (Knex, config in `api/knexfile.ts`, `.ts` migrations in `api/migrations/`)
- SDK build: `cd packages/nuxt-error-tracker && bun run build`
- Console UI: `cd admin-ui && bun run build` → `admin-ui/dist` (`build` runs `vue-tsc -b` first, so it typechecks); dev with HMR: `bun run dev` (Vite :5173, proxies API to :3040). The API serves the built `dist` — build it before `start:prod` or `/admin` + `/dashboard` show a "not built" placeholder.
- Format/lint: Biome (`bun run format` = `biome check --write .` from repo root); a PostToolUse hook auto-formats edited files
- Tests (Vitest, api only): `cd api && bun run test`; single file: `bun run test src/common/fingerprint.util.spec.ts`. Spec files live next to source (`*.spec.ts`), excluded from `nest build` via tsconfig. **Use Vitest, not Jest.**

`packages/nuxt-error-tracker/` has **both** `bun.lock` and `pnpm-lock.yaml` committed — the pnpm one exists only so `nuxt-module-build` (SDK `build`) resolves; bun is still the day-to-day manager. Don't "fix" this by deleting either.

## Env

Copy `api/.env.example` → `api/.env`. `APP_ENCRYPTION_KEY` derives the AES-256-GCM key for Jira tokens at rest; `ADMIN_TOKEN` guards `/admin/*`; `ANTHROPIC_API_KEY` powers AI Jira triage; `TELEGRAM_BOT_TOKEN` enables notifications; `ERROR_RETENTION_DAYS`/`ERROR_RETENTION_CRON` tune purge.

## Code style

No semicolons, single quotes, 2-space indent (Biome, enforced). `noExplicitAny` is off. Use `import type` for type-only imports — but NEVER for classes consumed by Nest DI (constructor-injected services) or ValidationPipe DTOs in `@Body()` params: type-only imports strip the class from `emitDecoratorMetadata` output and the app fails to boot with `UnknownDependenciesException` (Biome's `useImportType` rule is disabled for exactly this reason — don't re-enable it). DTO validation via class-validator decorators.

## Git conventions

Conventional Commits (`feat`/`fix`/`refactor`/`chore`/`docs`), **description in Ukrainian**, e.g. `fix(api): звільняти :3040 перед стартом`. Work directly on `main` (no PR flow). **Commit and push only when explicitly asked** — never automatically.

## Architecture gotchas

- Error dedup key: `fingerprint` = SHA-256 of normalized message (UUIDs/digits masked, 300-char cap) + stack frames 2–4 (`api/src/common/fingerprint.util.ts`). Unique on `(project_id, fingerprint)`.
- Ingest upsert detects insert-vs-update via the Postgres `xmax = 0` trick (`api/src/ingest/ingest.service.ts`) — Postgres-only, breaks on other DBs.
- `ProjectsService.findByPublicKey` caches projects in **Redis** (`project:<publicKey>`, 60s TTL, shared across instances; negative-caches misses as the string `'null'`; on Redis error falls back to DB so ingest never blocks). Edits go through `ProjectsService.update` → DB write then `invalidate()` (Redis `DEL`), so admin edits apply immediately across instances; the 60s TTL is only the ceiling for direct-DB changes.
- Batch DTO limits (`api/src/ingest/dto/ingest.dto.ts`): max 20 errors/request, `message` ≤ 1000, `stack` ≤ 8000, `url` ≤ 2000; optional batch-level `meta` (`device`/`userId`/`appVersion`) applies to all errors unless a per-error field overrides it; merged `device` capped server-side at 2048 chars (`JSON.stringify` length) — oversized stored as `{ truncated: true }`.
- Auth: `ProjectAuthGuard` accepts `X-Public-Key` header **or** `?key=` query param — the query param exists for the SDK's `sendBeacon` path, which can't set headers. Don't remove it.
- CORS is deliberately wide open in `main.ts`; origin allowlisting happens inside `ProjectAuthGuard`, not at the CORS layer.
- Rate limit: per-project Redis `INCR` per-minute key, default 600/min (`rate_limit_per_minute` column).
- Jira job dedup is double-layered: BullMQ `jobId: jira-error-${id}` at enqueue + `jira_key` re-check in the processor. Keep both.
- **Ingest wire format is protobuf** (`ingest.codec.ts`). The **API** decodes with protobufjs against `INGEST_PROTO`. The **SDK** (`packages/nuxt-error-tracker/src/runtime/ingest.codec.ts`) hand-rolls a minimal proto3 encoder with **no protobufjs dependency** (so consumers need zero Vite/`optimizeDeps` config). The encoder's field numbers MUST stay wire-compatible with `INGEST_PROTO` (Breadcrumb 1-6, Error 1-10, Meta 1-3, Batch meta=1/errors=2); changing the schema means editing **both** files. SDK POSTs `application/x-protobuf`; `main.ts` captures bytes via `express.raw` and the controller content-negotiates: Buffer body → `decodeBatch`, else JSON. Both paths run the same `IngestDto` validation. JSON is still accepted (the `send-test-error` skill uses it). Binary is obfuscation, NOT security — schema is public.
- Breadcrumbs: SDK keeps a ring buffer (clicks/route/fetch/console.error), snapshots onto each error, ships in protobuf `Error.breadcrumbs`. Stored per-occurrence in `error_occurrences.breadcrumbs` (jsonb, capped 16 KB server-side). `data-*` attrs parsed from the crumb message and rendered as badges (`admin-ui/src/utils/breadcrumbs.ts`).
- **Console UI is one Vue 3 + Vite SPA** in `admin-ui/`. Both consoles live in it: `AdminView` + `DashboardView`, sharing `LogsModal`/`BreadcrumbTrail`/`AppToast`/`api.ts`. Built assets served under `/ui` (`ServeStaticModule`, `rootPath` from `process.cwd()/../admin-ui/dist`; Vite `base` `/ui/` on build, `/` in dev). HTML entry returned at real URLs: `admin-ui.controller.ts` (`GET /admin`) + `dashboard-ui.controller.ts` (`GET /dashboard`) both return `index.html` via `spaIndexHtml()`; the client router shows the right view.
- **Admin console** = SPA's `/admin` route, its HTML gated by `AdminUiMiddleware` (admin-role session: unauth → 302 `/dashboard`, non-admin → 403); the `/admin/*` API keeps its own `X-Admin-Token` `AdminGuard` (SPA stores the token in localStorage, sends as header). Endpoints in `admin.controller.ts`: project CRUD, `flush-cache`, paginated `errors`, `errors/:id` detail, `/admin/schedules*`.
- **Self-service accounts** (`api/src/auth/`): users register/login at `/dashboard`, create projects, copy the public key + `nuxt.config` snippet. Passwords scrypt-hashed (`crypto.util.ts`, `salt:hash` hex — no bcrypt). Sessions = opaque tokens in Redis (`session:<token>`, 30d TTL) as httpOnly `sid` cookie; `AuthGuard` reads it (manual parse in `cookie.util.ts`) → `req.user`. `AccountController` (`/account/*`) is owner-scoped — every route checks `projects.user_id` (via `findOwned`/`errorBelongsToUser`), never trusts the public key alone. `projects.user_id` is nullable (legacy admin-created projects stay unowned). Parallel to, not a replacement for, the `ADMIN_TOKEN` admin console.
- **SDK never breaks the host app**: `module.ts` skips plugin registration when `enabled`/`endpoint`/`publicKey` is missing; `plugin.client.ts` re-guards at runtime + wraps all capture in try/catch. Caps 5 occurrences/error/session, batches ≤ 20, 2s debounced flush, truncates fields to DTO limits, force-flush via `sendBeacon` on page-hide (falls back to `fetch(..., { keepalive: true })`). Caps/timings env-configurable via module options (`flushDelay`/`minFlushInterval`/`sampleRate`/`maxPerMinute`/`maxPerSession`/`maxBatch`/`maxBreadcrumbs`). Send-frequency knobs: `flushDelay` = per-batch debounce; `minFlushInterval` = floor between flushes (throttle during storms); `sampleRate` (0..1) = drop a fraction of occurrences at capture; `maxPerMinute` = client-side fixed-window cap mirroring the server rate limit.
- **Error retention** (`api/src/maintenance/`): errors kept 7 days by default. A BullMQ repeatable job (`maintenance` queue, `purge-occurrences`, daily `0 3 * * *`) deletes `error_occurrences` older than the window + `errors` whose `last_seen` is older. `onModuleInit` seeds the default schedule (`jobId: retention-default`). Admin manages via `/admin/schedules`. Schedules live in Redis (BullMQ repeatable jobs), not a DB table.
- **Telegram notifications** (`api/src/telegram/`): single platform bot (`TELEGRAM_BOT_TOKEN`) pushes new-error alerts to per-project chats (`telegram_chat_id` + `telegram_enabled`). On ingest, **new** error groups (`is_new`) enqueue a `notifications` job (`jobId: tg-error-${id}`, mirrors Jira). No-ops if telegram disabled/unconfigured; `TelegramService.isConfigured()` gates everything.
- `api/src/config/` is an empty placeholder (planned env-validation module), not dead code to delete.
