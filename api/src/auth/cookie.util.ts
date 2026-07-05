import type { Request } from 'express'

export const SESSION_COOKIE = 'sid'
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

/** Read a single cookie from the raw `Cookie` header (no cookie-parser dep). */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim())
    }
  }
  return null
}
