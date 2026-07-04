---
name: send-test-error
description: Send a test error batch to the local ingest API (POST /v1/ingest) to verify ingestion end-to-end — provisions a project via the admin API if no public key is given. Use after changes to ingest, ProjectAuthGuard, fingerprinting, or the ingest DTO.
---

Verify error ingestion end-to-end against the locally running API (default `http://localhost:3001`).

Optional argument: an existing project public key (`pk_...`): $ARGUMENTS

## Steps

1. Preconditions: Postgres/Redis up (`docker compose up -d`), API running (`cd api && bun run start:dev`). If tables are missing, run `cd api && bun run migrate`.
2. Get a public key. If one was passed as an argument, use it. Otherwise provision a test project (read `ADMIN_TOKEN` from `api/.env`):
   ```bash
   curl -s -X POST http://localhost:3001/admin/projects \
     -H "X-Admin-Token: $ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name":"claude-test"}'
   ```
   Response: `{ "id": ..., "name": ..., "publicKey": "pk_..." }`.
3. Send a batch:
   ```bash
   curl -s -X POST http://localhost:3001/v1/ingest \
     -H "X-Public-Key: <pk>" \
     -H "Content-Type: application/json" \
     -d '{"errors":[{"message":"Test error from /send-test-error","stack":"Error: Test\n    at foo (app.js:10:5)\n    at bar (app.js:20:3)\n    at baz (app.js:30:1)","source":"window","url":"http://localhost/test","route":"/test"}]}'
   ```
   Expected response: `{ "ok": true, "accepted": 1, "new": 1 }`.
4. Verify dedup: re-send the exact same batch. Expected `"new": 0`, and in the DB `occurrences_count` increments instead of a new `errors` row:
   ```bash
   docker compose exec postgres psql -U user -d error_tracker \
     -c "SELECT id, left(fingerprint,12) fp, occurrences_count, status FROM errors ORDER BY last_seen DESC LIMIT 5;"
   ```
5. Also test the sendBeacon auth path once: same POST but with `?key=<pk>` query param and no `X-Public-Key` header — must also return `ok: true`.
6. Report: accepted/new counts, dedup behavior, both auth paths, any API log errors.
