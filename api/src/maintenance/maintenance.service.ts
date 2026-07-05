import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, type OnModuleInit } from '@nestjs/common'
import type { Queue } from 'bullmq'
import type { PurgeJobData } from './maintenance.processor'

// Default retention: error occurrences (and error groups not seen since) are
// kept for 7 days, then purged by a daily scheduled job. Override via env.
export const DEFAULT_RETENTION_DAYS =
  Number(process.env.ERROR_RETENTION_DAYS) || 7
const DEFAULT_CRON = process.env.ERROR_RETENTION_CRON || '0 3 * * *' // 03:00 daily
const DEFAULT_JOB_ID = 'retention-default'

export interface ScheduleInput {
  cron: string
  olderThanDays: number
  projectId?: number | null
}

@Injectable()
export class MaintenanceService implements OnModuleInit {
  constructor(
    @InjectQueue('maintenance') private readonly queue: Queue<PurgeJobData>,
  ) {}

  /** Seed the default 7-day retention schedule once, if not already present. */
  async onModuleInit(): Promise<void> {
    const existing = await this.queue.getRepeatableJobs()
    if (existing.some((j) => j.id === DEFAULT_JOB_ID)) return
    await this.queue.add(
      'purge-occurrences',
      { olderThanDays: DEFAULT_RETENTION_DAYS, projectId: null },
      { jobId: DEFAULT_JOB_ID, repeat: { pattern: DEFAULT_CRON } },
    )
  }

  async listSchedules() {
    const jobs = await this.queue.getRepeatableJobs()
    return jobs.map((j) => ({
      key: j.key,
      id: j.id,
      cron: j.pattern,
      next: j.next ? new Date(j.next).toISOString() : null,
    }))
  }

  /** Create a repeatable purge job. Returns the new schedule's key. */
  async createSchedule(input: ScheduleInput) {
    const olderThanDays = Math.max(1, Math.floor(input.olderThanDays || 7))
    const projectId = input.projectId ?? null
    const id = `purge-${projectId ?? 'all'}-${olderThanDays}d`
    await this.queue.add(
      'purge-occurrences',
      { olderThanDays, projectId },
      { jobId: id, repeat: { pattern: input.cron } },
    )
    return { id, cron: input.cron, olderThanDays, projectId }
  }

  /** Remove a repeatable job by its BullMQ repeat key. */
  async removeSchedule(key: string): Promise<boolean> {
    return this.queue.removeRepeatableByKey(key)
  }

  /** Fire a one-off purge immediately (manual "run now"). */
  async runNow(olderThanDays: number, projectId?: number | null) {
    const days = Math.max(1, Math.floor(olderThanDays || 7))
    const job = await this.queue.add('purge-occurrences', {
      olderThanDays: days,
      projectId: projectId ?? null,
    })
    return { enqueued: true, jobId: job.id }
  }
}
