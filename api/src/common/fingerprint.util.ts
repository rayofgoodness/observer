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

function topFrames(stack: string, count = 3): string {
  return stack
    .split('\n')
    .slice(1, 1 + count)
    .map((line) =>
      line
        .replace(/:\d+:\d+\)?$/, '')
        .replace(/\?[^)\s]+/g, '')
        .trim(),
    )
    .join('|')
}

export function computeFingerprint(message: string, stack: string): string {
  return createHash('sha256')
    .update(`${normalizeMessage(message)}::${topFrames(stack)}`)
    .digest('hex')
}
