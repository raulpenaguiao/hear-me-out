import { decryptToken, issueToken } from "@/lib/tokens";
import type { ChannelInput } from "@/lib/validation";
import { RATE_LIMITS } from "../rate-limit";
import { channelPageUrl, feedUrl } from "../public/urls";
import type { PublisherContext } from "./context";
import { internalError, notFoundError, rateLimitedError } from "./errors";

export interface ChannelSummary {
  id: string;
  title: string;
  description: string;
  authorName: string | null;
  category: string;
  explicit: boolean;
  published: boolean;
  hasCover: boolean;
  createdAt: string;
  updatedAt: string;
  tokensRotatedAt: string;
  episodeCount: number;
  publishedEpisodeCount: number;
}

const SUMMARY_COLUMNS =
  "id, title, description, author_name, category, explicit, published, cover_image_key, created_at, updated_at, tokens_rotated_at, episodes(status)";

type SummaryRow = {
  id: string;
  title: string;
  description: string;
  author_name: string | null;
  category: string;
  explicit: boolean;
  published: boolean;
  cover_image_key: string | null;
  created_at: string;
  updated_at: string;
  tokens_rotated_at: string;
  episodes: Array<{ status: "draft" | "published" }>;
};

function toSummary(row: SummaryRow): ChannelSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    authorName: row.author_name,
    category: row.category,
    explicit: row.explicit,
    published: row.published,
    hasCover: row.cover_image_key !== null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tokensRotatedAt: row.tokens_rotated_at,
    episodeCount: row.episodes.length,
    publishedEpisodeCount: row.episodes.filter((e) => e.status === "published").length,
  };
}

