import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, type OnModuleInit } from '@nestjs/common'
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
  constructor(@InjectQueue('notifications') private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    const existing = await this.queue.getRepeatableJobs()
    if (existing.some((j) => j.id === FLUSH_JOB_ID)) return
    await this.queue.add(
      'flush-unsent',
      {},
      { jobId: FLUSH_JOB_ID, repeat: { pattern: FLUSH_CRON } },
    )
  }
}
