import protobuf from 'protobufjs'

// MUST stay identical to the API copy (api/src/ingest/ingest.codec.ts).
// Nested/arbitrary values travel as JSON strings to keep the schema flat.
const INGEST_PROTO = `
syntax = "proto3";
message Breadcrumb {
  string type = 1;
  string category = 2;
  string message = 3;
  string level = 4;
  string timestamp = 5;
  string data = 6;
}
message Error {
  string message = 1;
  string stack = 2;
  string source = 3;
  string url = 4;
  string route = 5;
  string userId = 6;
  string appVersion = 7;
  string device = 8;
  string occurredAt = 9;
  repeated Breadcrumb breadcrumbs = 10;
}
message Meta {
  string device = 1;
  string userId = 2;
  string appVersion = 3;
}
message Batch {
  Meta meta = 1;
  repeated Error errors = 2;
}
`

const Batch = protobuf.parse(INGEST_PROTO).root.lookupType('Batch')

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

/** Encode a flush body to protobuf bytes matching the shared Batch schema. */
export function encodeBatch(body: FlushBody): Uint8Array {
  const message = {
    meta: {
      device: jsonStr(body.meta.device),
      userId: body.meta.userId ?? '',
      appVersion: body.meta.appVersion ?? '',
    },
    errors: body.errors.map((e) => ({
      message: e.message,
      stack: e.stack,
      source: e.source,
      url: e.url,
      route: e.route,
      appVersion: '',
      device: '',
      occurredAt: e.occurredAt,
      breadcrumbs: (e.breadcrumbs ?? []).map((c) => ({
        type: c.type ?? '',
        category: c.category ?? '',
        message: c.message ?? '',
        level: c.level ?? '',
        timestamp: c.timestamp ?? '',
        data: jsonStr(c.data),
      })),
    })),
  }
  return Batch.encode(Batch.fromObject(message)).finish()
}
