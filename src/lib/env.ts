import { z } from "zod";

/**
 * Server-side environment configuration.
 *
 * Parsed lazily (on first access) so that `next build` and unit tests do not
 * require every variable to be present. Never import this module from client
 * components: it reads secrets.
 */

const booleanish = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const positiveNumber = (fallback: number) =>
  z.coerce.number().positive().default(fallback);

const base64Key32 = z
  .string()
  .min(1)
  .refine((v) => Buffer.from(v, "base64").length === 32, {
    message: "must be 32 bytes encoded as base64 (openssl rand -base64 32)",
  });

const serverSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /**
     * Canonical public origin used in shared links and RSS. Falls back to the
     * Vercel deployment URL (previews) and then to http://localhost:3000.
     */
    NEXT_PUBLIC_APP_URL: z.url().optional(),

    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

    TOKEN_HASH_SECRET: z.string().min(32, "use at least 32 random characters"),
    TOKEN_ENCRYPTION_KEY: base64Key32,

    STORAGE_DRIVER: z.enum(["r2", "local"]).default("r2"),
    LOCAL_STORAGE_DIR: z.string().default(".data/storage"),
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET: z.string().optional(),
    /** Optional override, e.g. a MinIO endpoint for testing. */
    R2_ENDPOINT: z.url().optional(),

    AUDIO_DELIVERY_MODE: z.enum(["proxy", "redirect"]).default("proxy"),
    AUDIO_MAX_UPLOAD_MB: positiveNumber(200),
    AUDIO_MAX_DURATION_MINUTES: positiveNumber(180),
    COVER_MAX_UPLOAD_MB: positiveNumber(5),
    UPLOAD_URL_TTL_SECONDS: positiveNumber(900),

    RATE_LIMIT_ENABLED: booleanish.default(true),
    /** Trust x-forwarded-for / x-real-ip (true on Vercel and behind a proxy). */
    TRUST_PROXY_HEADERS: booleanish.default(true),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === "r2") {
      for (const key of [
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET",
      ] as const) {
        if (!env[key] && !(key === "R2_ACCOUNT_ID" && env.R2_ENDPOINT)) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required when STORAGE_DRIVER=r2`,
          });
        }
      }
    }
    if (env.STORAGE_DRIVER === "local" && process.env.VERCEL) {
      ctx.addIssue({
        code: "custom",
        path: ["STORAGE_DRIVER"],
        message: "the local storage driver cannot be used on Vercel; use r2",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function getEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    // Only variable names and validation messages are printed, never values.
    throw new Error(`Invalid server environment configuration:\n${details}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: forget the cached configuration. */
export function resetEnvCache(): void {
  cached = undefined;
}

export function appUrl(): string {
  const env = getEnv();
  const vercelUrl =
    process.env.VERCEL_ENV === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : (process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL);
  const url =
    env.NEXT_PUBLIC_APP_URL ?? (vercelUrl ? `https://${vercelUrl}` : "http://localhost:3000");
  return url.replace(/\/+$/, "");
}

export function uploadLimits() {
  const env = getEnv();
  return {
    audioMaxBytes: Math.floor(env.AUDIO_MAX_UPLOAD_MB * 1024 * 1024),
    audioMaxDurationSeconds: Math.floor(env.AUDIO_MAX_DURATION_MINUTES * 60),
    coverMaxBytes: Math.floor(env.COVER_MAX_UPLOAD_MB * 1024 * 1024),
    uploadUrlTtlSeconds: Math.floor(env.UPLOAD_URL_TTL_SECONDS),
  };
}
