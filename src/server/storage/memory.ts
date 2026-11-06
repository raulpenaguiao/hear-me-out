import type { ByteRange } from "@/lib/http-range";
import type { ObjectBody, ObjectStorage, PresignedUpload, StoredObjectInfo } from "./types";

/** In-memory storage used by unit and integration tests. */
export class MemoryStorage implements ObjectStorage {
  readonly driver = "memory" as const;
  readonly objects = new Map<string, { data: Uint8Array; contentType: string | null }>();
  getCalls: Array<{ key: string; range?: ByteRange }> = [];

  put(key: string, data: Uint8Array, contentType: string | null = null): void {
    this.objects.set(key, { data, contentType });
  }

  async createUploadUrl(input: {
    key: string;
    contentType: string;
    contentLength: number;
    expiresInSeconds: number;
  }): Promise<PresignedUpload> {
    return {
      url: `memory://upload/${input.key}`,
      method: "PUT",
      headers: { "Content-Type": input.contentType },
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
    };
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    const obj = this.objects.get(key);
    return obj ? { size: obj.data.byteLength, contentType: obj.contentType } : null;
  }

  async get(key: string, range?: ByteRange): Promise<ObjectBody | null> {
    this.getCalls.push({ key, range });
    const obj = this.objects.get(key);
    if (!obj) return null;
    const data = range ? obj.data.slice(range.start, range.end + 1) : obj.data;
    return {
      length: data.byteLength,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      }),
    };
  }

  async readPrefix(key: string, bytes: number): Promise<Uint8Array | null> {
    const obj = this.objects.get(key);
    return obj ? obj.data.slice(0, bytes) : null;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    const obj = this.objects.get(fromKey);
    if (!obj) throw new Error("NoSuchKey");
    this.objects.set(toKey, obj);
    this.objects.delete(fromKey);
  }

  async createDownloadUrl(input: { key: string }): Promise<string | null> {
    return `https://storage.invalid/${input.key}?signed=1`;
  }
}
