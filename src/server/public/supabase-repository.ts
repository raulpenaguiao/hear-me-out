import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { TokenKind } from "@/lib/tokens";
import type { PublicChannel, PublicEpisode, PublicRepository } from "./types";

const CHANNEL_COLUMNS =
  "id, title, description, author_name, language, category, explicit, cover_image_key, cover_image_mime_type, updated_at, web_token_ciphertext, rss_token_ciphertext";

const EPISODE_COLUMNS =
  "guid, title, description, audio_storage_key, audio_mime_type, audio_size_bytes, duration_seconds, published_at, updated_at";

type EpisodeRow = Pick<
  Database["public"]["Tables"]["episodes"]["Row"],
  | "guid"
  | "title"
  | "description"
  | "audio_storage_key"
  | "audio_mime_type"
  | "audio_size_bytes"
  | "duration_seconds"
  | "published_at"
  | "updated_at"
>;

function mapEpisode(row: EpisodeRow): PublicEpisode | null {
  if (!row.audio_storage_key || !row.audio_mime_type || !row.audio_size_bytes || !row.published_at) {
    return null;
  }
  return {
    guid: row.guid,
    title: row.title,
    description: row.description,
    audioStorageKey: row.audio_storage_key,
    audioMimeType: row.audio_mime_type,
    audioSizeBytes: Number(row.audio_size_bytes),
    durationSeconds: row.duration_seconds,
    publishedAt: new Date(row.published_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Public data access through the service-role client. Every query filters on
 * `published` explicitly — this is the only gate between listeners and drafts.
 */
export class SupabasePublicRepository implements PublicRepository {
  constructor(private readonly admin: SupabaseClient<Database>) {}

  async findChannelByTokenHash(kind: TokenKind, hash: string): Promise<PublicChannel | null> {
    if (!/^[0-9a-f]{64}$/.test(hash)) return null;
    const column = kind === "web" ? "web_token_hash" : "rss_token_hash";
    const { data, error } = await this.admin
      .from("channels")
      .select(CHANNEL_COLUMNS)
      .eq(column, hash)
      .eq("published", true)
      .maybeSingle();
    if (error) throw new Error(`channel lookup failed: ${error.code}`);
    if (!data) return null;
    return {
      id: data.id,
      title: data.title,
      description: data.description,
      authorName: data.author_name,
      language: data.language,
      category: data.category,
      explicit: data.explicit,
      coverImageKey: data.cover_image_key,
      coverImageMimeType: data.cover_image_mime_type,
      updatedAt: new Date(data.updated_at),
      webTokenCiphertext: data.web_token_ciphertext,
      rssTokenCiphertext: data.rss_token_ciphertext,
    };
  }

  async listPublishedEpisodes(channelId: string): Promise<PublicEpisode[]> {
    const { data, error } = await this.admin
      .from("episodes")
      .select(EPISODE_COLUMNS)
      .eq("channel_id", channelId)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(`episode listing failed: ${error.code}`);
    return (data ?? []).map(mapEpisode).filter((e): e is PublicEpisode => e !== null);
  }

  async findPublishedEpisode(channelId: string, guid: string): Promise<PublicEpisode | null> {
    const { data, error } = await this.admin
      .from("episodes")
      .select(EPISODE_COLUMNS)
      .eq("channel_id", channelId)
      .eq("guid", guid)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw new Error(`episode lookup failed: ${error.code}`);
    return data ? mapEpisode(data) : null;
  }
}
