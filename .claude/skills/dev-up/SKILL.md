---
name: dev-up
description: Bring up the full local observer stack — Postgres+Redis infra, run migrations, then start the API and console UI. Use for onboarding or when the user says "підняти стек", "запустити локально", "dev up", "start the app".
---

# dev-up

Bring the local observer stack online in order. Run steps as separate Bash calls and report failures instead of pushing past them.

## 1. Infra (Postgres + Redis)

```
docker compose up -d
```

Ports are non-default on this machine: Postgres **5434**, Redis **6381** (5432/6379 are taken by other containers). Wait until both containers are healthy before migrating.

## 2. Env

Ensure `api/.env` exists. If not, copy it:

```
cp api/.env.example api/.env
```

Then confirm `DATABASE_URL` points at `localhost:5434` and `REDIS_URL` at `localhost:6381`. `ADMIN_TOKEN` must be set for `/admin/*`.

## 3. Migrations

```
cd api && bun run migrate
```

Knex, applies `api/migrations/*.ts`.

## 4. API (background)

`start:dev` first kills whatever listens on `$PORT`/3040 (avoids EADDRINUSE), then runs `nest start --watch`. Launch it in the background:

```
cd api && bun run start:dev
```

## 5. Console UI

Two options — pick per intent:
- **Serve from the API** (production-like, `/admin` + `/dashboard`): `cd admin-ui && bun run build` produces `admin-ui/dist`, which the API serves. Rebuild after UI changes.
- **HMR dev** (iterating on the UI): `cd admin-ui && bun run dev` — Vite on :5173, proxies API routes to :3040.

## Verify

- API up: hit `GET /admin` (`curl -s localhost:3040/admin`) — once the UI is built it returns the SPA HTML, not the "not built" placeholder. There is no `/health` route.
- To exercise ingestion end-to-end, use the `send-test-error` skill.

Report which steps succeeded and hand back the API/UI URLs.
