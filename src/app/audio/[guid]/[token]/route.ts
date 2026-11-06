import { handleAudioRequest } from "@/server/public/handlers";
import { getPublicContext } from "@/server/public/context";
import { publicRouteError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Long downloads by podcast apps are streamed; allow generous execution time.
export const maxDuration = 300;

async function handle(request: Request, ctx: RouteContext<"/audio/[guid]/[token]">) {
  const { guid, token } = await ctx.params;
  try {
    return await handleAudioRequest(request, guid, token, getPublicContext());
  } catch (error) {
    return publicRouteError(error);
  }
}

export { handle as GET, handle as HEAD };
