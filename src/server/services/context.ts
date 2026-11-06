import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { TokenSecrets } from "@/lib/tokens";
import type { RateLimiter } from "../rate-limit";
import type { ObjectStorage } from "../storage/types";

export interface UploadLimits {
  audioMaxBytes: number;
  audioMaxDurationSeconds: number;
  coverMaxBytes: number;
  uploadUrlTtlSeconds: number;
}

/**
 * Everything a publisher operation needs. `db` is the user-scoped (RLS)
 * client and is used for every ownership check; `admin` is the service-role
 * client and is only used for writes that the `authenticated` role is not
 * allowed to perform (token hashes, verified audio metadata), always after an
 * ownership check through `db`.
 */
export interface PublisherContext {
  userId: string;
  db: SupabaseClient<Database>;
  admin: SupabaseClient<Database>;
  storage: ObjectStorage;
  secrets: TokenSecrets;
  appUrl: string;
  limits: UploadLimits;
  rateLimit: RateLimiter;
}
