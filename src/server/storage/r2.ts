import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";
import type { ByteRange } from "@/lib/http-range";
import { rangeLength } from "@/lib/http-range";
import type { ObjectBody, ObjectStorage, PresignedUpload, StoredObjectInfo } from "./types";
import { readStreamFully } from "./types";

export interface R2Config {
  accountId?: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint?: string;
}

function isNotFound(error: unknown): boolean {
  if (error instanceof NoSuchKey || error instanceof NotFound) return true;
  if (error instanceof S3ServiceException) {
    return error.$metadata.httpStatusCode === 404 || error.name === "NotFound";
  }
  return false;
}

function toWebStream(body: unknown): ReadableStream<Uint8Array> {
  if (body && typeof (body as { transformToWebStream?: unknown }).transformToWebStream === "function") {
    return (body as { transformToWebStream: () => ReadableStream<Uint8Array> }).transformToWebStream();
  }
  if (body instanceof Readable) {
    return Readable.toWeb(body) as ReadableStream<Uint8Array>;
  }
  throw new Error("Unexpected S3 body type");
}

/**
 * Cloudflare R2 via its S3-compatible API. The bucket stays private: the
 * browser only ever receives short-lived presigned PUT URLs for uploads, and
 * audio is streamed through the application (or via short-lived presigned GET
 * redirects when AUDIO_DELIVERY_MODE=redirect).
 */
export class R2Storage implements ObjectStorage {
  readonly driver = "r2" as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: R2Config) {
    const endpoint = config.endpoint ?? `https://${config.accountId}.r2.cloudflarestorage.com`;
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: "auto",
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // R2 does not support the newer default checksum headers on presigned PUTs.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  async createUploadUrl(input: {
    key: string;
    contentType: string;
    contentLength: number;
    expiresInSeconds: number;
  }): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: input.expiresInSeconds,
      signableHeaders: new Set(["content-type"]),
    });
    return {
      url,
      method: "PUT",
      headers: { "Content-Type": input.contentType },
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
    };
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: Number(res.ContentLength ?? 0), contentType: res.ContentType ?? null };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async get(key: string, range?: ByteRange): Promise<ObjectBody | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Range: range ? `bytes=${range.start}-${range.end}` : undefined,
        }),
      );
      if (!res.Body) return null;
      return {
        body: toWebStream(res.Body),
        length: Number(res.ContentLength ?? (range ? rangeLength(range) : 0)),
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async readPrefix(key: string, bytes: number): Promise<Uint8Array | null> {
    const head = await this.head(key);
    if (!head) return null;
    if (head.size === 0) return new Uint8Array();
    const object = await this.get(key, { start: 0, end: Math.min(bytes, head.size) - 1 });
    if (!object) return null;
    return readStreamFully(object.body, bytes);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async createDownloadUrl(input: {
    key: string;
    expiresInSeconds: number;
    contentType: string;
    fileName: string;
  }): Promise<string | null> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ResponseContentType: input.contentType,
      ResponseContentDisposition: `inline; filename="${input.fileName.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
    });
    return getSignedUrl(this.client, command, { expiresIn: input.expiresInSeconds });
  }
}
