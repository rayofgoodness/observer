import { InjectQueue } from '@nestjs/bullmq'
import { Inject, Injectable } from '@nestjs/common'
import type { Queue } from 'bullmq'
import type { Knex } from 'knex'
import { computeFingerprint } from '../common/fingerprint.util'
import { KNEX } from '../database/database.module'
import type { Project } from '../projects/projects.service'
import type { IncomingErrorDto } from './dto/ingest.dto'

@Injectable()
export class IngestService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    @InjectQueue('jira-tasks') private readonly jiraQueue: Queue,
  ) {}

  async process(project: Project, items: IncomingErrorDto[]) {
    const newErrorIds: number[] = []

    for (const item of items) {
      const message = item.message.trim()
      if (!message) continue
      const stack = item.stack ?? ''
      const fingerprint = computeFingerprint(message, stack)

      const [row] = await this.db('errors')
        .insert({
          project_id: project.id,
          fingerprint,
          message,
          stack,
          source: item.source ?? 'unknown',
          first_seen: this.db.fn.now(),
          last_seen: this.db.fn.now(),
          occurrences_count: 1,
        })
        .onConflict(['project_id', 'fingerprint'])
        .merge({
          last_seen: this.db.fn.now(),
          occurrences_count: this.db.raw('errors.occurrences_count + 1'),
        })
        .returning(['id', this.db.raw('(xmax = 0) as is_new')])

      await this.db('error_occurrences').insert({
        error_id: row.id,
        project_id: project.id,
        user_id: item.userId ?? null,
        url: item.url ?? '',
        route: item.route ?? '',
        device: JSON.stringify(item.device ?? {}),
        app_version: item.appVersion ?? '',
        occurred_at: item.occurredAt
          ? new Date(item.occurredAt)
          : this.db.fn.now(),
      })

      if (row.is_new) newErrorIds.push(row.id)
    }

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
