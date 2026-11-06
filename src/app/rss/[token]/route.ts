import { handleFeedRequest } from "@/server/public/handlers";
import { getPublicContext } from "@/server/public/context";
import { publicRouteError } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request, ctx: RouteContext<"/rss/[token]">) {
  const { token } = await ctx.params;
  try {
    return await handleFeedRequest(request, token, getPublicContext());
  } catch (error) {
    return publicRouteError(error);
  }
}

export { handle as GET, handle as HEAD };
