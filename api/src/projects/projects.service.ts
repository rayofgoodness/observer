import { randomBytes } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import type IORedis from 'ioredis'
import type { Knex } from 'knex'
import { encrypt } from '../common/crypto.util'
import { KNEX, REDIS } from '../database/database.module'

export interface Project {
  id: number
  user_id: number | null
  name: string
  public_key: string
  is_active: boolean
  allowed_origins: string[]
  rate_limit_per_minute: number
  ai_jira_enabled: boolean
  jira_base_url: string | null
  jira_email: string | null
  jira_api_token_encrypted: string | null
  jira_project_key: string | null
  telegram_chat_id: string | null
  telegram_enabled: boolean
}

export interface ErrorRow {
  id: number
  fingerprint: string
  message: string
  source: string
  level: string
  status: string
  jira_key: string | null
  occurrences_count: number
  first_seen: string
  last_seen: string
}

export interface Breadcrumb {
  type?: string
  category?: string
  message?: string
  level?: string
  timestamp?: string
  data?: Record<string, unknown>
}

export interface OccurrenceRow {
  id: number
  user_id: string | null
  url: string
  route: string
  device: Record<string, unknown>
  breadcrumbs: Breadcrumb[]
  app_version: string
  occurred_at: string
}

const CACHE_TTL_SECONDS = 60
const cacheKey = (publicKey: string) => `project:${publicKey}`

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    @Inject(REDIS) private readonly redis: IORedis,
  ) {}

  async findByPublicKey(publicKey: string): Promise<Project | null> {
    const key = cacheKey(publicKey)

    try {
      // Redis null = not cached; string 'null' = cached miss (negative cache)
      const raw = await this.redis.get(key)
      if (raw !== null) return JSON.parse(raw) as Project | null
    } catch {
      // Redis unavailable — fall through to DB, never block ingest
    }

    const project =
      (await this.db('projects')
        .where({ public_key: publicKey, is_active: true })
        .first()) ?? null

    try {
      await this.redis.set(
        key,
        JSON.stringify(project),
        'EX',
        CACHE_TTL_SECONDS,
      )
    } catch {}

    return project
  }

  /** Drop the cached entry so edits apply immediately across all instances. */
  async invalidate(publicKey: string): Promise<void> {
    try {
      await this.redis.del(cacheKey(publicKey))
    } catch {}
  }

  async update(
    publicKey: string,
    patch: {
      name?: string
      allowedOrigins?: string[]
      isActive?: boolean
      rateLimitPerMinute?: number
      telegramChatId?: string | null
      telegramEnabled?: boolean
    },
  ): Promise<Project | null> {
    const dbPatch: Record<string, unknown> = {}
    if (patch.name !== undefined) dbPatch.name = patch.name
    if (patch.isActive !== undefined) dbPatch.is_active = patch.isActive
    if (patch.rateLimitPerMinute !== undefined)
      dbPatch.rate_limit_per_minute = patch.rateLimitPerMinute
    if (patch.allowedOrigins !== undefined)
      dbPatch.allowed_origins = JSON.stringify(patch.allowedOrigins)
    if (patch.telegramChatId !== undefined)
      dbPatch.telegram_chat_id = patch.telegramChatId || null
    if (patch.telegramEnabled !== undefined)
      dbPatch.telegram_enabled = patch.telegramEnabled

    const [project] = await this.db('projects')
      .where({ public_key: publicKey })
      .update(dbPatch)
      .returning('*')

    // Drop stale cache across all instances so the edit applies immediately
    await this.invalidate(publicKey)
    return project ?? null
  }

  async findById(id: number): Promise<Project | null> {
    return (await this.db('projects').where({ id }).first()) ?? null
  }

  async list(): Promise<Project[]> {
    return this.db('projects').select('*').orderBy('id', 'desc')
  }

  /** Errors for a project (by public key), newest first. Ignores is_active. */
  async listErrorsByPublicKey(
    publicKey: string,
    opts: { limit?: number; offset?: number; status?: string } = {},
  ): Promise<{ items: ErrorRow[]; total: number }> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 200)
    const offset = Math.max(opts.offset ?? 0, 0)

    const base = () => {
      const q = this.db('errors as e')
        .join('projects as p', 'p.id', 'e.project_id')
        .where('p.public_key', publicKey)
      if (opts.status) q.andWhere('e.status', opts.status)
      return q
    }

    const [{ count }] = await base().count<{ count: string }[]>('e.id as count')
    const items = await base()
      .orderBy('e.last_seen', 'desc')
      .limit(limit)
      .offset(offset)
      .select(
        'e.id',
        'e.fingerprint',
        'e.message',
        'e.source',
        'e.level',
        'e.status',
        'e.jira_key',
        'e.occurrences_count',
        'e.first_seen',
        'e.last_seen',
      )
    return { items, total: Number(count) }
  }

  /** Set an error's triage status (new | resolved | ignored). */
  async setErrorStatus(id: number, status: string): Promise<ErrorRow | null> {
    const [row] = await this.db('errors')
      .where({ id })
      .update({ status })
      .returning(['id', 'status'])
    return (row as ErrorRow) ?? null
  }

  /** One error with its stack and most recent occurrences. */
  async getErrorDetail(id: number): Promise<{
    error: ErrorRow & { stack: string; project_id: number }
    occurrences: OccurrenceRow[]
  } | null> {
    const error = await this.db('errors').where({ id }).first()
    if (!error) return null
    const occurrences = await this.db('error_occurrences')
      .where({ error_id: id })
      .orderBy('occurred_at', 'desc')
      .limit(20)
      .select(
        'id',
        'user_id',
        'url',
        'route',
        'device',
        'breadcrumbs',
        'app_version',
        'occurred_at',
      )
    return { error, occurrences }
  }

  /** Projects owned by a user, newest first. */
  async listByUser(userId: number): Promise<Project[]> {
    return this.db('projects')
      .where({ user_id: userId })
      .orderBy('id', 'desc')
      .select('*')
  }

  /** A single project by public key, only if owned by the given user. */
  async findOwned(publicKey: string, userId: number): Promise<Project | null> {
    return (
      (await this.db('projects')
        .where({ public_key: publicKey, user_id: userId })
        .first()) ?? null
    )
  }

  /** True if the error's project is owned by the given user. */
  async errorBelongsToUser(errorId: number, userId: number): Promise<boolean> {
    const row = await this.db('errors as e')
      .join('projects as p', 'p.id', 'e.project_id')
      .where({ 'e.id': errorId, 'p.user_id': userId })
      .first('e.id')
    return Boolean(row)
  }

  async create(input: {
    name: string
    userId?: number
    allowedOrigins?: string[]
    aiJiraEnabled?: boolean
    jiraBaseUrl?: string
    jiraEmail?: string
    jiraApiToken?: string
    jiraProjectKey?: string
  }): Promise<Project> {
    const [project] = await this.db('projects')
      .insert({
        name: input.name,
        user_id: input.userId ?? null,
        public_key: `pk_${randomBytes(24).toString('hex')}`,
        allowed_origins: JSON.stringify(input.allowedOrigins ?? []),
        ai_jira_enabled: input.aiJiraEnabled ?? false,
        jira_base_url: input.jiraBaseUrl ?? null,
        jira_email: input.jiraEmail ?? null,
        jira_api_token_encrypted: input.jiraApiToken
          ? encrypt(input.jiraApiToken)
          : null,
        jira_project_key: input.jiraProjectKey ?? null,
      })
      .returning('*')
    return project
  }
}
