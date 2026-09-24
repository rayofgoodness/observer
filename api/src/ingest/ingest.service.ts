import { InjectQueue } from '@nestjs/bullmq'
import { Inject, Injectable } from '@nestjs/common'
import type { Queue } from 'bullmq'
import type { Knex } from 'knex'
import { computeFingerprint } from '../common/fingerprint.util'
import { KNEX } from '../database/database.module'
import type { Project } from '../projects/projects.service'
import type { IngestDto } from './dto/ingest.dto'

interface ErrorGroup {
  fingerprint: string
  message: string
  stack: string
  source: string
  level: string
  count: number
}

interface PendingOccurrence {
  fingerprint: string
  row: Record<string, unknown>
}

interface UpsertedError {
  id: number
  fingerprint: string
  is_new: boolean
}

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
    const items = dto.errors

    // Collapse the batch into one row per fingerprint. A single bulk
    // `INSERT ... ON CONFLICT DO UPDATE` may not touch the same row twice
    // ("cannot affect row a second time"), and repeats of the same error in one
    // batch are the common case. `count` carries how many occurrences the group
    // gets, so occurrences_count stays exact.
    const groups = new Map<string, ErrorGroup>()
    const occurrences: PendingOccurrence[] = []

    for (const item of items) {
      const message = item.message.trim()
      if (!message) continue
      const stack = item.stack ?? ''
      const fingerprint = computeFingerprint(message, stack)
      const level = item.level ?? 'error'

      const group = groups.get(fingerprint)
      if (group) {
        group.count++
        // Reflect the most recent occurrence's severity on the group.
        group.level = level
      } else {
        groups.set(fingerprint, {
          fingerprint,
          message,
          stack,
          source: item.source ?? 'unknown',
          level,
          count: 1,
        })
      }

      const effectiveDevice = item.device ?? dto.meta?.device ?? {}
      const device =
        JSON.stringify(effectiveDevice).length > 2048
          ? { truncated: true }
          : effectiveDevice

      // Cap the breadcrumb trail server-side. Fetch crumbs now carry full
      // request/response detail, so instead of dropping the whole trail when
      // it's large, shed the OLDEST crumbs (furthest from the error, least
      // relevant) until it fits — the most recent context always survives.
      const CRUMB_CAP = 32768
      let breadcrumbs = item.breadcrumbs ?? []
      while (
        breadcrumbs.length > 1 &&
        JSON.stringify(breadcrumbs).length > CRUMB_CAP
      ) {
        breadcrumbs = breadcrumbs.slice(1)
      }
      // A lone crumb still over cap (one huge body) — replace with a marker.
      const safeBreadcrumbs =
        JSON.stringify(breadcrumbs).length > CRUMB_CAP
          ? [{ type: 'truncated', message: 'breadcrumbs too large' }]
          : breadcrumbs

      occurrences.push({
        fingerprint,
        row: {
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
        },
      })
    }

    const newErrorIds: number[] = []

    if (groups.size) {
      // Two statements in one transaction regardless of batch size: atomic
      // (no half-ingested batch) and O(1) round-trips instead of 2 per error.
      await this.db.transaction(async (trx) => {
        // Sorted by fingerprint so concurrent batches lock overlapping rows in
        // the same order — otherwise two upserts can deadlock each other.
        const sorted = [...groups.values()].sort((a, b) =>
          a.fingerprint < b.fingerprint ? -1 : 1,
        )

        // RETURNING order is not guaranteed under ON CONFLICT, so ids are
        // matched back to occurrences by fingerprint.
        const rows: UpsertedError[] = await trx('errors')
          .insert(
            sorted.map((g) => ({
              project_id: project.id,
              fingerprint: g.fingerprint,
              message: g.message,
              stack: g.stack,
              source: g.source,
              level: g.level,
              first_seen: trx.fn.now(),
              last_seen: trx.fn.now(),
              occurrences_count: g.count,
            })),
          )
          .onConflict(['project_id', 'fingerprint'])
          .merge({
            last_seen: trx.fn.now(),
            level: trx.raw('excluded.level'),
            occurrences_count: trx.raw(
              'errors.occurrences_count + excluded.occurrences_count',
            ),
          })
          .returning([
            'id',
            'fingerprint',
            trx.raw('(xmax = 0) as is_new'),
          ])

        const idByFingerprint = new Map<string, number>()
        for (const row of rows) {
          idByFingerprint.set(row.fingerprint, row.id)
          if (row.is_new) newErrorIds.push(row.id)
        }

        await trx('error_occurrences').insert(
          occurrences.map(({ fingerprint, row }) => ({
            error_id: idByFingerprint.get(fingerprint),
            ...row,
          })),
        )
      })
    }

    // Telegram: new error groups are inserted with is_sended = false (DB
    // default) and picked up by the per-minute flush job (TelegramProcessor).
    // Re-seen groups keep their existing is_sended, so already-sent errors never
    // re-notify. No enqueue here — the flush job owns delivery.

    // Fire-and-forget: the queue must not delay the client's response, and a
    // Redis hiccup after the DB commit must not turn into a 5xx (the client
    // would retry and double-count the batch).
    if (newErrorIds.length && project.ai_jira_enabled) {
      for (const id of newErrorIds) {
        this.jiraQueue
          .add(
            'create-jira-task',
            { errorId: id, projectId: project.id },
            {
              jobId: `jira-error-${id}`,
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
            },
          )
          .catch((err) =>
            console.error(`[ingest] failed to enqueue jira task for error ${id}`, err),
          )
      }
    }

    return { ok: true, accepted: items.length, new: newErrorIds.length }
  }
}
