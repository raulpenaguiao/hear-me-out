import { createHash } from "node:crypto";
import { uuidSchema } from "@/lib/validation";
import { publisherFromRequest } from "@/server/auth";
import { notFound, serveObject } from "@/server/public/serve-object";
import { audioExtension } from "@/server/public/urls";
import { getOwnedEpisodeAudio } from "@/server/services/episodes";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Owner-only audio preview (works for drafts too). */
async function handle(request: Request, ctx: RouteContext<"/api/publisher/episodes/[id]/audio">) {
  const publisher = await publisherFromRequest();
  if (!publisher) return new Response("Unauthorized", { status: 401 });
  const parsed = uuidSchema.safeParse((await ctx.params).id);
  if (!parsed.success) return notFound();
  const audio = await getOwnedEpisodeAudio(publisher, parsed.data);
  if (!audio) return notFound();
  return serveObject(request, {
    storage: publisher.storage,
    key: audio.key,
    size: audio.size,
    contentType: audio.mimeType,
    etag: `"${createHash("sha256").update(audio.key).digest("base64url").slice(0, 27)}"`,
    lastModified: audio.updatedAt,
    fileName: `${audio.guid}.${audioExtension(audio.mimeType)}`,
    cacheControl: "private, no-cache",
  });
}

export { handle as GET, handle as HEAD };
