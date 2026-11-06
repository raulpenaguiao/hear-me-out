import { completeUploadSchema, uuidSchema } from "@/lib/validation";
import { publisherFromRequest } from "@/server/auth";
import { assertSameOriginJson, json, jsonError, readJson, unauthorized } from "@/server/http";
import { completeUpload } from "@/server/services/uploads";

export const runtime = "nodejs";

/** Verifies an uploaded object and attaches it to its episode or channel. */
export async function POST(request: Request, ctx: RouteContext<"/api/publisher/uploads/[id]/complete">) {
  const rejected = assertSameOriginJson(request);
  if (rejected) return rejected;
  const publisher = await publisherFromRequest();
  if (!publisher) return unauthorized();
  try {
    const id = uuidSchema.parse((await ctx.params).id);
    const body = completeUploadSchema.parse(await readJson(request));
    return json(await completeUpload(publisher, id, body));
  } catch (error) {
    return jsonError(error);
  }
}
