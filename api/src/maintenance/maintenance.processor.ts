import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject, Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import type { Knex } from 'knex'
import { KNEX } from '../database/database.module'

export interface PurgeJobData {
  olderThanDays: number
  projectId?: number | null
}

/**
 * Retention worker. Deletes occurrence history and dead error groups older than
 * the configured window. Runs on a schedule (repeatable job) and on-demand.
 */
@Processor('maintenance', { concurrency: 1 })
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name)

  constructor(@Inject(KNEX) private readonly db: Knex) {
    super()
  }

  async process(job: Job<PurgeJobData>): Promise<{
    occurrences: number
    errors: number
  }> {
    const days = Math.max(1, Math.floor(job.data.olderThanDays || 7))
    const projectId = job.data.projectId ?? null
    const cutoff = new Date(Date.now() - days * 86_400_000)

    // 1) Trim old occurrence rows (bloat) — including those of still-active errors.
    const occQuery = this.db('error_occurrences').where(
      'occurred_at',
      '<',
      cutoff,
    )
    if (projectId) occQuery.andWhere('project_id', projectId)
    const occurrences = await occQuery.del()

    // 2) Drop error groups not seen within the window (cascade removes any
    //    remaining occurrences). This is what makes "kept N days" literally true.
    const errQuery = this.db('errors').where('last_seen', '<', cutoff)
    if (projectId) errQuery.andWhere('project_id', projectId)
    const errors = await errQuery.del()

    this.logger.log(
      `purge: removed ${occurrences} occurrence(s) + ${errors} error(s) older than ${days}d` +
        (projectId ? ` (project ${projectId})` : ' (all projects)'),
    )
    return { occurrences, errors }
  }
}