export async function listChannels(ctx: PublisherContext): Promise<ChannelSummary[]> {
  const { data, error } = await ctx.db
    .from("channels")
    .select(SUMMARY_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw internalError();
  return (data as unknown as SummaryRow[]).map(toSummary);
}

export async function getChannel(ctx: PublisherContext, channelId: string): Promise<ChannelSummary> {
  const { data, error } = await ctx.db
    .from("channels")
    .select(SUMMARY_COLUMNS)
    .eq("id", channelId)
    .maybeSingle();
  if (error) throw internalError();
  if (!data) throw notFoundError();
  return toSummary(data as unknown as SummaryRow);
}

/** Ownership check through RLS. Throws not_found for other users' channels. */
export async function assertOwnsChannel(ctx: PublisherContext, channelId: string): Promise<void> {
  const { data, error } = await ctx.db.from("channels").select("id").eq("id", channelId).maybeSingle();
  if (error) throw internalError();
  if (!data) throw notFoundError();
}

export interface ChannelLinks {
  webUrl: string;
  rssUrl: string;
}

export async function getChannelLinks(ctx: PublisherContext, channelId: string): Promise<ChannelLinks> {
  await assertOwnsChannel(ctx, channelId);
  const { data, error } = await ctx.admin
    .from("channels")
    .select("web_token_ciphertext, rss_token_ciphertext")
    .eq("id", channelId)
    .eq("owner_id", ctx.userId)
    .single();
  if (error || !data) throw notFoundError();
  return {
    webUrl: channelPageUrl(
      ctx.appUrl,
      decryptToken(data.web_token_ciphertext, "web", ctx.secrets.encryptionKey),
    ),
    rssUrl: feedUrl(ctx.appUrl, decryptToken(data.rss_token_ciphertext, "rss", ctx.secrets.encryptionKey)),
  };
}

export async function createChannel(ctx: PublisherContext, input: ChannelInput): Promise<{ id: string }> {
  if (!(await ctx.rateLimit(RATE_LIMITS.channelCreate, ctx.userId))) throw rateLimitedError();
  const web = issueToken("web", ctx.secrets);
  const rss = issueToken("rss", ctx.secrets);
  const { data, error } = await ctx.admin
    .from("channels")
    .insert({
      owner_id: ctx.userId,
      title: input.title,
      description: input.description,
      author_name: input.authorName,
      category: input.category,
      explicit: input.explicit,
      published: input.published,
      web_token_hash: web.hash,
      rss_token_hash: rss.hash,
      web_token_ciphertext: web.ciphertext,
      rss_token_ciphertext: rss.ciphertext,
    })
    .select("id")
    .single();
  if (error || !data) throw internalError();
  return { id: data.id };
}

export async function updateChannel(
  ctx: PublisherContext,
  channelId: string,
  input: ChannelInput,
): Promise<void> {
  const { data, error } = await ctx.db
    .from("channels")
    .update({
      title: input.title,
      description: input.description,
      author_name: input.authorName,
      category: input.category,
      explicit: input.explicit,
      published: input.published,
    })
    .eq("id", channelId)
    .select("id");
  if (error) throw internalError();
  if (!data || data.length === 0) throw notFoundError();
}

/**
 * Replaces the channel's web and/or RSS token. The old hash is overwritten in
 * a single UPDATE, so the previous URL stops working immediately.
 */
export async function rotateChannelTokens(
  ctx: PublisherContext,
  channelId: string,
  which: "web" | "rss" | "both",
): Promise<ChannelLinks> {
  await assertOwnsChannel(ctx, channelId);
  if (!(await ctx.rateLimit(RATE_LIMITS.tokenRotation, ctx.userId))) throw rateLimitedError();

  const patch: {
    web_token_hash?: string;
    web_token_ciphertext?: string;
    rss_token_hash?: string;
    rss_token_ciphertext?: string;
    tokens_rotated_at: string;
  } = { tokens_rotated_at: new Date().toISOString() };
  if (which === "web" || which === "both") {
    const web = issueToken("web", ctx.secrets);
    patch.web_token_hash = web.hash;
    patch.web_token_ciphertext = web.ciphertext;
  }
  if (which === "rss" || which === "both") {
    const rss = issueToken("rss", ctx.secrets);
    patch.rss_token_hash = rss.hash;
    patch.rss_token_ciphertext = rss.ciphertext;
  }

  const { data, error } = await ctx.admin
    .from("channels")
    .update(patch)
    .eq("id", channelId)
    .eq("owner_id", ctx.userId)
    .select("id");
  if (error) throw internalError();
  if (!data || data.length === 0) throw notFoundError();
  return getChannelLinks(ctx, channelId);
}

/** Deletes a channel, its episodes (cascade) and their stored objects. */
export async function deleteChannel(ctx: PublisherContext, channelId: string): Promise<void> {
  const { data: channel, error: channelError } = await ctx.db
    .from("channels")
    .select("id, cover_image_key, episodes(audio_storage_key)")
    .eq("id", channelId)
    .maybeSingle();
  if (channelError) throw internalError();
  if (!channel) throw notFoundError();

  // Pending uploads may have objects too.
  const { data: uploads } = await ctx.admin
    .from("uploads")
    .select("storage_key")
    .eq("channel_id", channelId)
    .eq("owner_id", ctx.userId);

  const { data: deleted, error } = await ctx.db.from("channels").delete().eq("id", channelId).select("id");
  if (error) throw internalError();
  if (!deleted || deleted.length === 0) throw notFoundError();

  const keys = new Set<string>();
  if (channel.cover_image_key) keys.add(channel.cover_image_key);
  for (const ep of channel.episodes as Array<{ audio_storage_key: string | null }>) {
    if (ep.audio_storage_key) keys.add(ep.audio_storage_key);
  }
  for (const u of uploads ?? []) keys.add(u.storage_key);
  await deleteObjectsBestEffort(ctx, [...keys]);
}

export async function deleteObjectsBestEffort(ctx: PublisherContext, keys: string[]): Promise<void> {
  await Promise.all(
    keys.map((key) =>
      ctx.storage.delete(key).catch(() => {
        console.error("failed to delete stored object (orphan left behind)");
      }),
    ),
  );
}
