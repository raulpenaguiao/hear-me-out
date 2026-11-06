import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { beforeAll, describe, expect, it } from "vitest";
import { R2Storage } from "@/server/storage/r2";
import { readStreamFully } from "@/server/storage/types";
import { makeWav } from "../helpers/audio";

/**
 * Exercises the R2 (S3 API) adapter against any S3-compatible endpoint, e.g.
 * a local MinIO or moto server. Opt-in: set S3_TEST_ENDPOINT (and optionally
 * S3_TEST_ACCESS_KEY / S3_TEST_SECRET_KEY / S3_TEST_BUCKET). Not run against
 * real Cloudflare R2 by default.
 */
const endpoint = process.env.S3_TEST_ENDPOINT;
const config = {
  endpoint,
  accessKeyId: process.env.S3_TEST_ACCESS_KEY ?? "test",
  secretAccessKey: process.env.S3_TEST_SECRET_KEY ?? "test",
  bucket: process.env.S3_TEST_BUCKET ?? "ouve-isto-test",
};

describe.skipIf(!endpoint)("R2Storage against an S3-compatible endpoint", () => {
  let storage: R2Storage;
  const key = `audio/test/${crypto.randomUUID()}.wav`;
  const wav = makeWav(1);

  beforeAll(async () => {
    const client = new S3Client({
      region: "us-east-1",
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    await client.send(new CreateBucketCommand({ Bucket: config.bucket })).catch(() => undefined);
    storage = new R2Storage(config);
  });

  it("uploads through a presigned PUT URL", async () => {
    const presigned = await storage.createUploadUrl({
      key,
      contentType: "audio/wav",
      contentLength: wav.byteLength,
      expiresInSeconds: 60,
    });
    expect(presigned.url).toContain("X-Amz-Signature");
    const res = await fetch(presigned.url, {
      method: "PUT",
      headers: presigned.headers,
      body: wav.slice(),
    });
    expect(res.status).toBe(200);
  });

  it("reports size and content type", async () => {
    expect(await storage.head(key)).toEqual({ size: wav.byteLength, contentType: "audio/wav" });
    expect(await storage.head(`${key}.missing`)).toBeNull();
  });

  it("reads byte ranges and prefixes as streams", async () => {
    const part = await storage.get(key, { start: 0, end: 43 });
    expect(part?.length).toBe(44);
    expect(await readStreamFully(part!.body)).toEqual(wav.slice(0, 44));
    expect(await storage.readPrefix(key, 12)).toEqual(wav.slice(0, 12));
    const full = await storage.get(key);
    expect(full?.length).toBe(wav.byteLength);
    expect(await readStreamFully(full!.body)).toEqual(wav);
    expect(await storage.get(`${key}.missing`)).toBeNull();
  });

  it("creates presigned download URLs", async () => {
    const url = await storage.createDownloadUrl({
      key,
      expiresInSeconds: 60,
      contentType: "audio/wav",
      fileName: "ep.wav",
    });
    const res = await fetch(url!, { headers: { Range: "bytes=0-3" } });
    expect(res.status).toBe(206);
    expect(new TextDecoder().decode(await res.arrayBuffer())).toBe("RIFF");
  });

  it("signs Content-Type and Content-Length into upload URLs", async () => {
    // SigV4-verifying services (R2, S3) reject PUTs whose signed headers
    // differ, so a client cannot change the type or size it declared.
    // (moto does not verify signatures, so we assert on the URL itself.)
    const presigned = await storage.createUploadUrl({
      key: `${key}.ct`,
      contentType: "audio/wav",
      contentLength: 4,
      expiresInSeconds: 60,
    });
    const signed = new URL(presigned.url).searchParams.get("X-Amz-SignedHeaders")?.split(";") ?? [];
    expect(signed).toEqual(expect.arrayContaining(["content-type", "content-length", "host"]));
  });

  it("moves objects between keys", async () => {
    const target = `audio/moved/${crypto.randomUUID()}.wav`;
    await storage.move(key, target);
    expect(await storage.head(key)).toBeNull();
    expect((await storage.head(target))?.size).toBe(wav.byteLength);
    await storage.move(target, key);
  });

  it("deletes objects", async () => {
    await storage.delete(key);
    expect(await storage.head(key)).toBeNull();
  });
});
