import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject, Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import type { Knex } from 'knex'
import { KNEX } from '../database/database.module'
import { TelegramService } from './telegram.service'

// How many unsent error groups one flush run drains. The per-minute schedule
// keeps draining across runs, so a backlog clears over several minutes.
const FLUSH_BATCH = 50

interface UnsentRow {
  id: number
  message: string
  level: string | null
  source: string | null
  occurrences_count: number
  project_name: string
  telegram_chat_id: string
}

/**
 * Telegram delivery worker. A repeatable 'flush-unsent' job (every minute) pulls
 * error groups with is_sended = false that belong to telegram-enabled projects,
 * sends each to its chat, and flips is_sended = true only for the ones that sent
 * successfully — failures are retried on the next run.
 */
@Processor('notifications', { concurrency: 1 })
export class TelegramProcessor extends WorkerHost {
  private readonly logger = new Logger(TelegramProcessor.name)

  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly telegram: TelegramService,
  ) {
    super()
  }

  async process(_job: Job): Promise<{ sent: number; failed: number }> {
    if (!this.telegram.isConfigured()) return { sent: 0, failed: 0 }

    const rows = await this.db<UnsentRow>('errors as e')
      .join('projects as p', 'p.id', 'e.project_id')
      .where('e.is_sended', false)
      .andWhere('p.telegram_enabled', true)
      .whereNotNull('p.telegram_chat_id')
      .orderBy('e.id')
      .limit(FLUSH_BATCH)
      .select(
        'e.id as id',
        'e.message as message',
        'e.level as level',
        'e.source as source',
        'e.occurrences_count as occurrences_count',
        'p.name as project_name',
        'p.telegram_chat_id as telegram_chat_id',
      )

    if (!rows.length) return { sent: 0, failed: 0 }

    const sentIds: number[] = []
    let failed = 0
    for (const row of rows) {
      const html = this.telegram.formatNewError({
        projectName: row.project_name,
        level: row.level ?? 'error',
        source: row.source ?? 'unknown',
        message: row.message ?? '',
        occurrencesCount: row.occurrences_count,
      })
      const ok = await this.telegram.sendMessage(row.telegram_chat_id, html)
      if (ok) sentIds.push(row.id)
      else failed++
    }

    if (sentIds.length) {
      await this.db('errors').whereIn('id', sentIds).update({ is_sended: true })
    }

    this.logger.log(
      `telegram flush: sent ${sentIds.length}, failed ${failed} (batch ${rows.length})`,
    )
    return { sent: sentIds.length, failed }
  }
}
