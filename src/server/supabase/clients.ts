import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { getEnv } from "@/lib/env";

export type Db = SupabaseClient<Database>;

/**
 * Supabase client bound to the current user's session cookies. Every query
 * runs as the `authenticated` role and is subject to RLS.
 */
export async function createUserClient(): Promise<Db> {
  const env = getEnv();
  const cookieStore = await cookies();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: cookies are read-only there. The
          // proxy refreshes sessions, so this is safe to ignore.
        }
      },
    },
  });
}

let admin: Db | undefined;

/**
 * Service-role client. Bypasses RLS — use only in server code, only after
 * performing explicit authorization checks, and never return its results to
 * the client without filtering.
 */
export function createAdminClient(): Db {
  if (admin) return admin;
  const env = getEnv();
  admin = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return admin;
}
