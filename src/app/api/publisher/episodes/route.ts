import { createEpisodeSchema } from "@/lib/validation";
import { publisherFromRequest } from "@/server/auth";
import { assertSameOriginJson, json, jsonError, readJson, unauthorized } from "@/server/http";
import { createEpisode } from "@/server/services/episodes";

export const runtime = "nodejs";

/** Creates a draft episode (audio is attached afterwards via uploads). */
export async function POST(request: Request) {
  const rejected = assertSameOriginJson(request);
  if (rejected) return rejected;
  const ctx = await publisherFromRequest();
  if (!ctx) return unauthorized();
  try {
    const input = createEpisodeSchema.parse(await readJson(request));
    return json(await createEpisode(ctx, input), 201);
  } catch (error) {
    return jsonError(error);
  }
}
