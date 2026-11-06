import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ByteRange } from "@/lib/http-range";
import { rangeLength } from "@/lib/http-range";
import type { ObjectBody, ObjectStorage, PresignedUpload, StoredObjectInfo } from "./types";

/**
 * Development storage adapter that keeps objects on the local filesystem and
 * mimics presigned uploads with HMAC-signed URLs handled by
 * /api/dev-storage/upload. It refuses to run on Vercel (see env.ts) and is
 * meant for local development, CI and end-to-end tests only.
 */

const KEY_PATTERN = /^[A-Za-z0-9/_.-]+$/;

export function assertSafeKey(key: string): void {
  if (!KEY_PATTERN.test(key) || key.includes("..") || key.startsWith("/")) {
    throw new Error("Invalid storage key");
  }
}

interface UploadClaims {
  key: string;
  contentType: string;
  contentLength: number;
  expires: number;
}

function canonicalClaims(c: UploadClaims): string {
  return `local-upload\n${c.key}\n${c.contentType}\n${c.contentLength}\n${c.expires}`;
}

export class LocalStorage implements ObjectStorage {
  readonly driver = "local" as const;

  constructor(
    private readonly rootDir: string,
    private readonly signingSecret: string,
    private readonly appUrl: string,
  ) {}

  private filePath(key: string): string {
    assertSafeKey(key);
    const root = path.resolve(this.rootDir);
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  private sign(claims: UploadClaims): string {
    return createHmac("sha256", this.signingSecret).update(canonicalClaims(claims)).digest("base64url");
  }

  verifyUploadSignature(claims: UploadClaims, signature: string): boolean {
    if (!Number.isFinite(claims.expires) || claims.expires * 1000 < Date.now()) return false;
    const expected = Buffer.from(this.sign(claims));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  async createUploadUrl(input: {
    key: string;
    contentType: string;
    contentLength: number;
    expiresInSeconds: number;
  }): Promise<PresignedUpload> {
    assertSafeKey(input.key);
    const expires = Math.floor(Date.now() / 1000) + input.expiresInSeconds;
    const claims: UploadClaims = {
      key: input.key,
      contentType: input.contentType,
      contentLength: input.contentLength,
      expires,
    };
    const url = new URL("/api/dev-storage/upload", this.appUrl);
    url.searchParams.set("key", input.key);
    url.searchParams.set("type", input.contentType);
    url.searchParams.set("length", String(input.contentLength));
    url.searchParams.set("expires", String(expires));
    url.searchParams.set("signature", this.sign(claims));
    return {
      url: url.toString(),
      method: "PUT",
      headers: { "Content-Type": input.contentType },
      expiresAt: new Date(expires * 1000),
    };
  }

  /** Writes an uploaded body to disk, streaming, with a hard size cap. */
  async writeFromStream(
    key: string,
    body: ReadableStream<Uint8Array>,
    maxBytes: number,
  ): Promise<number> {
    const target = this.filePath(key);
    await mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.uploading-${process.pid}-${Date.now()}`;
    let written = 0;
    const source = Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>);
    source.on("data", (chunk: Buffer) => {
      written += chunk.length;
      if (written > maxBytes) source.destroy(new Error("Upload exceeds declared size"));
    });
    try {
      await pipeline(source, createWriteStream(temp));
      await rename(temp, target);
      return written;
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    try {
      const s = await stat(this.filePath(key));
      return s.isFile() ? { size: s.size, contentType: null } : null;
    } catch {
      return null;
    }
  }

  async get(key: string, range?: ByteRange): Promise<ObjectBody | null> {
    const info = await this.head(key);
    if (!info) return null;
    const stream = createReadStream(
      this.filePath(key),
      range ? { start: range.start, end: range.end } : undefined,
    );
    return {
      body: Readable.toWeb(stream) as ReadableStream<Uint8Array>,
      length: range ? rangeLength(range) : info.size,
    };
  }

  async readPrefix(key: string, bytes: number): Promise<Uint8Array | null> {
    let handle;
    try {
      handle = await open(this.filePath(key), "r");
    } catch {
      return null;
    }
    try {
      const buffer = Buffer.alloc(bytes);
      const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
      return new Uint8Array(buffer.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.filePath(key), { force: true });
  }

  async createDownloadUrl(): Promise<string | null> {
    return null;
  }
}
