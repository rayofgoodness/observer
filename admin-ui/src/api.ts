export interface ApiError extends Error {
  unauth?: boolean
}

// Thin fetch wrapper shared by both consoles. Dashboard relies on the httpOnly
// session cookie (credentials: same-origin); admin passes X-Admin-Token via the
// `headers` arg. A 401 throws an error flagged `.unauth` so callers can bounce
// back to the auth screen.
export async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const h: Record<string, string> = { ...headers }
  if (body !== undefined) h['Content-Type'] = 'application/json'
  const res = await fetch(path, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  })
  if (res.status === 401) {
    const e = new Error('Unauthorized') as ApiError
    e.unauth = true
    throw e
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const j = await res.json()
      if (j.message) msg = Array.isArray(j.message) ? j.message[0] : j.message
    } catch {}
    throw new Error(msg)
  }
  return (res.status === 204 ? null : await res.json()) as T
}
