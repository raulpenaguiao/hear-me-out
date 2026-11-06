import type { ByteRange } from "@/lib/http-range";

export interface PresignedUpload {
  url: string;
  method: "PUT";
  /** Headers the client must send with the upload request. */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface StoredObjectInfo {
  size: number;
  contentType: string | null;
}

export interface ObjectBody {
  body: ReadableStream<Uint8Array>;
  /** Number of bytes in `body`. */
  length: number;
}

/**
 * Minimal object storage abstraction. Implemented by Cloudflare R2 (S3 API)
 * for production and by a local filesystem adapter for development and tests.
 */
export interface ObjectStorage {
  readonly driver: "r2" | "local" | "memory";

  createUploadUrl(input: {
    key: string;
    contentType: string;
    contentLength: number;
    expiresInSeconds: number;
  }): Promise<PresignedUpload>;

  head(key: string): Promise<StoredObjectInfo | null>;

  /** Streams an object or a byte range of it. Returns null if missing. */
  get(key: string, range?: ByteRange): Promise<ObjectBody | null>;

  /** Reads up to `bytes` bytes from the start of the object. */
  readPrefix(key: string, bytes: number): Promise<Uint8Array | null>;

  delete(key: string): Promise<void>;

  /**
   * Short-lived direct download URL (used by AUDIO_DELIVERY_MODE=redirect).
   * Null if the driver cannot provide one.
   */
  createDownloadUrl(input: {
    key: string;
    expiresInSeconds: number;
    contentType: string;
    fileName: string;
  }): Promise<string | null>;
}

export async function readStreamFully(
  stream: ReadableStream<Uint8Array>,
  limit = Number.POSITIVE_INFINITY,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const out = new Uint8Array(Math.min(total, limit));
  let offset = 0;
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, Math.min(chunk.byteLength, out.length - offset));
    out.set(slice, offset);
    offset += slice.byteLength;
    if (offset >= out.length) break;
  }
  return out;
}
