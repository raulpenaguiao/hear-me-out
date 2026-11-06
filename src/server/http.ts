import { z } from "zod";
import { firstIssueMessage } from "@/lib/validation";
import { PRIVATE_RESPONSE_HEADERS } from "./public/serve-object";
import { ServiceError } from "./services/errors";

/** Safe error response for public endpoints. Never echoes request data. */
export function publicRouteError(error: unknown): Response {
  console.error("public route error", error instanceof Error ? error.message : "unknown");
  return new Response("Service unavailable", {
    status: 503,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "30",
      ...PRIVATE_RESPONSE_HEADERS,
    },
  });
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function jsonError(error: unknown): Response {
  if (error instanceof ServiceError) {
    return json({ error: { code: error.code, message: error.message } }, error.status);
  }
  if (error instanceof z.ZodError) {
    return json({ error: { code: "invalid_input", message: firstIssueMessage(error) } }, 400);
  }
  console.error("publisher api error", error instanceof Error ? error.message : "unknown");
  return json({ error: { code: "internal", message: "Ocorreu um erro inesperado. Tenta novamente." } }, 500);
}

export const unauthorized = () =>
  json({ error: { code: "unauthorized", message: "Sessão expirada. Volta a entrar." } }, 401);

/**
 * CSRF defence for cookie-authenticated JSON endpoints: require a JSON body
 * and a same-origin Origin header (when present). Cookies are SameSite=Lax.
 */
export function assertSameOriginJson(request: Request): Response | null {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return json({ error: { code: "invalid_input", message: "Pedido inválido." } }, 415);
  }
  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (!host || originHost !== host) {
      return json({ error: { code: "forbidden", message: "Origem não permitida." } }, 403);
    }
  }
  return null;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ServiceError("invalid_input", "Pedido inválido.");
  }
}
