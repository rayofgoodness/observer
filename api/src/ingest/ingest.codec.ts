import * as protobuf from 'protobufjs'

// Shared wire schema for the ingest batch. The SDK ships an identical copy.
// Nested/arbitrary values (device, breadcrumb data) travel as JSON strings so
// the schema stays flat and forward-compatible.
export const INGEST_PROTO = `
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

/** null for empty/blank strings (proto3 defaults) — else the string. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

/** Parse a JSON string field back to an object; undefined if empty/invalid. */
function json(v: unknown): Record<string, unknown> | undefined {
  const s = str(v)
  if (!s) return undefined
  try {
    const parsed = JSON.parse(s)
    return parsed && typeof parsed === 'object' ? parsed : undefined
  } catch {
    return undefined
  }
}

/**
 * Decode a protobuf Batch buffer into the same plain shape the JSON path
 * produces, so it can flow through the existing IngestDto validation.
 */
export function decodeBatch(buffer: Buffer): unknown {
  const msg = Batch.decode(buffer) as unknown as {
    meta?: { device?: string; userId?: string; appVersion?: string }
    errors?: Array<Record<string, unknown>>
  }

  const meta = msg.meta
    ? {
        device: json(msg.meta.device),
        userId: str(msg.meta.userId),
        appVersion: str(msg.meta.appVersion),
      }
    : undefined

  const errors = (msg.errors ?? []).map((e) => ({
    message: str(e.message) ?? '',
    stack: str(e.stack),
    source: str(e.source),
    url: str(e.url),
    route: str(e.route),
    userId: str(e.userId),
    appVersion: str(e.appVersion),
    device: json(e.device),
    occurredAt: str(e.occurredAt),
    breadcrumbs: Array.isArray(e.breadcrumbs)
      ? (e.breadcrumbs as Array<Record<string, unknown>>).map((b) => ({
          type: str(b.type),
          category: str(b.category),
          message: str(b.message),
          level: str(b.level),
          timestamp: str(b.timestamp),
          data: json(b.data),
        }))
      : undefined,
  }))

  // Strip undefined keys so class-validator's @IsOptional sees absent fields.
  return JSON.parse(JSON.stringify({ meta, errors }))
}
