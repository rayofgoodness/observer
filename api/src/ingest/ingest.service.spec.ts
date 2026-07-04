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

function makeDb(results: UpsertRow[]) {
  const upserts: Array<{ rec: any; onConflict?: any; merge?: any }> = []
  const occurrences: any[] = []
  let call = 0

  const db: any = (table: string) => {
    if (table === 'errors') {
      const captured: { rec: any; onConflict?: any; merge?: any } = {
        rec: null,
      }
      upserts.push(captured)
      return {
        insert(rec: any) {
          captured.rec = rec
          return {
            onConflict(cols: any) {
              captured.onConflict = cols
              return {
                merge(m: any) {
                  captured.merge = m
                  return {
                    returning: async () => [
                      results[call++] ?? { id: 900 + call, is_new: false },
                    ],
                  }
                },
              }
            },
          }
        },
      }
    }
    if (table === 'error_occurrences') {
      return {
        insert: async (rec: any) => {
          occurrences.push(rec)
        },
      }
    }
    throw new Error(`unexpected table: ${table}`)
  }
  db.fn = { now: () => NOW }
  db.raw = (sql: string) => ({ sql })
  return { db, upserts, occurrences }
}

function makeService(results: UpsertRow[]) {
  const { db, upserts, occurrences } = makeDb(results)
  const queue = { add: vi.fn(async () => undefined) }
  const service = new IngestService(db as unknown as Knex, queue as any)
  return { service, queue, upserts, occurrences }
}

const project = { id: 7, ai_jira_enabled: false } as unknown as Project
const aiProject = { id: 7, ai_jira_enabled: true } as unknown as Project

const dto = (overrides: Partial<IngestDto>): IngestDto =>
  ({ errors: [{ message: 'boom' }], ...overrides }) as IngestDto

describe('IngestService.process', () => {
  it('returns ok with accepted and new counts', async () => {
    const { service } = makeService([{ id: 1, is_new: true }])
    const result = await service.process(project, dto({}))
    expect(result).toEqual({ ok: true, accepted: 1, new: 1 })
  })

  it('skips items with empty or whitespace-only messages but still counts them as accepted', async () => {
    const { service, upserts, occurrences } = makeService([])
    const result = await service.process(
      project,
      dto({ errors: [{ message: '' }, { message: '   ' }] } as any),
    )
    expect(result).toEqual({ ok: true, accepted: 2, new: 0 })
    expect(upserts).toHaveLength(0)
    expect(occurrences).toHaveLength(0)
  })

  it('trims the message and fingerprints the trimmed message with the stack', async () => {
    const { service, upserts } = makeService([{ id: 1, is_new: true }])
    const stack = 'Error: x\n    at a (a.js:1:1)'
    await service.process(
      project,
      dto({ errors: [{ message: '  boom  ', stack }] } as any),
    )
    expect(upserts[0].rec.message).toBe('boom')
    expect(upserts[0].rec.fingerprint).toBe(computeFingerprint('boom', stack))
  })

  it('upserts on (project_id, fingerprint) and increments occurrences_count on conflict', async () => {
    const { service, upserts } = makeService([{ id: 1, is_new: true }])
    await service.process(project, dto({}))
    expect(upserts[0].onConflict).toEqual(['project_id', 'fingerprint'])
    expect(upserts[0].merge.occurrences_count).toEqual({
      sql: 'errors.occurrences_count + 1',
    })
    expect(upserts[0].rec.project_id).toBe(7)
    expect(upserts[0].rec.source).toBe('unknown')
  })

  it('applies defaults when neither per-error fields nor meta are present', async () => {
    const { service, occurrences } = makeService([{ id: 3, is_new: false }])
    await service.process(project, dto({}))
    expect(occurrences[0]).toMatchObject({
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
    const { service, occurrences } = makeService([{ id: 1, is_new: false }])
    await service.process(
      project,
      dto({
        meta: { userId: 'meta-user', appVersion: '2.0', device: { os: 'mac' } },
      } as any),
    )
    expect(occurrences[0]).toMatchObject({
      user_id: 'meta-user',
      app_version: '2.0',
      device: JSON.stringify({ os: 'mac' }),
    })
  })

  it('per-error fields override batch-level meta', async () => {
    const { service, occurrences } = makeService([{ id: 1, is_new: false }])
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
    expect(occurrences[0]).toMatchObject({
      user_id: 'item-user',
      app_version: '3.1',
      device: JSON.stringify({ os: 'ios' }),
    })
  })

  it('replaces devices whose JSON exceeds 2048 chars with { truncated: true }', async () => {
    const { service, occurrences } = makeService([{ id: 1, is_new: false }])
    await service.process(
      project,
      dto({ meta: { device: { blob: 'x'.repeat(5000) } } } as any),
    )
    expect(occurrences[0].device).toBe(JSON.stringify({ truncated: true }))
  })

  it('keeps devices at exactly 2048 JSON chars untouched', async () => {
    const value = 'x'.repeat(2048 - JSON.stringify({ b: '' }).length)
    const device = { b: value }
    expect(JSON.stringify(device).length).toBe(2048)
    const { service, occurrences } = makeService([{ id: 1, is_new: false }])
    await service.process(project, dto({ meta: { device } } as any))
    expect(occurrences[0].device).toBe(JSON.stringify(device))
  })

  it('parses occurredAt into a Date and defaults to db now() otherwise', async () => {
    const { service, occurrences } = makeService([
      { id: 1, is_new: false },
      { id: 2, is_new: false },
    ])
    await service.process(
      project,
      dto({
        errors: [
          { message: 'a', occurredAt: '2026-07-04T10:00:00.000Z' },
          { message: 'b' },
        ],
      } as any),
    )
    expect(occurrences[0].occurred_at).toEqual(
      new Date('2026-07-04T10:00:00.000Z'),
    )
    expect(occurrences[1].occurred_at).toBe(NOW)
  })

  it('enqueues one Jira job per new error when ai_jira_enabled', async () => {
    const { service, queue } = makeService([
      { id: 11, is_new: true },
      { id: 12, is_new: false },
      { id: 13, is_new: true },
    ])
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
    const { service, queue } = makeService([{ id: 1, is_new: true }])
    await service.process(project, dto({}))
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('does not enqueue Jira jobs for existing (non-new) errors', async () => {
    const { service, queue } = makeService([{ id: 1, is_new: false }])
    await service.process(aiProject, dto({}))
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('inserts an occurrence row for existing errors too', async () => {
    const { service, occurrences } = makeService([{ id: 5, is_new: false }])
    await service.process(project, dto({}))
    expect(occurrences).toHaveLength(1)
    expect(occurrences[0].error_id).toBe(5)
  })
})
