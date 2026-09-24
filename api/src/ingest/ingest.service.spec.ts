import type { Knex } from 'knex'
import { describe, expect, it, vi } from 'vitest'
import { computeFingerprint } from '../common/fingerprint.util'
import type { Project } from '../projects/projects.service'
import type { IngestDto } from './dto/ingest.dto'
import { IngestService } from './ingest.service'

const NOW = Symbol('now')

interface UpsertRow {
  id: number
  is_new: boolean
}

interface ErrorsInsert {
  rows: any[]
  onConflict?: any
  merge?: any
}

/**
 * Knex mock that counts statements. `outcomes` maps an error message to the
 * row Postgres would return for it (default: existing row, id 900 + index).
 */
function makeDb(outcomes: Record<string, UpsertRow> = {}) {
  const errorsInserts: ErrorsInsert[] = []
  const occurrenceInserts: any[][] = []
  const counters = { transactions: 0, rollbacks: 0 }
  let failOccurrences: Error | null = null

  const table = (name: string) => {
    if (name === 'errors') {
      return {
        insert(rows: any[]) {
          const captured: ErrorsInsert = { rows }
          errorsInserts.push(captured)
          return {
            onConflict(cols: any) {
              captured.onConflict = cols
              return {
                merge(m: any) {
                  captured.merge = m
                  return {
                    returning: async () =>
                      rows.map((r, i) => ({
                        fingerprint: r.fingerprint,
                        ...(outcomes[r.message] ?? {
                          id: 900 + i,
                          is_new: false,
                        }),
                      })).reverse(), // RETURNING order is not guaranteed
                  }
                },
              }
            },
          }
        },
      }
    }
    if (name === 'error_occurrences') {
      return {
        insert: async (rows: any[]) => {
          if (failOccurrences) throw failOccurrences
          occurrenceInserts.push(rows)
        },
      }
    }
    throw new Error(`unexpected table: ${name}`)
  }

  const fnRaw = { fn: { now: () => NOW }, raw: (sql: string) => ({ sql }) }
  const trx: any = Object.assign((name: string) => table(name), fnRaw)
  const db: any = Object.assign((name: string) => table(name), fnRaw, {
    transaction: async (cb: (t: any) => Promise<unknown>) => {
      counters.transactions++
      try {
        return await cb(trx)
      } catch (err) {
        counters.rollbacks++
        throw err
      }
    },
  })

  return {
    db,
    errorsInserts,
    occurrences: () => occurrenceInserts.flat(),
    occurrenceInserts,
    counters,
    failOccurrencesWith: (err: Error) => {
      failOccurrences = err
    },
  }
}

function makeService(outcomes: Record<string, UpsertRow> = {}) {
  const mock = makeDb(outcomes)
  const queue = { add: vi.fn(async () => undefined) }
  const service = new IngestService(mock.db as unknown as Knex, queue as any)
  return { service, queue, ...mock }
}

const project = { id: 7, ai_jira_enabled: false } as unknown as Project
const aiProject = { id: 7, ai_jira_enabled: true } as unknown as Project

const dto = (overrides: Partial<IngestDto>): IngestDto =>
  ({ errors: [{ message: 'boom' }], ...overrides }) as IngestDto

