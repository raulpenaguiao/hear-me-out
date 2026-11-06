import { revalidatePath } from "next/cache";
import { z } from "zod";
import { episodeStatusSchema, uuidSchema } from "@/lib/validation";
import { publisherFromRequest } from "@/server/auth";
import { assertSameOriginJson, json, jsonError, readJson, unauthorized } from "@/server/http";
import { setEpisodeStatus } from "@/server/services/episodes";

export const runtime = "nodejs";

export async function POST(request: Request, ctx: RouteContext<"/api/publisher/episodes/[id]/status">) {
  const rejected = assertSameOriginJson(request);
  if (rejected) return rejected;
  const publisher = await publisherFromRequest();
  if (!publisher) return unauthorized();
  try {
    const id = uuidSchema.parse((await ctx.params).id);
    const { status } = z.object({ status: episodeStatusSchema }).parse(await readJson(request));
    await setEpisodeStatus(publisher, id, status);
    revalidatePath("/painel", "layout");
    return json({ ok: true, status });
  } catch (error) {
    return jsonError(error);
  }
}
