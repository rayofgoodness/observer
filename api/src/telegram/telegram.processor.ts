import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject, Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import type { Knex } from 'knex'
import { KNEX } from '../database/database.module'
import { TelegramService } from './telegram.service'

export interface NotifyJobData {
  errorId: number
  projectId: number
}

@Processor('notifications', { concurrency: 5 })
export class TelegramProcessor extends WorkerHost {
  private readonly logger = new Logger(TelegramProcessor.name)

  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly telegram: TelegramService,
  ) {
    super()
  }

  async process(job: Job<NotifyJobData>): Promise<void> {
    if (!this.telegram.isConfigured()) return

    const project = await this.db('projects')
      .where({ id: job.data.projectId })
      .first()
    if (!project?.telegram_enabled || !project.telegram_chat_id) return

    const error = await this.db('errors')
      .where({ id: job.data.errorId, project_id: job.data.projectId })
      .first()
    if (!error) return

    const html = this.telegram.formatNewError({
      projectName: project.name,
      level: error.level ?? 'error',
      source: error.source ?? 'unknown',
      message: error.message ?? '',
      occurrencesCount: error.occurrences_count,
    })
    await this.telegram.sendMessage(project.telegram_chat_id, html)
  }
}
