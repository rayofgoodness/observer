import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import type { Queue } from 'bullmq'

const FLUSH_JOB_ID = 'tg-flush-unsent'
// Every minute: drain unsent error groups to Telegram (TelegramProcessor).
const FLUSH_CRON = process.env.TELEGRAM_FLUSH_CRON || '* * * * *'

/**
 * Seeds the repeatable per-minute flush job once. Delivery itself lives in
 * TelegramProcessor; this only ensures the schedule exists.
 */
@Injectable()
export class TelegramScheduler implements OnModuleInit {
  private readonly logger = new Logger(TelegramScheduler.name)

  constructor(@InjectQueue('notifications') private readonly queue: Queue) {}

  /** Fire-and-forget for the same reason as MaintenanceService.onModuleInit. */
  onModuleInit(): void {
    void this.seedFlushJob()
  }

  private async seedFlushJob(): Promise<void> {
    try {
      const existing = await this.queue.getRepeatableJobs()
      if (existing.some((j) => j.id === FLUSH_JOB_ID)) return
      await this.queue.add(
        'flush-unsent',
        {},
        { jobId: FLUSH_JOB_ID, repeat: { pattern: FLUSH_CRON } },
      )
      this.logger.log('Telegram flush schedule seeded')
    } catch (err) {
      this.logger.error(
        `Failed to seed Telegram flush schedule: ${(err as Error).message}`,
      )
    }
  }
}
