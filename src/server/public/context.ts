import { appUrl, getEnv } from "@/lib/env";
import { clientIp, createRateLimiter, RATE_LIMITS } from "../rate-limit";
import { getStorage } from "../storage";
import { createAdminClient } from "../supabase/admin";
import { SupabasePublicRepository } from "./supabase-repository";
import type { PublicContext } from "./types";

/** Production wiring of the public handlers. */
export function getPublicContext(): PublicContext {
  const env = getEnv();
  const admin = createAdminClient();
  const limiter = createRateLimiter({
    admin,
    secret: env.TOKEN_HASH_SECRET,
    enabled: env.RATE_LIMIT_ENABLED,
  });
  return {
    repo: new SupabasePublicRepository(admin),
    storage: getStorage(),
    secrets: { hashSecret: env.TOKEN_HASH_SECRET, encryptionKey: env.TOKEN_ENCRYPTION_KEY },
    appUrl: appUrl(),
    audioDeliveryMode: env.AUDIO_DELIVERY_MODE,
    recordInvalidToken: (request) =>
      limiter(RATE_LIMITS.invalidToken, clientIp(request.headers, env.TRUST_PROXY_HEADERS)),
  };
}
