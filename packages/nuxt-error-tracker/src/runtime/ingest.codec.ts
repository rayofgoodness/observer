// Hand-rolled proto3 wire-format encoder for the fixed ingest schema. Replaces
// the `protobufjs` runtime dependency so consumers need ZERO extra config — no
// Vite `optimizeDeps`, no CJS-interop workarounds, no SSR pitfalls.
//
// MUST stay wire-compatible with the API's protobufjs decoder
// (api/src/ingest/ingest.codec.ts). Schema (field numbers are load-bearing):
//   Breadcrumb { type=1 category=2 message=3 level=4 timestamp=5 data=6 }
//   Error { message=1 stack=2 source=3 url=4 route=5 userId=6 appVersion=7
//           device=8 occurredAt=9 breadcrumbs=10 (repeated Breadcrumb) }
//   Meta  { device=1 userId=2 appVersion=3 }
//   Batch { meta=1 (Meta) errors=2 (repeated Error) }

const textEncoder = new TextEncoder()

function pushVarint(out: number[], value: number): void {
  let v = value >>> 0
  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80)
    v >>>= 7
  }
  out.push(v)
}

// Length-delimited field (wire type 2) — used for both strings and submessages.
function pushLenField(out: number[], fieldNo: number, bytes: number[]): void {
  pushVarint(out, (fieldNo << 3) | 2)
  pushVarint(out, bytes.length)
  for (let i = 0; i < bytes.length; i++) out.push(bytes[i])
}

// proto3 omits empty strings (decoder defaults them to '').
function pushString(out: number[], fieldNo: number, value: string): void {
  if (!value) return
  const encoded = textEncoder.encode(value)
  pushVarint(out, (fieldNo << 3) | 2)
  pushVarint(out, encoded.length)
  for (let i = 0; i < encoded.length; i++) out.push(encoded[i])
}

function jsonStr(v: unknown): string {
  if (v === undefined || v === null) return ''
  try {
    return JSON.stringify(v)
  } catch {
    return ''
  }
}

export interface Crumb {
  type?: string
  category?: string
  message?: string
  level?: string
  timestamp?: string
  data?: Record<string, unknown>
}

export interface FlushError {
  message: string
  stack: string
  source: string
  url: string
  route: string
  occurredAt: string
  breadcrumbs?: Crumb[]
}

export interface FlushBody {
  meta: {
    device?: Record<string, unknown>
    userId?: string | null
    appVersion?: string
  }
  errors: FlushError[]
}

function encodeBreadcrumb(c: Crumb): number[] {
  const out: number[] = []
  pushString(out, 1, c.type ?? '')
  pushString(out, 2, c.category ?? '')
  pushString(out, 3, c.message ?? '')
  pushString(out, 4, c.level ?? '')
  pushString(out, 5, c.timestamp ?? '')
  pushString(out, 6, jsonStr(c.data))
  return out
}

function encodeError(e: FlushError): number[] {
  const out: number[] = []
  pushString(out, 1, e.message)
  pushString(out, 2, e.stack)
  pushString(out, 3, e.source)
  pushString(out, 4, e.url)
  pushString(out, 5, e.route)
  // 6 userId / 7 appVersion / 8 device are per-error overrides, unused here.
  pushString(out, 9, e.occurredAt)
  for (const c of e.breadcrumbs ?? []) {
    pushLenField(out, 10, encodeBreadcrumb(c))
  }
  return out
}

/** Encode a flush body to protobuf bytes matching the shared Batch schema. */
export function encodeBatch(body: FlushBody): Uint8Array {
  const out: number[] = []

  const meta: number[] = []
  pushString(meta, 1, jsonStr(body.meta.device))
  pushString(meta, 2, body.meta.userId ?? '')
  pushString(meta, 3, body.meta.appVersion ?? '')
  pushLenField(out, 1, meta)

  for (const e of body.errors) {
    pushLenField(out, 2, encodeError(e))
  }

  return new Uint8Array(out)
}
