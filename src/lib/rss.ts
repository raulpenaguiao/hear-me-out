import { el, serializeDocument, type XmlNode } from "./xml";

/**
 * RSS 2.0 + iTunes podcast feed generation.
 *
 * The output targets the intersection of what Apple Podcasts, Pocket Casts,
 * Overcast, AntennaPod and other RSS-based apps accept. Private-feed hints
 * (`itunes:block`, `podcast:locked`) ask directories not to list or import the
 * feed; they are advisory and do not provide access control.
 */

export const ITUNES_NS = "http://www.itunes.com/dtds/podcast-1.0.dtd";
export const ATOM_NS = "http://www.w3.org/2005/Atom";
export const PODCAST_NS = "https://podcastindex.org/namespace/1.0";

/** Apple Podcasts top-level categories (a subset is enough for an MVP). */
export const PODCAST_CATEGORIES = [
  "Arts",
  "Business",
  "Comedy",
  "Education",
  "Fiction",
  "Health & Fitness",
  "History",
  "Kids & Family",
  "Leisure",
  "Music",
  "News",
  "Religion & Spirituality",
  "Science",
  "Society & Culture",
  "Sports",
  "Technology",
  "True Crime",
  "TV & Film",
] as const;

export const DEFAULT_CATEGORY = "Society & Culture";

export interface FeedChannel {
  title: string;
  description: string;
  authorName: string | null;
  language: string;
  category: string;
  explicit: boolean;
  lastBuildDate: Date;
}

export interface FeedEpisode {
  guid: string;
  title: string;
  description: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  publishedAt: Date;
  enclosureUrl: string;
}

export interface FeedLinks {
  /** Value for <link>: the site, never a secret URL. */
  siteUrl: string;
  /** The feed's own (secret) URL, for atom:link rel="self". */
  feedUrl: string;
  imageUrl: string;
}

/** RFC 822 / RFC 1123 date, e.g. "Fri, 06 Nov 2026 13:20:00 GMT". */
export function toRfc822(date: Date): string {
  return date.toUTCString();
}

/** HH:MM:SS duration as recommended by Apple. */
export function formatItunesDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Episode GUID as published in the feed. Stable for the life of the episode. */
export function feedGuid(guid: string): string {
  return `ouve-isto:episode:${guid}`;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function episodeNode(ep: FeedEpisode, channel: FeedChannel): XmlNode {
  const description = ep.description.trim() || ep.title;
  const children: XmlNode[] = [
    el("title", ep.title),
    el("description", description),
    el("itunes:summary", truncate(description, 4000)),
    el("guid", feedGuid(ep.guid), { isPermaLink: "false" }),
    el("pubDate", toRfc822(ep.publishedAt)),
    el("enclosure", null, {
      url: ep.enclosureUrl,
      length: Math.max(0, Math.trunc(ep.sizeBytes)),
      type: ep.mimeType,
    }),
    el("itunes:title", ep.title),
    el("itunes:explicit", channel.explicit ? "true" : "false"),
    el("itunes:episodeType", "full"),
  ];
  if (ep.durationSeconds !== null && Number.isFinite(ep.durationSeconds)) {
    children.push(el("itunes:duration", formatItunesDuration(ep.durationSeconds)));
  }
  return el("item", children);
}

export function buildFeedXml(
  channel: FeedChannel,
  episodes: readonly FeedEpisode[],
  links: FeedLinks,
): string {
  const sorted = [...episodes].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  const author = channel.authorName?.trim() || channel.title;
  const description = channel.description.trim() || channel.title;

  const channelChildren: XmlNode[] = [
    el("title", channel.title),
    el("link", links.siteUrl),
    el("description", description),
    el("language", channel.language),
    el("lastBuildDate", toRfc822(channel.lastBuildDate)),
    el("generator", "Ouve Isto"),
    el("atom:link", null, { href: links.feedUrl, rel: "self", type: "application/rss+xml" }),
    el("image", [el("url", links.imageUrl), el("title", channel.title), el("link", links.siteUrl)]),
    el("itunes:author", author),
    el("itunes:summary", truncate(description, 4000)),
    el("itunes:type", "episodic"),
    el("itunes:explicit", channel.explicit ? "true" : "false"),
    el("itunes:image", null, { href: links.imageUrl }),
    el("itunes:category", null, { text: channel.category || DEFAULT_CATEGORY }),
    // Private feed: ask Apple not to list it and other apps not to import it.
    el("itunes:block", "Yes"),
    el("podcast:locked", "yes"),
    ...sorted.map((ep) => episodeNode(ep, channel)),
  ];

  return serializeDocument(
    el("rss", [el("channel", channelChildren)], {
      version: "2.0",
      "xmlns:itunes": ITUNES_NS,
      "xmlns:atom": ATOM_NS,
      "xmlns:podcast": PODCAST_NS,
    }),
  );
}
