import { randomBytes } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import type { Knex } from 'knex'
import { encrypt } from '../common/crypto.util'
import { KNEX } from '../database/database.module'

export interface Project {
  id: number
  name: string
  public_key: string
  allowed_origins: string[]
  rate_limit_per_minute: number
  ai_jira_enabled: boolean
  jira_base_url: string | null
  jira_email: string | null
  jira_api_token_encrypted: string | null
  jira_project_key: string | null
}

const CACHE_TTL_MS = 60_000

@Injectable()
export class ProjectsService {
  private cache = new Map<
    string,
    { project: Project | null; expires: number }
  >()

  constructor(@Inject(KNEX) private readonly db: Knex) {}

  async findByPublicKey(publicKey: string): Promise<Project | null> {
    const cached = this.cache.get(publicKey)
    if (cached && cached.expires > Date.now()) return cached.project

    const project =
      (await this.db('projects')
        .where({ public_key: publicKey, is_active: true })
        .first()) ?? null
    this.cache.set(publicKey, { project, expires: Date.now() + CACHE_TTL_MS })
    return project
  }

  async findById(id: number): Promise<Project | null> {
    return (await this.db('projects').where({ id }).first()) ?? null
  }

  async create(input: {
    name: string
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
