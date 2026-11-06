import { contentRangeHeader, parseRangeHeader, rangeLength } from "@/lib/http-range";
import type { ObjectStorage } from "../storage/types";

export const PRIVATE_RESPONSE_HEADERS: Record<string, string> = {
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export function notFound(extra: Record<string, string> = {}): Response {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...PRIVATE_RESPONSE_HEADERS,
      ...extra,
    },
  });
}

export function tooManyRequests(): Response {
  return new Response("Too many requests", {
    status: 429,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "60",
      ...PRIVATE_RESPONSE_HEADERS,
    },
  });
}

function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === "*") return true;
  return header
    .split(",")
    .map((t) => t.trim().replace(/^W\//, ""))
    .includes(etag);
}

export interface ServeObjectOptions {
  storage: ObjectStorage;
  key: string;
  /** Authoritative size from the database (validated at upload completion). */
  size: number;
  contentType: string;
  etag: string;
  lastModified: Date;
  fileName: string;
  cacheControl: string;
}

/**
 * Streams a private object with full HTTP semantics needed by browsers and
 * podcast apps: HEAD, single byte ranges (206/416), conditional requests and
 * correct Content-Length. The body is piped from storage without buffering.
 */
export async function serveObject(request: Request, opts: ServeObjectOptions): Promise<Response> {
  const method = request.method.toUpperCase();
  const baseHeaders: Record<string, string> = {
    "Content-Type": opts.contentType,
    "Accept-Ranges": "bytes",
    ETag: opts.etag,
    "Last-Modified": opts.lastModified.toUTCString(),
    // no-transform: byte-exact delivery. Prevents gzip (which would drop
    // Content-Length and break ranges) by Next.js and intermediaries.
    "Cache-Control": `${opts.cacheControl}, no-transform`,
    "Content-Disposition": `inline; filename="${opts.fileName.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
    ...PRIVATE_RESPONSE_HEADERS,
  };

  if (etagMatches(request.headers.get("if-none-match"), opts.etag)) {
    return new Response(null, { status: 304, headers: baseHeaders });
  }

  // If-Range: only honour the Range header when the validator still matches.
  const ifRange = request.headers.get("if-range");
  const rangeHeader =
    ifRange && ifRange.trim() !== opts.etag ? null : request.headers.get("range");
  const parsed = parseRangeHeader(rangeHeader, opts.size);

  if (parsed.type === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { ...baseHeaders, "Content-Range": `bytes */${opts.size}`, "Content-Length": "0" },
    });
  }

  const range = parsed.type === "range" ? parsed.range : undefined;
  const length = range ? rangeLength(range) : opts.size;
  const headers: Record<string, string> = { ...baseHeaders, "Content-Length": String(length) };
  if (range) headers["Content-Range"] = contentRangeHeader(range, opts.size);
  const status = range ? 206 : 200;

  if (method === "HEAD") {
    return new Response(null, { status, headers });
  }

  const object = await opts.storage.get(opts.key, range);
  if (!object) {
    // Database says it exists but storage does not: treat as missing.
    return notFound();
  }
  return new Response(object.body, { status, headers });
}
