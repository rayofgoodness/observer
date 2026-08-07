import { createHash } from 'node:crypto'

function normalizeMessage(message: string): string {
  return message
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      '<uuid>',
    )
    .replace(/\b\d+\b/g, '<n>')
    .slice(0, 300)
}

// Bundlers stamp a content hash into every chunk filename — Nuxt 4 emits a bare
// `_nuxt/Dm8bJ3HT.js`, Vite `entry-Dm8bJ3HT.js`, webpack `main.a1b2c3d4.js`. The
// hash rotates on every deploy while the code behind the frame does not, so
// leaving it in fragments one recurring bug into a fresh group per release.
const EXT = '(\\.(?:js|mjs|cjs|css))\\b'
// A hash appended after a separator — `entry-Dm8bJ3HT.js`, `main.a1b2c3d4.js`.
// Excludes `-` from the hash itself so the readable prefix survives: matching
// it would swallow `entry-` and collapse distinct chunks into one group.
const SUFFIX_HASH = new RegExp(`([-.])([A-Za-z0-9_]{8,32})${EXT}`, 'g')
// A whole filename that is nothing but a hash — Nuxt 4 emits `_nuxt/Dm8bJ3HT.js`.
// Here `-` is allowed, since base64 hashes contain it (`DYMK7D-b`).
const BARE_HASH = new RegExp(`(/)([A-Za-z0-9_-]{8,32})${EXT}`, 'g')

// Only mask segments that actually look generated: a digit, or mixed case as
// Vite's base64 hashes produce. Plain lowercase words (`scheduler.js`,
// `my-component.js`) are real filenames and must stay significant.
function looksLikeHash(segment: string): boolean {
  return /\d/.test(segment) || (/[a-z]/.test(segment) && /[A-Z]/.test(segment))
}

const mask = (
  match: string,
  lead: string,
  name: string,
  ext: string,
): string => (looksLikeHash(name) ? `${lead}<hash>${ext}` : match)

// Suffix first: once `entry-Dm8bJ3HT.js` becomes `entry-<hash>.js`, the bare
// pass can no longer match it (`<`/`>` are outside its character class).
function stripChunkHash(line: string): string {
  return line.replace(SUFFIX_HASH, mask).replace(BARE_HASH, mask)
}

function topFrames(stack: string, count = 3): string {
  return stack
    .split('\n')
    .slice(1, 1 + count)
    .map((line) =>
      stripChunkHash(
        line
          .replace(/:\d+:\d+\)?$/, '')
          .replace(/\?[^)\s]+/g, '')
          .trim(),
      ),
    )
    .join('|')
}

export function computeFingerprint(message: string, stack: string): string {
  return createHash('sha256')
    .update(`${normalizeMessage(message)}::${topFrames(stack)}`)
    .digest('hex')
}
