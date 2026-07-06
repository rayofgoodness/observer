import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The built Vue console entry (admin-ui/dist/index.html). Served at /admin and
// /dashboard; its assets load from /ui (ServeStaticModule). Resolved from the
// repo root — the API is started from api/, so cwd is api/.
const INDEX_PATH = join(process.cwd(), '..', 'admin-ui', 'dist', 'index.html')

let cached: string | null = null

export function spaIndexHtml(): string {
  if (cached) return cached
  try {
    cached = readFileSync(INDEX_PATH, 'utf8')
    return cached
  } catch {
    // Not built yet — don't cache, so a later build is picked up without a
    // restart.
    return (
      '<!doctype html><meta charset="utf-8"><title>Observer</title>' +
      '<body style="font:14px system-ui;background:#0b0e14;color:#e6e9f0;padding:40px">' +
      '<h1>Console not built</h1><p>Run <code>cd admin-ui &amp;&amp; bun run build</code>.</p>'
    )
  }
}
