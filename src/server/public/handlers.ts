import { createHash } from "node:crypto";
import { buildFeedXml } from "@/lib/rss";
import { decryptToken, hashToken, parseTokenSegment, type TokenKind } from "@/lib/tokens";
import { notFound, PRIVATE_RESPONSE_HEADERS, serveObject, tooManyRequests } from "./serve-object";
import type { PublicChannel, PublicContext, PublicEpisode } from "./types";
import { audioExtension, audioUrl, channelPageUrl, coverUrl, feedUrl } from "./urls";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function rejectToken(request: Request, ctx: PublicContext): Promise<Response> {
  if (ctx.recordInvalidToken) {
    const allowed = await ctx.recordInvalidToken(request);
    if (!allowed) return tooManyRequests();
  }
  return notFound();
}

export interface ResolvedChannel {
  channel: PublicChannel;
  token: string;
  kind: TokenKind;
}

/** Resolves a raw token (as found in a URL) to a published channel. */
export async function resolveChannelToken(
  rawToken: string,
  kinds: readonly TokenKind[],
  ctx: Pick<PublicContext, "repo" | "secrets">,
): Promise<ResolvedChannel | null> {
  const parsed = parseTokenSegment(rawToken);
  if (!parsed) return null;
  for (const kind of kinds) {
    const hash = hashToken(parsed.token, kind, ctx.secrets.hashSecret);
    const channel = await ctx.repo.findChannelByTokenHash(kind, hash);
    if (channel) return { channel, token: parsed.token, kind };
  }
  return null;
}

// ---------------------------------------------------------------------------
// RSS feed
// ---------------------------------------------------------------------------

export function renderFeed(
  channel: PublicChannel,
  episodes: readonly PublicEpisode[],
  rssToken: string,
  appUrl: string,
): string {
  const lastBuildDate = new Date(
    Math.max(
      channel.updatedAt.getTime(),
      ...episodes.map((e) => Math.max(e.updatedAt.getTime(), e.publishedAt.getTime())),
    ),
  );
  return buildFeedXml(
    {
      title: channel.title,
      description: channel.description,
      authorName: channel.authorName,
      language: channel.language,
      category: channel.category,
      explicit: channel.explicit,
      lastBuildDate,
    },
    episodes.map((ep) => ({
      guid: ep.guid,
      title: ep.title,
      description: ep.description,
      mimeType: ep.audioMimeType,
      sizeBytes: ep.audioSizeBytes,
      durationSeconds: ep.durationSeconds,
      publishedAt: ep.publishedAt,
      enclosureUrl: audioUrl(appUrl, ep.guid, rssToken, ep.audioMimeType),
    })),
    {
      siteUrl: appUrl,
      feedUrl: feedUrl(appUrl, rssToken),
      imageUrl: coverUrl(appUrl, rssToken, channel.coverImageKey, channel.coverImageMimeType),
    },
  );
}

/**
 * GET/HEAD /rss/:token
 *
 * Feeds are never cached by shared caches (`private`) and clients must
 * revalidate every time (`no-cache`), so publishing/unpublishing and token
 * rotation take effect immediately. ETags make revalidation cheap (304).
 */
export async function handleFeedRequest(
  request: Request,
  rawToken: string,
  ctx: PublicContext,
): Promise<Response> {
  const resolved = await resolveChannelToken(rawToken, ["rss"], ctx);
  if (!resolved) return rejectToken(request, ctx);

  const episodes = await ctx.repo.listPublishedEpisodes(resolved.channel.id);
  const xml = renderFeed(resolved.channel, episodes, resolved.token, ctx.appUrl);
  const etag = `"${createHash("sha256").update(xml).digest("base64url").slice(0, 32)}"`;

  const headers: Record<string, string> = {
    "Content-Type": "application/rss+xml; charset=utf-8",
    "Cache-Control": "private, no-cache, max-age=0, must-revalidate",
    ETag: etag,
    Vary: "Accept-Encoding",
    ...PRIVATE_RESPONSE_HEADERS,
  };

  const inm = request.headers.get("if-none-match");
  if (inm && inm.split(",").some((t) => t.trim().replace(/^W\//, "") === etag)) {
    return new Response(null, { status: 304, headers });
  }

  const body = new TextEncoder().encode(xml);
  headers["Content-Length"] = String(body.byteLength);
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, { status: 200, headers });
  }
  return new Response(body, { status: 200, headers });
}

// ---------------------------------------------------------------------------
// Audio enclosures
// ---------------------------------------------------------------------------

