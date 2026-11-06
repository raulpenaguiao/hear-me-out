import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import {
  buildFeedXml,
  feedGuid,
  formatItunesDuration,
  toRfc822,
  type FeedChannel,
  type FeedEpisode,
} from "@/lib/rss";

const channel: FeedChannel = {
  title: "Peripécias & Companhia",
  description: "Histórias <curtas> e longas",
  authorName: "Raul",
  language: "pt-PT",
  category: "Society & Culture",
  explicit: false,
  lastBuildDate: new Date("2026-03-01T10:00:00Z"),
};

function episode(overrides: Partial<FeedEpisode> = {}): FeedEpisode {
  return {
    guid: "4b0c7e35-6f08-4d3e-9a1c-2a1f0b3c4d5e",
    title: "O dia em que perdi o comboio",
    description: "Uma história verdadeira.",
    mimeType: "audio/mpeg",
    sizeBytes: 1234567,
    durationSeconds: 3725,
    publishedAt: new Date("2026-02-14T09:30:00Z"),
    enclosureUrl: "https://ouveisto.example.com/audio/4b0c7e35-6f08-4d3e-9a1c-2a1f0b3c4d5e/TOKEN.mp3",
    ...overrides,
  };
}

const links = {
  siteUrl: "https://ouveisto.example.com",
  feedUrl: "https://ouveisto.example.com/rss/TOKEN",
  imageUrl: "https://ouveisto.example.com/default-cover.png",
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  isArray: (name) => name === "item",
});

function parse(xml: string) {
  expect(XMLValidator.validate(xml)).toBe(true);
  return parser.parse(xml) as {
    rss: { "@_version": string; channel: Record<string, unknown> & { item?: Array<Record<string, unknown>> } };
  };
}

describe("buildFeedXml", () => {
  it("produces a valid RSS 2.0 document with podcast namespaces", () => {
    const xml = buildFeedXml(channel, [episode()], links);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    const doc = parse(xml);
    expect(doc.rss["@_version"]).toBe("2.0");
    expect(xml).toContain('xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"');
    expect(xml).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
    const ch = doc.rss.channel;
    expect(ch.title).toBe("Peripécias & Companhia");
    expect(ch.description).toBe("Histórias <curtas> e longas");
    expect(ch.link).toBe(links.siteUrl);
    expect(ch.language).toBe("pt-PT");
    expect(ch["itunes:author"]).toBe("Raul");
    expect(ch["itunes:summary"]).toBe("Histórias <curtas> e longas");
    expect(ch["itunes:explicit"]).toBe("false");
    expect((ch["itunes:image"] as Record<string, string>)["@_href"]).toBe(links.imageUrl);
    expect((ch["itunes:category"] as Record<string, string>)["@_text"]).toBe("Society & Culture");
    expect(ch["itunes:block"]).toBe("Yes");
    expect((ch["atom:link"] as Record<string, string>)["@_href"]).toBe(links.feedUrl);
    expect((ch["atom:link"] as Record<string, string>)["@_rel"]).toBe("self");
  });

  it("describes enclosures, GUIDs, dates and durations correctly", () => {
    const doc = parse(buildFeedXml(channel, [episode()], links));
    const item = doc.rss.channel.item![0]!;
    const enclosure = item.enclosure as Record<string, string>;
    expect(enclosure["@_url"]).toBe(episode().enclosureUrl);
    expect(enclosure["@_type"]).toBe("audio/mpeg");
    expect(enclosure["@_length"]).toBe("1234567");
    const guid = item.guid as Record<string, string>;
    expect(guid["#text"]).toBe(feedGuid(episode().guid));
    expect(guid["@_isPermaLink"]).toBe("false");
    expect(item.pubDate).toBe("Sat, 14 Feb 2026 09:30:00 GMT");
    expect(item["itunes:duration"]).toBe("01:02:05");
    expect(item["itunes:explicit"]).toBe("false");
  });

  it("keeps the GUID stable when the title or description changes", () => {
    const a = parse(buildFeedXml(channel, [episode()], links)).rss.channel.item![0]!;
    const b = parse(
      buildFeedXml(channel, [episode({ title: "Novo título", description: "Nova descrição" })], links),
    ).rss.channel.item![0]!;
    expect((a.guid as Record<string, string>)["#text"]).toBe((b.guid as Record<string, string>)["#text"]);
  });

  it("orders items newest first", () => {
    const doc = parse(
      buildFeedXml(
        channel,
        [
          episode({ guid: "00000000-0000-4000-8000-000000000001", title: "old", publishedAt: new Date("2026-01-01") }),
          episode({ guid: "00000000-0000-4000-8000-000000000002", title: "new", publishedAt: new Date("2026-03-01") }),
        ],
        links,
      ),
    );
    expect(doc.rss.channel.item!.map((i) => i.title)).toEqual(["new", "old"]);
  });

  it("escapes hostile user input without breaking the XML", () => {
    const evil = `</title></item><item><title>pwned</title>]]>&\u0007"'`;
    const xml = buildFeedXml(
      { ...channel, title: evil, description: evil, authorName: evil },
      [episode({ title: evil, description: evil })],
      links,
    );
    const doc = parse(xml);
    expect(doc.rss.channel.item).toHaveLength(1);
    expect(doc.rss.channel.item![0]!.title).toBe(`</title></item><item><title>pwned</title>]]>&"'`);
  });

  it("produces an empty channel when there are no episodes", () => {
    const doc = parse(buildFeedXml(channel, [], links));
    expect(doc.rss.channel.item).toBeUndefined();
  });

  it("falls back to sensible defaults", () => {
    const doc = parse(
      buildFeedXml({ ...channel, authorName: null, description: "", explicit: true }, [episode({ durationSeconds: null, description: "" })], links),
    );
    expect(doc.rss.channel["itunes:author"]).toBe(channel.title);
    expect(doc.rss.channel.description).toBe(channel.title);
    expect(doc.rss.channel["itunes:explicit"]).toBe("true");
    const item = doc.rss.channel.item![0]!;
    expect(item["itunes:duration"]).toBeUndefined();
    expect(item.description).toBe(episode().title);
  });
});

describe("formatting helpers", () => {
  it("formats RFC 822 dates", () => {
    expect(toRfc822(new Date("2026-11-06T13:20:00Z"))).toBe("Fri, 06 Nov 2026 13:20:00 GMT");
  });
  it("formats iTunes durations", () => {
    expect(formatItunesDuration(0)).toBe("00:00:00");
    expect(formatItunesDuration(59.6)).toBe("00:01:00");
    expect(formatItunesDuration(3600 * 10 + 61)).toBe("10:01:01");
    expect(formatItunesDuration(-5)).toBe("00:00:00");
  });
});
