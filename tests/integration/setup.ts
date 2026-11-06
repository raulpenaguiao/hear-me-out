import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createRateLimiter } from "@/server/rate-limit";
import type { PublisherContext } from "@/server/services/context";
import { MemoryStorage } from "@/server/storage/memory";
import { TEST_SECRETS } from "../helpers/memory-repo";

export const APP_URL = "https://ouveisto.test";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Integration tests need the local Supabase stack: run "npm run db:start" and "npm run env:local".`,
    );
  }
  return value;
}

export const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
export const ANON_KEY = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

export const admin: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL,
  SERVICE_KEY,
  clientOptions,
);

export function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, ANON_KEY, clientOptions);
}

export function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@ouveisto.test`;
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient<Database>;
}

/** Creates a confirmed user and returns a client signed in as them. */
export async function createTestUser(label = "user"): Promise<TestUser> {
  const email = uniqueEmail(label);
  const password = "correct-horse-battery-staple";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const client = anonClient();
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, email, password, client };
}

export async function deleteTestUser(user: TestUser | undefined): Promise<void> {
  if (user) await admin.auth.admin.deleteUser(user.id);
}

export function publisherContext(user: TestUser, storage = new MemoryStorage()): PublisherContext {
  return {
    userId: user.id,
    db: user.client,
    admin,
    storage,
    secrets: TEST_SECRETS,
    appUrl: APP_URL,
    limits: {
      audioMaxBytes: 1024 * 1024,
      audioMaxDurationSeconds: 600,
      coverMaxBytes: 256 * 1024,
      uploadUrlTtlSeconds: 600,
    },
    rateLimit: createRateLimiter({ admin, secret: TEST_SECRETS.hashSecret, enabled: true }),
  };
}
