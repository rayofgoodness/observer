import { InjectQueue } from '@nestjs/bullmq'
import { Inject, Injectable } from '@nestjs/common'
import type { Queue } from 'bullmq'
import type { Knex } from 'knex'
import { computeFingerprint } from '../common/fingerprint.util'
import { KNEX } from '../database/database.module'
import type { Project } from '../projects/projects.service'
import type { IngestDto } from './dto/ingest.dto'

@Injectable()
export class IngestService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    @InjectQueue('jira-tasks') private readonly jiraQueue: Queue,
  ) {}

  async process(project: Project, dto: IngestDto) {
    console.log(
      `[ingest] project=${project.name} (id=${project.id}) errors=${dto.errors.length}`,
      dto.errors.map((e) => e.message),
    )
    const newErrorIds: number[] = []
    const items = dto.errors

    for (const item of items) {
      const message = item.message.trim()
      if (!message) continue
      const stack = item.stack ?? ''
      const fingerprint = computeFingerprint(message, stack)

      const level = item.level ?? 'error'

      const [row] = await this.db('errors')
        .insert({
          project_id: project.id,
          fingerprint,
          message,
          stack,
          source: item.source ?? 'unknown',
          level,
          first_seen: this.db.fn.now(),
          last_seen: this.db.fn.now(),
          occurrences_count: 1,
        })
        .onConflict(['project_id', 'fingerprint'])
        .merge({
          last_seen: this.db.fn.now(),
          // Reflect the most recent occurrence's severity on the group.
          level,
          occurrences_count: this.db.raw('errors.occurrences_count + 1'),
        })
        .returning(['id', this.db.raw('(xmax = 0) as is_new')])

      const effectiveDevice = item.device ?? dto.meta?.device ?? {}
      const device =
        JSON.stringify(effectiveDevice).length > 2048
          ? { truncated: true }
          : effectiveDevice

      // Cap the breadcrumb trail server-side (mirrors device): drop it entirely
      // if abnormally large rather than bloating the row.
      const breadcrumbs = item.breadcrumbs ?? []
      const safeBreadcrumbs =
        JSON.stringify(breadcrumbs).length > 16384
          ? [{ type: 'truncated', message: 'breadcrumbs too large' }]
          : breadcrumbs

      await this.db('error_occurrences').insert({
        error_id: row.id,
        project_id: project.id,
        user_id: item.userId ?? dto.meta?.userId ?? null,
        url: item.url ?? '',
        route: item.route ?? '',
        device: JSON.stringify(device),
        breadcrumbs: JSON.stringify(safeBreadcrumbs),
        app_version: item.appVersion ?? dto.meta?.appVersion ?? '',
        occurred_at: item.occurredAt
          ? new Date(item.occurredAt)
          : this.db.fn.now(),
      })

      if (row.is_new) newErrorIds.push(row.id)
    }

    // Telegram: new error groups are inserted with is_sended = false (DB
    // default) and picked up by the per-minute flush job (TelegramProcessor).
    // Re-seen groups keep their existing is_sended, so already-sent errors never
    // re-notify. No enqueue here — the flush job owns delivery.

    if (newErrorIds.length && project.ai_jira_enabled) {
      await Promise.all(
        newErrorIds.map((id) =>
          this.jiraQueue.add(
            'create-jira-task',
            { errorId: id, projectId: project.id },
            {
              jobId: `jira-error-${id}`,
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
            },
          ),
        ),
      )
    }

    return { ok: true, accepted: items.length, new: newErrorIds.length }
  }
}
