import { createUploadSchema } from "@/lib/validation";
import { publisherFromRequest } from "@/server/auth";
import { assertSameOriginJson, json, jsonError, readJson, unauthorized } from "@/server/http";
import { createUpload } from "@/server/services/uploads";

export const runtime = "nodejs";

/** Issues a short-lived presigned upload URL for audio or a cover image. */
export async function POST(request: Request) {
  const rejected = assertSameOriginJson(request);
  if (rejected) return rejected;
  const ctx = await publisherFromRequest();
  if (!ctx) return unauthorized();
  try {
    const input = createUploadSchema.parse(await readJson(request));
    return json(await createUpload(ctx, input), 201);
  } catch (error) {
    return jsonError(error);
  }
}
