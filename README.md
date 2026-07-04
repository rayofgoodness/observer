# Error Tracker SaaS

Мультитенантний сервіс збору фронтенд-помилок: NestJS API + Nuxt-модуль для клієнтів.

```
error-tracker-saas/
├── api/                          NestJS бекенд (Knex + PostgreSQL + Redis + BullMQ)
└── packages/nuxt-error-tracker/  Nuxt-модуль (npm-пакет для клієнтів SaaS)
```

## Архітектура

**Мультитенантність.** Кожен клієнт — це `project` з власним `public_key` (формат `pk_...`, як DSN у Sentry). Всі errors/occurrences скоупляться по `project_id`, fingerprint унікальний в межах `(project_id, fingerprint)`.

**Безпека публічного ендпоінта.** `POST /v1/ingest` захищений трьома рівнями в `ProjectAuthGuard`:
1. Валідний `public_key` (хедер `X-Public-Key` або `?key=` для sendBeacon)
2. Origin allowlist per project (порожній список = будь-який origin)
3. Rate limit per project через Redis INCR (`rate_limit_per_minute`, дефолт 600)

Public key не секретний — він видимий у браузері. Захист від абʼюзу дають саме origin-перевірка + rate limit.

**Jira per project.** Кожен проєкт має власні Jira-креденшели; API-токен шифрується AES-256-GCM (`APP_ENCRYPTION_KEY`) перед записом у БД. AI-тригер вмикається прапорцем `ai_jira_enabled` на проєкті — це і є "вибіркове підключення".

**Ідемпотентність Jira-задач:** `jobId: jira-error-{id}` у BullMQ + перевірка `jira_key` у процесорі.

## Запуск API

```bash
cd api
npm i
cp .env.example .env
npm run migrate
npm run start:dev
```

## Створення проєкту (provisioning)

```bash
curl -X POST http://localhost:3001/admin/projects \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Shop",
    "allowedOrigins": ["https://myshop.com"],
    "aiJiraEnabled": true,
    "jiraBaseUrl": "https://myteam.atlassian.net",
    "jiraEmail": "bot@myteam.com",
    "jiraApiToken": "...",
    "jiraProjectKey": "FE"
  }'
```

Відповідь містить `publicKey` — його клієнт вставляє у свій Nuxt-конфіг.

## Підключення на клієнті

```ts
export default defineNuxtConfig({
  modules: ['@yourorg/nuxt-error-tracker'],
  errorTracker: {
    endpoint: 'https://api.your-tracker.com/v1/ingest',
    publicKey: 'pk_xxx',
    appVersion: process.env.APP_VERSION
  }
})
```

## Roadmap перед продом

- Дашборд (список помилок, occurrences, графіки) — окремий Nuxt/Vue SPA поверх цього ж API.
- Квоти/білінг: лічильник occurrences per project per month у Redis + soft/hard limit.
- Sourcemap upload endpoint + розшифровка стеків по `app_version`.
- Винести BullMQ-процесор в окремий процес (`WORKER_MODE=true`), якщо API масштабується горизонтально.
- Retention job: чистка occurrences старших за N днів (тариф-залежно).
- Alerting: webhook/email при сплеску `occurrences_count`.