describe('IngestService.process', () => {
  it('returns ok with accepted and new counts', async () => {
    const { service } = makeService({ boom: { id: 1, is_new: true } })
    const result = await service.process(project, dto({}))
    expect(result).toEqual({ ok: true, accepted: 1, new: 1 })
  })

  it('skips items with empty or whitespace-only messages but still counts them as accepted', async () => {
    const { service, errorsInserts, occurrences, counters } = makeService()
    const result = await service.process(
      project,
      dto({ errors: [{ message: '' }, { message: '   ' }] } as any),
    )
    expect(result).toEqual({ ok: true, accepted: 2, new: 0 })
    expect(errorsInserts).toHaveLength(0)
    expect(occurrences()).toHaveLength(0)
    expect(counters.transactions).toBe(0)
  })

  it('trims the message and fingerprints the trimmed message with the stack', async () => {
    const { service, errorsInserts } = makeService()
    const stack = 'Error: x\n    at a (a.js:1:1)'
    await service.process(
      project,
      dto({ errors: [{ message: '  boom  ', stack }] } as any),
    )
    const [row] = errorsInserts[0].rows
    expect(row.message).toBe('boom')
    expect(row.fingerprint).toBe(computeFingerprint('boom', stack))
  })

  it('upserts on (project_id, fingerprint) and adds the group count to occurrences_count on conflict', async () => {
    const { service, errorsInserts } = makeService()
    await service.process(project, dto({}))
    const [{ rows, onConflict, merge }] = errorsInserts
    expect(onConflict).toEqual(['project_id', 'fingerprint'])
    expect(merge.occurrences_count).toEqual({
      sql: 'errors.occurrences_count + excluded.occurrences_count',
    })
    expect(merge.level).toEqual({ sql: 'excluded.level' })
    expect(rows[0].project_id).toBe(7)
    expect(rows[0].source).toBe('unknown')
    expect(rows[0].occurrences_count).toBe(1)
  })

  it('applies defaults when neither per-error fields nor meta are present', async () => {
    const { service, occurrences } = makeService({
      boom: { id: 3, is_new: false },
    })
    await service.process(project, dto({}))
    expect(occurrences()[0]).toMatchObject({
      error_id: 3,
      project_id: 7,
      user_id: null,
      url: '',
      route: '',
      app_version: '',
      device: '{}',
      occurred_at: NOW,
    })
  })

  it('falls back to batch-level meta for userId, appVersion, and device', async () => {
    const { service, occurrences } = makeService()
    await service.process(
      project,
      dto({
        meta: { userId: 'meta-user', appVersion: '2.0', device: { os: 'mac' } },
      } as any),
    )
    expect(occurrences()[0]).toMatchObject({
      user_id: 'meta-user',
      app_version: '2.0',
      device: JSON.stringify({ os: 'mac' }),
    })
  })

  it('per-error fields override batch-level meta', async () => {
    const { service, occurrences } = makeService()
    await service.process(
      project,
      dto({
        meta: { userId: 'meta-user', appVersion: '2.0', device: { os: 'mac' } },
        errors: [
          {
            message: 'boom',
            userId: 'item-user',
            appVersion: '3.1',
            device: { os: 'ios' },
          },
        ],
      } as any),
    )
    expect(occurrences()[0]).toMatchObject({
      user_id: 'item-user',
      app_version: '3.1',
      device: JSON.stringify({ os: 'ios' }),
    })
  })

  it('replaces devices whose JSON exceeds 2048 chars with { truncated: true }', async () => {
    const { service, occurrences } = makeService()
    await service.process(
      project,
      dto({ meta: { device: { blob: 'x'.repeat(5000) } } } as any),
    )
    expect(occurrences()[0].device).toBe(JSON.stringify({ truncated: true }))
  })

  it('keeps devices at exactly 2048 JSON chars untouched', async () => {
    const value = 'x'.repeat(2048 - JSON.stringify({ b: '' }).length)
    const device = { b: value }
    expect(JSON.stringify(device).length).toBe(2048)
    const { service, occurrences } = makeService()
    await service.process(project, dto({ meta: { device } } as any))
    expect(occurrences()[0].device).toBe(JSON.stringify(device))
  })

  it('parses occurredAt into a Date and defaults to db now() otherwise', async () => {
    const { service, occurrences } = makeService()
    await service.process(
      project,
      dto({
        errors: [
          { message: 'a', occurredAt: '2026-07-04T10:00:00.000Z' },
          { message: 'b' },
        ],
      } as any),
    )
    expect(occurrences()[0].occurred_at).toEqual(
      new Date('2026-07-04T10:00:00.000Z'),
    )
    expect(occurrences()[1].occurred_at).toBe(NOW)
  })

  it('enqueues one Jira job per new error when ai_jira_enabled', async () => {
    const { service, queue } = makeService({
      a: { id: 11, is_new: true },
      b: { id: 12, is_new: false },
      c: { id: 13, is_new: true },
    })
    const result = await service.process(
      aiProject,
      dto({
        errors: [{ message: 'a' }, { message: 'b' }, { message: 'c' }],
      } as any),
    )
    expect(result.new).toBe(2)
    expect(queue.add).toHaveBeenCalledTimes(2)
    expect(queue.add).toHaveBeenCalledWith(
      'create-jira-task',
      { errorId: 11, projectId: 7 },
      {
        jobId: 'jira-error-11',
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    )
    expect(queue.add).toHaveBeenCalledWith(
      'create-jira-task',
      { errorId: 13, projectId: 7 },
      expect.objectContaining({ jobId: 'jira-error-13' }),
    )
  })

  it('does not enqueue Jira jobs when ai_jira_enabled is false', async () => {
    const { service, queue } = makeService({ boom: { id: 1, is_new: true } })
    await service.process(project, dto({}))
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('does not enqueue Jira jobs for existing (non-new) errors', async () => {
    const { service, queue } = makeService({ boom: { id: 1, is_new: false } })
    await service.process(aiProject, dto({}))
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('inserts an occurrence row for existing errors too', async () => {
    const { service, occurrences } = makeService({
      boom: { id: 5, is_new: false },
    })
    await service.process(project, dto({}))
    expect(occurrences()).toHaveLength(1)
    expect(occurrences()[0].error_id).toBe(5)
  })

  describe('batching', () => {
    const crumbs = Array.from({ length: 10 }, (_, i) => ({
      type: 'click',
      message: `crumb ${i}`,
    }))
    const fullBatch = () =>
      dto({
        errors: Array.from({ length: 20 }, (_, i) => ({
          message: `error ${String.fromCharCode(97 + i)}`,
          breadcrumbs: crumbs,
        })),
      } as any)

    it('processes a full batch of 20 errors with one statement per table in one transaction', async () => {
      const { service, errorsInserts, occurrenceInserts, counters } =
        makeService()
      const result = await service.process(project, fullBatch())
      expect(result.accepted).toBe(20)
      expect(counters.transactions).toBe(1)
      // O(1), not O(n): a single insert per table carrying all 20 rows.
      expect(errorsInserts).toHaveLength(1)
      expect(errorsInserts[0].rows).toHaveLength(20)
      expect(occurrenceInserts).toHaveLength(1)
      expect(occurrenceInserts[0]).toHaveLength(20)
    })

    it('statement count does not grow with batch size', async () => {
      const one = makeService()
      await one.service.process(project, dto({}))
      const twenty = makeService()
      await twenty.service.process(project, fullBatch())
      expect(twenty.errorsInserts.length).toBe(one.errorsInserts.length)
      expect(twenty.occurrenceInserts.length).toBe(one.occurrenceInserts.length)
    })

    it('collapses repeats of one fingerprint into a single row with the summed count', async () => {
      const { service, errorsInserts, occurrences } = makeService({
        dup: { id: 40, is_new: true },
      })
      const result = await service.process(
        project,
        dto({
          errors: [
            { message: 'dup', level: 'warning' },
            { message: 'other' },
            { message: 'dup', level: 'fatal' },
            { message: 'dup' },
          ],
        } as any),
      )
      const { rows } = errorsInserts[0]
      expect(rows).toHaveLength(2)
      const dup = rows.find((r) => r.message === 'dup')
      expect(dup.occurrences_count).toBe(3)
      // Group level follows the most recent occurrence.
      expect(dup.level).toBe('error')
      // Every occurrence is still stored individually, tied to the group id.
      expect(occurrences().filter((o) => o.error_id === 40)).toHaveLength(3)
      expect(occurrences()).toHaveLength(4)
      expect(result).toEqual({ ok: true, accepted: 4, new: 1 })
    })

    it('upserts rows sorted by fingerprint so concurrent batches lock in the same order', async () => {
      const { service, errorsInserts } = makeService()
      await service.process(project, fullBatch())
      const fingerprints = errorsInserts[0].rows.map((r) => r.fingerprint)
      expect(fingerprints).toEqual([...fingerprints].sort())
    })

    it('matches occurrences to ids by fingerprint, not by RETURNING order', async () => {
      const { service, occurrences } = makeService({
        a: { id: 1, is_new: false },
        b: { id: 2, is_new: false },
      })
      await service.process(
        project,
        dto({ errors: [{ message: 'a', url: '/a' }, { message: 'b', url: '/b' }] } as any),
      )
      const byUrl = Object.fromEntries(
        occurrences().map((o) => [o.url, o.error_id]),
      )
      expect(byUrl).toEqual({ '/a': 1, '/b': 2 })
    })

    it('rolls back and rejects when the occurrences insert fails', async () => {
      const { service, queue, counters, failOccurrencesWith } = makeService({
        boom: { id: 1, is_new: true },
      })
      failOccurrencesWith(new Error('db down'))
      await expect(service.process(aiProject, dto({}))).rejects.toThrow(
        'db down',
      )
      expect(counters.rollbacks).toBe(1)
      expect(queue.add).not.toHaveBeenCalled()
    })
  })

  describe('jira queue', () => {
    it('does not block the response on the queue (fire-and-forget)', async () => {
      const { service, queue } = makeService({ boom: { id: 1, is_new: true } })
      queue.add.mockImplementation(() => new Promise(() => {}) as any)
      await expect(service.process(aiProject, dto({}))).resolves.toEqual({
        ok: true,
        accepted: 1,
        new: 1,
      })
      expect(queue.add).toHaveBeenCalledTimes(1)
    })

    it('swallows and logs enqueue failures instead of failing the request', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { service, queue } = makeService({ boom: { id: 1, is_new: true } })
      queue.add.mockRejectedValue(new Error('redis down'))
      await expect(service.process(aiProject, dto({}))).resolves.toMatchObject({
        ok: true,
      })
      await new Promise((r) => setImmediate(r))
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })
  })
})
