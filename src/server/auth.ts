import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { appUrl, getEnv, uploadLimits } from "@/lib/env";
import { createRateLimiter } from "./rate-limit";
import type { PublisherContext } from "./services/context";
import { getStorage } from "./storage";
import { createAdminClient, createUserClient } from "./supabase/clients";

export interface SessionUser {
  id: string;
  email: string;
}

/** Returns the authenticated user (validated with Supabase Auth) or null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
});

export async function buildPublisherContext(user: SessionUser): Promise<PublisherContext> {
  const env = getEnv();
  const admin = createAdminClient();
  return {
    userId: user.id,
    db: await createUserClient(),
    admin,
    storage: getStorage(),
    secrets: { hashSecret: env.TOKEN_HASH_SECRET, encryptionKey: env.TOKEN_ENCRYPTION_KEY },
    appUrl: appUrl(),
    limits: uploadLimits(),
    rateLimit: createRateLimiter({ admin, secret: env.TOKEN_HASH_SECRET, enabled: env.RATE_LIMIT_ENABLED }),
  };
}

/** For pages and server actions: redirects to login when unauthenticated. */
export async function requirePublisher(): Promise<{ user: SessionUser; ctx: PublisherContext }> {
  const user = await getSessionUser();
  if (!user) redirect("/entrar");
  return { user, ctx: await buildPublisherContext(user) };
}

/** For route handlers: returns null when unauthenticated (caller sends 401). */
export async function publisherFromRequest(): Promise<PublisherContext | null> {
  const user = await getSessionUser();
  return user ? buildPublisherContext(user) : null;
}
