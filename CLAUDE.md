# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Multi-tenant frontend error-tracking SaaS (Sentry-like): NestJS API in `api/`, Nuxt 3 client SDK in `packages/nuxt-error-tracker/`. Two independent packages — no workspace tooling.

## Commands

Package manager is **bun** (README says `npm i` — bun is canonical).

- Local infra (Postgres + Redis): `docker compose up -d` — mapped to non-default host ports **5434** (Postgres) and **6381** (Redis) because 5432/6379 are taken by unrelated containers on this machine; `.env.example` matches
- API dev: `cd api && bun run start:dev`
- Migrations: `cd api && bun run migrate` (Knex, config in `api/knexfile.ts`, migrations in `api/migrations/` with `.ts` extension)
- SDK build: `cd packages/nuxt-error-tracker && bun run build`
- Format/lint: Biome (`bunx biome check --write .` from repo root); a PostToolUse hook auto-formats edited files
- Tests (Vitest, api only): `cd api && bun run test`; single file: `bun run test src/common/fingerprint.util.spec.ts`. Spec files live next to source (`*.spec.ts`), excluded from `nest build` via tsconfig. Use Vitest — not Jest.

## Env

Copy `api/.env.example` → `api/.env`. `APP_ENCRYPTION_KEY` derives the AES-256-GCM key for Jira tokens at rest; `ADMIN_TOKEN` guards `/admin/*`; `ANTHROPIC_API_KEY` powers AI Jira triage.

## Code style

No semicolons, single quotes, 2-space indent (enforced by Biome). Use `import type` for type-only imports — but NEVER for classes consumed by Nest DI (constructor-injected services) or ValidationPipe DTOs in `@Body()` params: type-only imports strip the class from `emitDecoratorMetadata` output and the app fails to boot with `UnknownDependenciesException` (Biome's `useImportType` rule is disabled for exactly this reason — don't re-enable it). DTO validation via class-validator decorators.

## Architecture gotchas

- Error dedup key: `fingerprint` = SHA-256 of normalized message (UUIDs/digits masked, 300-char cap) + stack frames 2–4 (`api/src/common/fingerprint.util.ts`). Unique on `(project_id, fingerprint)`.
- Ingest upsert detects insert-vs-update via the Postgres `xmax = 0` trick (`api/src/ingest/ingest.service.ts:42`) — Postgres-only, breaks on other DBs.
- `ProjectsService.findByPublicKey` caches projects in-memory for 60s per process — project edits (deactivation, rate limits) take up to 60s to apply and don't invalidate across instances.
- Batch DTO limits (`api/src/ingest/dto/ingest.dto.ts`): max 20 errors/request, `message` ≤ 1000, `stack` ≤ 8000, `url` ≤ 2000; optional batch-level `meta` (`device`/`userId`/`appVersion`) applies to all errors unless a per-error field overrides it; merged `device` is capped server-side at 2048 chars (`JSON.stringify` length) — oversized devices are stored as `{ truncated: true }`.
- Auth: `ProjectAuthGuard` accepts `X-Public-Key` header **or** `?key=` query param — the query param exists for the SDK's `sendBeacon` path, which can't set headers. Don't remove it.
- CORS is deliberately wide open in `main.ts`; origin allowlisting happens inside `ProjectAuthGuard`, not at the CORS layer.
- Rate limit: per-project Redis `INCR` per-minute key, default 600/min (`rate_limit_per_minute` column).
- Jira job dedup is double-layered: BullMQ `jobId: jira-error-${id}` at enqueue + `jira_key` re-check in the processor. Keep both.
- Client SDK (`packages/nuxt-error-tracker/src/runtime/plugin.client.ts`): caps 5 occurrences of the same error per session, batches ≤ 20, 2s debounced flush, truncates fields client-side to match DTO limits, sends `device`/`userId`/`appVersion` once as batch-level `meta` per flush, force-flush via `sendBeacon` on page-hide — falls back to `fetch(..., { keepalive: true })` if `sendBeacon` returns `false`.
- `api/src/config/` is an empty placeholder directory — planned env-validation module, not dead code to delete.
