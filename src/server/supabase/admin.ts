import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getEnv } from "@/lib/env";

let admin: SupabaseClient<Database> | undefined;

/**
 * Service-role client. Bypasses RLS — use only in server code, only after
 * performing explicit authorization checks, and never return its results to
 * the client without filtering.
 *
 * (Not marked with `server-only` because it is also used by the Pages Router
 * audio route; the runtime guard below enforces server-side use instead.)
 */
export function createAdminClient(): SupabaseClient<Database> {
  if (typeof window !== "undefined") {
    throw new Error("The service-role client must never be used in the browser");
  }
  if (admin) return admin;
  const env = getEnv();
  admin = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return admin;
}
