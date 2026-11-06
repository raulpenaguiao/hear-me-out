import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Postgres-backed fixed-window rate limiting, shared by all serverless
 * instances. Keys are HMAC'd so raw IP addresses and e-mails are never stored.
 */

export interface RateLimitRule {
  name: string;
  windowSeconds: number;
  max: number;
}

export const RATE_LIMITS = {
  login: { name: "login", windowSeconds: 15 * 60, max: 10 },
  signup: { name: "signup", windowSeconds: 60 * 60, max: 5 },
  passwordReset: { name: "password-reset", windowSeconds: 60 * 60, max: 5 },
  uploadUrl: { name: "upload-url", windowSeconds: 60 * 60, max: 60 },
  tokenRotation: { name: "token-rotation", windowSeconds: 60 * 60, max: 20 },
  channelCreate: { name: "channel-create", windowSeconds: 60 * 60, max: 20 },
  invalidToken: { name: "invalid-token", windowSeconds: 10 * 60, max: 60 },
} satisfies Record<string, RateLimitRule>;

export function rateLimitKey(rule: RateLimitRule, subject: string, secret: string): string {
  const digest = createHmac("sha256", secret).update(`${rule.name}:${subject}`).digest("hex");
  return `${rule.name}:${digest.slice(0, 40)}`;
}

export interface RateLimiterOptions {
  admin: SupabaseClient<Database>;
  secret: string;
  enabled: boolean;
}

export function createRateLimiter(opts: RateLimiterOptions) {
  return async function hit(rule: RateLimitRule, subject: string): Promise<boolean> {
    if (!opts.enabled) return true;
    const { data, error } = await opts.admin.rpc("rate_limit_hit", {
      p_key: rateLimitKey(rule, subject, opts.secret),
      p_window_seconds: rule.windowSeconds,
      p_max_hits: rule.max,
    });
    if (error) {
      // Fail open on infrastructure errors so an outage of the limiter does
      // not lock everyone out; the error is logged without the subject.
      console.error("rate limiter error", { rule: rule.name, code: error.code });
      return true;
    }
    return data === true;
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

/** Best-effort client IP for rate limiting only (never logged or stored raw). */
export function clientIp(headers: Headers, trustProxyHeaders: boolean): string {
  if (trustProxyHeaders) {
    const forwarded = headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]!.trim();
    const real = headers.get("x-real-ip");
    if (real) return real.trim();
  }
  return "unknown";
}