/**
 * GET/HEAD /audio/:guid/:token(.ext)
 *
 * Stable, tokenized enclosure URL. Accepts the channel's RSS token (used in
 * feeds) or web token (used by the web player). Every failure mode — bad
 * token, revoked token, episode from another channel, draft episode, deleted
 * episode — yields the same 404 so the endpoint is not an oracle.
 */
export async function handleAudioRequest(
  request: Request,
  rawGuid: string,
  rawToken: string,
  ctx: PublicContext,
): Promise<Response> {
  if (!UUID_PATTERN.test(rawGuid)) return notFound();
  const resolved = await resolveChannelToken(rawToken, ["rss", "web"], ctx);
  if (!resolved) return rejectToken(request, ctx);

  const episode = await ctx.repo.findPublishedEpisode(resolved.channel.id, rawGuid.toLowerCase());
  if (!episode) return notFound();

  const fileName = `${episode.guid}.${audioExtension(episode.audioMimeType)}`;

  if (ctx.audioDeliveryMode === "redirect") {
    const url = await ctx.storage.createDownloadUrl({
      key: episode.audioStorageKey,
      expiresInSeconds: 3600,
      contentType: episode.audioMimeType,
      fileName,
    });
    if (url) {
      return new Response(null, {
        status: 302,
        headers: { Location: url, "Cache-Control": "no-store", ...PRIVATE_RESPONSE_HEADERS },
      });
    }
  }

  return serveObject(request, {
    storage: ctx.storage,
    key: episode.audioStorageKey,
    size: episode.audioSizeBytes,
    contentType: episode.audioMimeType,
    etag: `"${createHash("sha256").update(episode.audioStorageKey).digest("base64url").slice(0, 27)}"`,
    lastModified: episode.updatedAt,
    fileName,
    // Clients may cache audio privately; tokens/episodes revoked later are
    // enforced on the next request. Shared caches never store it.
    cacheControl: "private, max-age=3600",
  });
}

// ---------------------------------------------------------------------------
// Cover images
// ---------------------------------------------------------------------------

export async function handleCoverRequest(
  request: Request,
  rawToken: string,
  ctx: PublicContext,
): Promise<Response> {
  const resolved = await resolveChannelToken(rawToken, ["rss", "web"], ctx);
  if (!resolved) return rejectToken(request, ctx);
  const { channel } = resolved;
  if (!channel.coverImageKey || !channel.coverImageMimeType) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${ctx.appUrl}/default-cover.png`, "Cache-Control": "no-store" },
    });
  }
  const info = await ctx.storage.head(channel.coverImageKey);
  if (!info) return notFound();
  return serveObject(request, {
    storage: ctx.storage,
    key: channel.coverImageKey,
    size: info.size,
    contentType: channel.coverImageMimeType,
    etag: `"${createHash("sha256").update(channel.coverImageKey).digest("base64url").slice(0, 27)}"`,
    lastModified: channel.updatedAt,
    fileName: "cover",
    cacheControl: "private, max-age=86400",
  });
}

// ---------------------------------------------------------------------------
// Public channel page data
// ---------------------------------------------------------------------------

export interface PublicChannelView {
  title: string;
  description: string;
  authorName: string | null;
  coverUrl: string;
  feedUrl: string;
  pageUrl: string;
  episodes: Array<{
    guid: string;
    title: string;
    description: string;
    durationSeconds: number | null;
    publishedAt: string;
    audioUrl: string;
    mimeType: string;
  }>;
}

export async function loadPublicChannelView(
  rawToken: string,
  ctx: PublicContext,
): Promise<PublicChannelView | null> {
  const resolved = await resolveChannelToken(rawToken, ["web"], ctx);
  if (!resolved) return null;
  const { channel, token } = resolved;
  const rssToken = decryptToken(channel.rssTokenCiphertext, "rss", ctx.secrets.encryptionKey);
  const episodes = await ctx.repo.listPublishedEpisodes(channel.id);
  return {
    title: channel.title,
    description: channel.description,
    authorName: channel.authorName,
    coverUrl: coverUrl(ctx.appUrl, token, channel.coverImageKey, channel.coverImageMimeType),
    feedUrl: feedUrl(ctx.appUrl, rssToken),
    pageUrl: channelPageUrl(ctx.appUrl, token),
    episodes: episodes
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .map((ep) => ({
        guid: ep.guid,
        title: ep.title,
        description: ep.description,
        durationSeconds: ep.durationSeconds,
        publishedAt: ep.publishedAt.toISOString(),
        audioUrl: audioUrl(ctx.appUrl, ep.guid, token, ep.audioMimeType),
        mimeType: ep.audioMimeType,
      })),
  };
}
