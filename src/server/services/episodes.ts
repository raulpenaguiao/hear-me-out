import type { EpisodeInput } from "@/lib/validation";
import { deleteObjectsBestEffort } from "./channels";
import type { PublisherContext } from "./context";
import { internalError, notFoundError, ServiceError } from "./errors";

export interface EpisodeSummary {
  id: string;
  channelId: string;
  channelTitle: string;
  title: string;
  description: string;
  status: "draft" | "published";
  hasAudio: boolean;
  audioMimeType: string | null;
  audioSizeBytes: number | null;
  durationSeconds: number | null;
  guid: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const EPISODE_COLUMNS =
  "id, channel_id, title, description, status, audio_storage_key, audio_mime_type, audio_size_bytes, duration_seconds, guid, published_at, created_at, updated_at, channels(title)";

type EpisodeRow = {
  id: string;
  channel_id: string;
  title: string;
  description: string;
  status: "draft" | "published";
  audio_storage_key: string | null;
  audio_mime_type: string | null;
  audio_size_bytes: number | null;
  duration_seconds: number | null;
  guid: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  channels: { title: string } | null;
};

function toSummary(row: EpisodeRow): EpisodeSummary {
  return {
    id: row.id,
    channelId: row.channel_id,
    channelTitle: row.channels?.title ?? "",
    title: row.title,
    description: row.description,
    status: row.status,
    hasAudio: row.audio_storage_key !== null,
    audioMimeType: row.audio_mime_type,
    audioSizeBytes: row.audio_size_bytes === null ? null : Number(row.audio_size_bytes),
    durationSeconds: row.duration_seconds,
    guid: row.guid,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listEpisodes(
  ctx: PublisherContext,
  opts: { channelId?: string; limit?: number } = {},
): Promise<EpisodeSummary[]> {
  let query = ctx.db.from("episodes").select(EPISODE_COLUMNS).order("created_at", { ascending: false });
  if (opts.channelId) query = query.eq("channel_id", opts.channelId);
  if (opts.limit) query = query.limit(opts.limit);
  const { data, error } = await query;
  if (error) throw internalError();
  return (data as unknown as EpisodeRow[]).map(toSummary);
}

export async function countPublishedEpisodes(ctx: PublisherContext): Promise<number> {
  const { count, error } = await ctx.db
    .from("episodes")
    .select("id", { count: "exact", head: true })
    .eq("status", "published");
  if (error) throw internalError();
  return count ?? 0;
}

export async function getEpisode(ctx: PublisherContext, episodeId: string): Promise<EpisodeSummary> {
  const { data, error } = await ctx.db.from("episodes").select(EPISODE_COLUMNS).eq("id", episodeId).maybeSingle();
  if (error) throw internalError();
  if (!data) throw notFoundError();
  return toSummary(data as unknown as EpisodeRow);
}

/** Internal: the storage key of an episode the user owns (RLS-checked). */
export async function getOwnedEpisodeAudio(
  ctx: PublisherContext,
  episodeId: string,
): Promise<{ key: string; mimeType: string; size: number; updatedAt: Date; guid: string } | null> {
  const { data, error } = await ctx.db
    .from("episodes")
    .select("audio_storage_key, audio_mime_type, audio_size_bytes, updated_at, guid")
    .eq("id", episodeId)
    .maybeSingle();
  if (error) throw internalError();
  if (!data?.audio_storage_key || !data.audio_mime_type || !data.audio_size_bytes) return null;
  return {
    key: data.audio_storage_key,
    mimeType: data.audio_mime_type,
    size: Number(data.audio_size_bytes),
    updatedAt: new Date(data.updated_at),
    guid: data.guid,
  };
}

export async function createEpisode(
  ctx: PublisherContext,
  input: EpisodeInput & { channelId: string },
): Promise<{ id: string }> {
  // RLS (owns_channel) rejects inserts into channels the user does not own.
  const { data, error } = await ctx.db
    .from("episodes")
    .insert({ channel_id: input.channelId, title: input.title, description: input.description })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "42501" || error?.code === "23503") throw notFoundError();
    throw internalError();
  }
  return { id: data.id };
}

export async function updateEpisode(
  ctx: PublisherContext,
  episodeId: string,
  input: EpisodeInput,
): Promise<void> {
  const { data, error } = await ctx.db
    .from("episodes")
    .update({ title: input.title, description: input.description })
    .eq("id", episodeId)
    .select("id");
  if (error) throw internalError();
  if (!data || data.length === 0) throw notFoundError();
}

/**
 * Publishes or unpublishes an episode. Feeds are generated on each request,
 * so the change is visible to listeners immediately.
 */
export async function setEpisodeStatus(
  ctx: PublisherContext,
  episodeId: string,
  status: "draft" | "published",
): Promise<void> {
  const { data, error } = await ctx.db
    .from("episodes")
    .update({ status })
    .eq("id", episodeId)
    .select("id");
  if (error) {
    if (error.code === "23514") {
      throw new ServiceError("invalid_input", "Adiciona áudio ao episódio antes de o publicar.");
    }
    throw internalError();
  }
  if (!data || data.length === 0) throw notFoundError();
}

export async function deleteEpisode(ctx: PublisherContext, episodeId: string): Promise<{ channelId: string }> {
  const { data: episode, error: readError } = await ctx.db
    .from("episodes")
    .select("id, channel_id, audio_storage_key")
    .eq("id", episodeId)
    .maybeSingle();
  if (readError) throw internalError();
  if (!episode) throw notFoundError();

  const { data: uploads } = await ctx.admin
    .from("uploads")
    .select("storage_key")
    .eq("episode_id", episodeId)
    .eq("owner_id", ctx.userId);

  const { data, error } = await ctx.db.from("episodes").delete().eq("id", episodeId).select("id");
  if (error) throw internalError();
  if (!data || data.length === 0) throw notFoundError();

  const keys = new Set<string>((uploads ?? []).map((u) => u.storage_key));
  if (episode.audio_storage_key) keys.add(episode.audio_storage_key);
  await deleteObjectsBestEffort(ctx, [...keys]);
  return { channelId: episode.channel_id };
}
