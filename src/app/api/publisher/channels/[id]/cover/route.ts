import { createHash } from "node:crypto";
import { uuidSchema } from "@/lib/validation";
import { publisherFromRequest } from "@/server/auth";
import { notFound, serveObject } from "@/server/public/serve-object";

export const runtime = "nodejs";

/** Owner-only cover preview for the dashboard (no secret token in the URL). */
export async function GET(request: Request, ctx: RouteContext<"/api/publisher/channels/[id]/cover">) {
  const publisher = await publisherFromRequest();
  if (!publisher) return new Response("Unauthorized", { status: 401 });
  const id = uuidSchema.safeParse((await ctx.params).id);
  if (!id.success) return notFound();
  const { data } = await publisher.db
    .from("channels")
    .select("cover_image_key, cover_image_mime_type, updated_at")
    .eq("id", id.data)
    .maybeSingle();
  if (!data?.cover_image_key || !data.cover_image_mime_type) return notFound();
  const info = await publisher.storage.head(data.cover_image_key);
  if (!info) return notFound();
  return serveObject(request, {
    storage: publisher.storage,
    key: data.cover_image_key,
    size: info.size,
    contentType: data.cover_image_mime_type,
    etag: `"${createHash("sha256").update(data.cover_image_key).digest("base64url").slice(0, 27)}"`,
    lastModified: new Date(data.updated_at),
    fileName: "cover",
    cacheControl: "private, max-age=300",
  });
}
