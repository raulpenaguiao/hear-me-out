import { encryptToken, generateToken, hashToken, type TokenSecrets } from "@/lib/tokens";
import type { PublicChannel, PublicEpisode, PublicRepository } from "@/server/public/types";

export const TEST_SECRETS: TokenSecrets = {
  hashSecret: "test-hash-secret-that-is-long-enough-0123456789",
  encryptionKey: Buffer.alloc(32, 7).toString("base64"),
};

interface StoredChannel extends PublicChannel {
  webTokenHash: string;
  rssTokenHash: string;
  published: boolean;
}

interface StoredEpisode extends PublicEpisode {
  channelId: string;
  status: "draft" | "published";
}

/** In-memory PublicRepository with the same filtering contract as Supabase. */
export class MemoryPublicRepository implements PublicRepository {
  channels: StoredChannel[] = [];
  episodes: StoredEpisode[] = [];

  addChannel(overrides: Partial<StoredChannel> = {}) {
    const webToken = generateToken();
    const rssToken = generateToken();
    const channel: StoredChannel = {
      id: crypto.randomUUID(),
      title: "Peripécias",
      description: "Histórias & desabafos",
      authorName: null,
      language: "pt-PT",
      category: "Society & Culture",
      explicit: false,
      coverImageKey: null,
      coverImageMimeType: null,
      updatedAt: new Date("2026-01-01T10:00:00Z"),
      webTokenCiphertext: encryptToken(webToken, "web", TEST_SECRETS.encryptionKey),
      rssTokenCiphertext: encryptToken(rssToken, "rss", TEST_SECRETS.encryptionKey),
      webTokenHash: hashToken(webToken, "web", TEST_SECRETS.hashSecret),
      rssTokenHash: hashToken(rssToken, "rss", TEST_SECRETS.hashSecret),
      published: true,
      ...overrides,
    };
    this.channels.push(channel);
    return { channel, webToken, rssToken };
  }

  rotate(channelId: string, kind: "web" | "rss"): string {
    const channel = this.channels.find((c) => c.id === channelId)!;
    const token = generateToken();
    if (kind === "web") {
      channel.webTokenHash = hashToken(token, "web", TEST_SECRETS.hashSecret);
      channel.webTokenCiphertext = encryptToken(token, "web", TEST_SECRETS.encryptionKey);
    } else {
      channel.rssTokenHash = hashToken(token, "rss", TEST_SECRETS.hashSecret);
      channel.rssTokenCiphertext = encryptToken(token, "rss", TEST_SECRETS.encryptionKey);
    }
    return token;
  }

  addEpisode(channelId: string, overrides: Partial<StoredEpisode> = {}): StoredEpisode {
    const episode: StoredEpisode = {
      channelId,
      guid: crypto.randomUUID(),
      title: "Episódio",
      description: "",
      audioStorageKey: `audio/${channelId}/${crypto.randomUUID()}.mp3`,
      audioMimeType: "audio/mpeg",
      audioSizeBytes: 2048,
      durationSeconds: 61,
      publishedAt: new Date("2026-02-01T12:00:00Z"),
      updatedAt: new Date("2026-02-01T12:00:00Z"),
      status: "published",
      ...overrides,
    };
    this.episodes.push(episode);
    return episode;
  }

  async findChannelByTokenHash(kind: "web" | "rss", hash: string): Promise<PublicChannel | null> {
    return (
      this.channels.find(
        (c) => c.published && (kind === "web" ? c.webTokenHash === hash : c.rssTokenHash === hash),
      ) ?? null
    );
  }

  async listPublishedEpisodes(channelId: string): Promise<PublicEpisode[]> {
    return this.episodes.filter((e) => e.channelId === channelId && e.status === "published");
  }

  async findPublishedEpisode(channelId: string, guid: string): Promise<PublicEpisode | null> {
    return (
      this.episodes.find((e) => e.channelId === channelId && e.guid === guid && e.status === "published") ??
      null
    );
  }
}
