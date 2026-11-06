import { createHash } from "node:crypto";
import { formatByMimeType, imageFormatByMimeType } from "@/lib/audio-formats";

/** Builders for the public, token-bearing URLs. Tokens are URL-safe already. */

export function channelPageUrl(appUrl: string, webToken: string): string {
  return `${appUrl}/c/${webToken}`;
}

export function feedUrl(appUrl: string, rssToken: string): string {
  return `${appUrl}/rss/${rssToken}`;
}

export function audioExtension(mimeType: string): string {
  return formatByMimeType(mimeType)?.extension ?? "bin";
}

/** Stable enclosure URL: valid as long as the token and episode are. */
export function audioUrl(appUrl: string, guid: string, token: string, mimeType: string): string {
  return `${appUrl}/audio/${guid}/${token}.${audioExtension(mimeType)}`;
}

export function coverUrl(
  appUrl: string,
  token: string,
  coverKey: string | null,
  coverMimeType: string | null,
): string {
  if (!coverKey || !coverMimeType) return `${appUrl}/default-cover.png`;
  const ext = imageFormatByMimeType(coverMimeType)?.extension ?? "jpg";
  // Cache-busting version derived from the storage key (not the key itself).
  const version = createHash("sha256").update(coverKey).digest("hex").slice(0, 12);
  return `${appUrl}/cover/${token}.${ext}?v=${version}`;
}
