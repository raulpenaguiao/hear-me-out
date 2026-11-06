import { getEnv } from "@/lib/env";
import { getStorage } from "@/server/storage";
import { LocalStorage } from "@/server/storage/local";

export const runtime = "nodejs";

/**
 * Receiver for presigned uploads when STORAGE_DRIVER=local (development and
 * tests only). Emulates an S3 presigned PUT: the URL carries an HMAC over the
 * key, content type, length and expiry. Disabled for any other driver.
 */
export async function PUT(request: Request) {
  if (getEnv().STORAGE_DRIVER !== "local") return new Response("Not found", { status: 404 });
  const storage = getStorage();
  if (!(storage instanceof LocalStorage)) return new Response("Not found", { status: 404 });

  const params = new URL(request.url).searchParams;
  const claims = {
    key: params.get("key") ?? "",
    contentType: params.get("type") ?? "",
    contentLength: Number(params.get("length")),
    expires: Number(params.get("expires")),
  };
  if (!storage.verifyUploadSignature(claims, params.get("signature") ?? "")) {
    return new Response("Forbidden", { status: 403 });
  }
  if ((request.headers.get("content-type") ?? "") !== claims.contentType) {
    return new Response("Content-Type mismatch", { status: 400 });
  }
  if (!request.body) return new Response("Empty body", { status: 400 });

  try {
    const written = await storage.writeFromStream(claims.key, request.body, claims.contentLength);
    return new Response(null, { status: 200, headers: { ETag: `"${written}"` } });
  } catch {
    return new Response("Upload failed", { status: 400 });
  }
}
