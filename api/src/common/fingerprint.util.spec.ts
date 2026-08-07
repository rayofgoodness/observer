import { describe, expect, it } from 'vitest'
import { computeFingerprint } from './fingerprint.util'

const STACK = [
  'Error: boom',
  '    at handleClick (app.js:10:5)',
  '    at invoke (runtime.js:22:3)',
  '    at flush (scheduler.js:30:1)',
].join('\n')

describe('computeFingerprint', () => {
  it('returns a 64-char hex sha256 digest', () => {
    const fp = computeFingerprint('boom', STACK)
    expect(fp).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic for identical input', () => {
    expect(computeFingerprint('boom', STACK)).toBe(
      computeFingerprint('boom', STACK),
    )
  })

  it('differs for different messages', () => {
    expect(computeFingerprint('boom', STACK)).not.toBe(
      computeFingerprint('crash', STACK),
    )
  })

  it('works with an empty stack', () => {
    expect(computeFingerprint('boom', '')).toMatch(/^[0-9a-f]{64}$/)
  })

  describe('message normalization', () => {
    it('masks UUIDs so messages differing only by UUID collapse', () => {
      const a = 'user 550e8400-e29b-41d4-a716-446655440000 not found'
      const b = 'user 123e4567-e89b-12d3-a456-426614174000 not found'
      expect(computeFingerprint(a, STACK)).toBe(computeFingerprint(b, STACK))
    })

    it('masks uppercase UUIDs too', () => {
      const a = 'id 550E8400-E29B-41D4-A716-446655440000 missing'
      const b = 'id 123e4567-e89b-12d3-a456-426614174000 missing'
      expect(computeFingerprint(a, STACK)).toBe(computeFingerprint(b, STACK))
    })

    it('masks standalone numbers so status/id variants collapse', () => {
      expect(computeFingerprint('HTTP 500 from /api', STACK)).toBe(
        computeFingerprint('HTTP 404 from /api', STACK),
      )
    })

    it('does not mask digits embedded in words', () => {
      expect(computeFingerprint('v1error occurred', STACK)).not.toBe(
        computeFingerprint('v2error occurred', STACK),
      )
    })

    it('truncates messages at 300 chars — long tails do not affect the hash', () => {
      const base = 'x'.repeat(300)
      expect(computeFingerprint(base + 'tail one', STACK)).toBe(
        computeFingerprint(base + 'completely different tail', STACK),
      )
    })

    it('keeps differences within the first 300 chars significant', () => {
      const a = `a${'x'.repeat(299)}`
      const b = `b${'x'.repeat(299)}`
      expect(computeFingerprint(a, STACK)).not.toBe(
        computeFingerprint(b, STACK),
      )
    })
  })

  describe('stack frame extraction', () => {
    it('ignores the first stack line (message line)', () => {
      const other = ['TypeError: totally different first line']
        .concat(STACK.split('\n').slice(1))
        .join('\n')
      expect(computeFingerprint('boom', STACK)).toBe(
        computeFingerprint('boom', other),
      )
    })

    it('uses only the top 3 frames — deeper frames do not affect the hash', () => {
      const deeper = `${STACK}\n    at main (index.js:99:9)`
      const deeperOther = `${STACK}\n    at other (elsewhere.js:1:1)`
      expect(computeFingerprint('boom', deeper)).toBe(
        computeFingerprint('boom', deeperOther),
      )
    })

    it('a change inside the top 3 frames changes the hash', () => {
      const other = STACK.replace('invoke (runtime.js', 'invoke (other.js')
      expect(computeFingerprint('boom', STACK)).not.toBe(
        computeFingerprint('boom', other),
      )
    })

    it('strips line:column positions so recompiled bundles collapse', () => {
      const moved = STACK.replace('app.js:10:5', 'app.js:987:1')
      expect(computeFingerprint('boom', STACK)).toBe(
        computeFingerprint('boom', moved),
      )
    })

    it('collapses Nuxt bare-hash chunks so one bug is not regrouped per deploy', () => {
      // Real prod frames: the same failure fragmented into a new group on every
      // release because `_nuxt/<hash>.js` rotates while the code does not.
      const frame = (chunk: string) =>
        [
          'Error: boom',
          `    @https://casy.beauty/_nuxt/${chunk}.js:5:5022`,
        ].join('\n')
      const chunks = [
        'Dm8bJ3HT',
        'YF4z4yq4',
        'CBKeYB7v',
        'DYMK7D-b',
        'P_xoVecu',
        'CtxYNUD2',
        'VkuzkEMI',
      ]
      const first = computeFingerprint('boom', frame(chunks[0]))
      for (const chunk of chunks.slice(1)) {
        expect(computeFingerprint('boom', frame(chunk))).toBe(first)
      }
    })

    it('collapses Vite `name-HASH.js` chunks but keeps the readable name', () => {
      const a = [
        'Error: boom',
        '    at go (/assets/entry-Dm8bJ3HT.js:1:1)',
      ].join('\n')
      const b = [
        'Error: boom',
        '    at go (/assets/entry-YF4z4yq4.js:1:1)',
      ].join('\n')
      const other = [
        'Error: boom',
        '    at go (/assets/vendor-YF4z4yq4.js:1:1)',
      ].join('\n')
      expect(computeFingerprint('boom', a)).toBe(computeFingerprint('boom', b))
      // `entry` vs `vendor` is real signal — masking the hash must not erase it.
      expect(computeFingerprint('boom', a)).not.toBe(
        computeFingerprint('boom', other),
      )
    })

    it('collapses webpack `name.HASH.js` chunks', () => {
      const a = [
        'Error: boom',
        '    at go (/static/main.a1b2c3d4.js:1:1)',
      ].join('\n')
      const b = [
        'Error: boom',
        '    at go (/static/main.9f8e7d6c.js:1:1)',
      ].join('\n')
      expect(computeFingerprint('boom', a)).toBe(computeFingerprint('boom', b))
    })

    it('does not mask plain lowercase filenames — they are real signal', () => {
      const a = ['Error: boom', '    at go (/src/scheduler.js:1:1)'].join('\n')
      const b = ['Error: boom', '    at go (/src/reactivity.js:1:1)'].join('\n')
      expect(computeFingerprint('boom', a)).not.toBe(
        computeFingerprint('boom', b),
      )
    })

    it('does not mask kebab-case module names', () => {
      const a = ['Error: boom', '    at go (/src/my-component.js:1:1)'].join(
        '\n',
      )
      const b = ['Error: boom', '    at go (/src/my-container.js:1:1)'].join(
        '\n',
      )
      expect(computeFingerprint('boom', a)).not.toBe(
        computeFingerprint('boom', b),
      )
    })

    it('strips query strings from bundle URLs so cache-busted builds collapse', () => {
      const a = [
        'Error: boom',
        '    at handleClick (https://cdn.app/bundle.js?v=111:10:5)',
      ].join('\n')
      const b = [
        'Error: boom',
        '    at handleClick (https://cdn.app/bundle.js?v=222:10:5)',
      ].join('\n')
      expect(computeFingerprint('boom', a)).toBe(computeFingerprint('boom', b))
    })
  })
})
