import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * Bridges a Pages Router API request to the Web Request/Response handlers.
 *
 * App Router route handlers drop the Content-Length header (Next.js
 * re-frames every response), but podcast apps rely on accurate
 * Content-Length for HEAD probes, downloads and range requests. Streaming
 * through the raw Node response preserves exact HTTP semantics.
 */
export function toWebRequest(req: IncomingMessage, origin: string): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  return new Request(new URL(req.url ?? "/", origin), { method: req.method ?? "GET", headers });
}

export async function sendWebResponse(
  response: Response,
  res: ServerResponse,
  method: string,
): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  if (!response.body || method.toUpperCase() === "HEAD") {
    res.end();
    await response.body?.cancel().catch(() => undefined);
    return;
  }
  const body = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream<Uint8Array>);
  try {
    await pipeline(body, res);
  } catch {
    // Client disconnected mid-stream (common when seeking): nothing to do.
    body.destroy();
  }
}
