import type { TokenKind, TokenSecrets } from "@/lib/tokens";
import type { ObjectStorage } from "../storage/types";

/** Channel data needed by public (token-authenticated) endpoints. */
export interface PublicChannel {
  id: string;
  title: string;
  description: string;
  authorName: string | null;
  language: string;
  category: string;
  explicit: boolean;
  coverImageKey: string | null;
  coverImageMimeType: string | null;
  updatedAt: Date;
  webTokenCiphertext: string;
  rssTokenCiphertext: string;
}

export interface PublicEpisode {
  guid: string;
  title: string;
  description: string;
  audioStorageKey: string;
  audioMimeType: string;
  audioSizeBytes: number;
  durationSeconds: number | null;
  publishedAt: Date;
  updatedAt: Date;
}

/**
 * Read-only data access for public endpoints. Implementations MUST only return
 * channels whose `published` flag is true and episodes whose status is
 * `published`.
 */
export interface PublicRepository {
  findChannelByTokenHash(kind: TokenKind, hash: string): Promise<PublicChannel | null>;
  listPublishedEpisodes(channelId: string): Promise<PublicEpisode[]>;
  findPublishedEpisode(channelId: string, guid: string): Promise<PublicEpisode | null>;
}

export interface PublicContext {
  repo: PublicRepository;
  storage: ObjectStorage;
  secrets: TokenSecrets;
  appUrl: string;
  audioDeliveryMode: "proxy" | "redirect";
  /**
   * Called when a request presents an unknown/revoked token. Returns false if
   * the client has exceeded the failure budget and should receive 429.
   */
  recordInvalidToken?: (request: Request) => Promise<boolean>;
}
