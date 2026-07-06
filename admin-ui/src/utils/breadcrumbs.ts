export interface Crumb {
  type?: string
  category?: string
  message?: string
  timestamp?: string | number
}

export interface ParsedCrumb {
  type: string
  time: string
  category: string
  text: string
  badges: string[]
}

// Click breadcrumbs embed data-* attrs as "[data-x=y data-z=w]" inside the
// message (see the SDK plugin.client.ts). Pull them out into separate badges
// and keep the rest of the message as plain text. Values may contain spaces, so
// split on the boundary before each "data-" rather than on every space.
export function parseCrumb(c: Crumb): ParsedCrumb {
  const type = c.type || 'log'
  const time = c.timestamp ? new Date(c.timestamp).toLocaleTimeString() : ''
  const raw = c.message || ''
  const dm = raw.match(/\[(data-[^\]]*)\]/)
  const badges = dm ? dm[1].split(/ (?=data-)/) : []
  const text = dm
    ? raw
        .replace(dm[0], '')
        .replace(/\s{2,}/g, ' ')
        .trim()
    : raw
  return { type, time, category: c.category || type, text, badges }
}
