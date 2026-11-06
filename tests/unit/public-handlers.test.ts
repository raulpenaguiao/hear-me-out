import { XMLParser, XMLValidator } from "fast-xml-parser";
import { beforeEach, describe, expect, it } from "vitest";
import { generateToken } from "@/lib/tokens";
import {
  handleAudioRequest,
  handleCoverRequest,
  handleFeedRequest,
  loadPublicChannelView,
} from "@/server/public/handlers";
import type { PublicContext } from "@/server/public/types";
import { MemoryStorage } from "@/server/storage/memory";
import { MemoryPublicRepository, TEST_SECRETS } from "../helpers/memory-repo";

const APP = "https://ouveisto.example.com";
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  isArray: (n) => n === "item",
});

let repo: MemoryPublicRepository;
let storage: MemoryStorage;
let ctx: PublicContext;
let invalidTokenHits: number;
let invalidTokenBudget: number;

function req(url: string, init: RequestInit = {}) {
  return new Request(`${APP}${url}`, init);
}

beforeEach(() => {
  repo = new MemoryPublicRepository();
  storage = new MemoryStorage();
  invalidTokenHits = 0;
  invalidTokenBudget = 100;
  ctx = {
    repo,
    storage,
    secrets: TEST_SECRETS,
    appUrl: APP,
    audioDeliveryMode: "proxy",
    recordInvalidToken: async () => {
      invalidTokenHits += 1;
      return invalidTokenHits <= invalidTokenBudget;
    },
  };
});

function setupChannel() {
  const { channel, webToken, rssToken } = repo.addChannel();
  const audio = new Uint8Array(1000).map((_, i) => i % 256);
  const published = repo.addEpisode(channel.id, { title: "Publicado", audioSizeBytes: audio.length });
  storage.put(published.audioStorageKey, audio, "audio/mpeg");
  const draft = repo.addEpisode(channel.id, { title: "Rascunho secreto", status: "draft" });
  storage.put(draft.audioStorageKey, audio, "audio/mpeg");
  return { channel, webToken, rssToken, published, draft, audio };
}

describe("RSS feed endpoint", () => {
  it("serves valid RSS with only published episodes", async () => {
    const { rssToken, published } = setupChannel();
    const res = await handleFeedRequest(req(`/rss/${rssToken}`), rssToken, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/rss+xml; charset=utf-8");
    expect(res.headers.get("cache-control")).toContain("no-cache");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    const xml = await res.text();
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(xml).not.toContain("Rascunho secreto");
    const doc = parser.parse(xml);
    const items = doc.rss.channel.item as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    const enclosure = items[0]!.enclosure as Record<string, string>;
    expect(enclosure["@_url"]).toBe(`${APP}/audio/${published.guid}/${rssToken}.mp3`);
    expect(enclosure["@_type"]).toBe("audio/mpeg");
    expect(enclosure["@_length"]).toBe("1000");
    expect(Number(res.headers.get("content-length"))).toBe(new TextEncoder().encode(xml).byteLength);
  });

  it("accepts a .xml suffix on the token", async () => {
    const { rssToken } = setupChannel();
    const res = await handleFeedRequest(req(`/rss/${rssToken}.xml`), `${rssToken}.xml`, ctx);
    expect(res.status).toBe(200);
  });

  it("never uses the web token in the feed and rejects web tokens as feed tokens", async () => {
    const { rssToken, webToken } = setupChannel();
    const xml = await (await handleFeedRequest(req(`/rss/${rssToken}`), rssToken, ctx)).text();
    expect(xml).not.toContain(webToken);
    const res = await handleFeedRequest(req(`/rss/${webToken}`), webToken, ctx);
    expect(res.status).toBe(404);
  });

  it("supports conditional requests with ETags", async () => {
    const { rssToken } = setupChannel();
    const first = await handleFeedRequest(req(`/rss/${rssToken}`), rssToken, ctx);
    const etag = first.headers.get("etag")!;
    expect(etag).toMatch(/^".+"$/);
    const second = await handleFeedRequest(
      req(`/rss/${rssToken}`, { headers: { "If-None-Match": etag } }),
      rssToken,
      ctx,
    );
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });

  it("changes the ETag as soon as an episode is published", async () => {
    const { rssToken, draft } = setupChannel();
    const before = (await handleFeedRequest(req(`/rss/${rssToken}`), rssToken, ctx)).headers.get("etag");
    repo.episodes.find((e) => e.guid === draft.guid)!.status = "published";
    const after = await handleFeedRequest(
      req(`/rss/${rssToken}`, { headers: { "If-None-Match": before! } }),
      rssToken,
      ctx,
    );
    expect(after.status).toBe(200);
    expect(await after.text()).toContain("Rascunho secreto");
  });

  it("returns 404 for unknown, malformed and revoked tokens", async () => {
    const { rssToken, channel } = setupChannel();
    for (const token of [generateToken(), "short", `${rssToken}x`, "../../etc/passwd"]) {
      const res = await handleFeedRequest(req(`/rss/${token}`), token, ctx);
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    const fresh = repo.rotate(channel.id, "rss");
    expect((await handleFeedRequest(req(`/rss/${rssToken}`), rssToken, ctx)).status).toBe(404);
    expect((await handleFeedRequest(req(`/rss/${fresh}`), fresh, ctx)).status).toBe(200);
  });

  it("returns 404 when the channel is deactivated", async () => {
    const { rssToken, channel } = setupChannel();
    repo.channels.find((c) => c.id === channel.id)!.published = false;
    expect((await handleFeedRequest(req(`/rss/${rssToken}`), rssToken, ctx)).status).toBe(404);
  });

  it("rate limits repeated invalid tokens", async () => {
    invalidTokenBudget = 3;
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const token = generateToken();
      statuses.push((await handleFeedRequest(req(`/rss/${token}`), token, ctx)).status);
    }
    expect(statuses).toEqual([404, 404, 404, 429, 429]);
  });

  it("supports HEAD", async () => {
    const { rssToken } = setupChannel();
    const res = await handleFeedRequest(req(`/rss/${rssToken}`, { method: "HEAD" }), rssToken, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).not.toBeNull();
    expect(await res.text()).toBe("");
  });
});

describe("audio enclosure endpoint", () => {
  it("streams the full file with correct headers", async () => {
    const { rssToken, published, audio } = setupChannel();
    const res = await handleAudioRequest(req("/audio"), published.guid, `${rssToken}.mp3`, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("content-length")).toBe("1000");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("cache-control")).toContain("private");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(audio);
  });

  it("serves byte ranges with 206 Partial Content", async () => {
    const { rssToken, published, audio } = setupChannel();
    const res = await handleAudioRequest(
      req("/audio", { headers: { Range: "bytes=100-199" } }),
      published.guid,
      rssToken,
      ctx,
    );
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 100-199/1000");
    expect(res.headers.get("content-length")).toBe("100");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(audio.slice(100, 200));
    expect(storage.getCalls.at(-1)?.range).toEqual({ start: 100, end: 199 });
  });

  it("serves suffix and open-ended ranges", async () => {
    const { rssToken, published, audio } = setupChannel();
    const suffix = await handleAudioRequest(
      req("/audio", { headers: { Range: "bytes=-10" } }),
      published.guid,
      rssToken,
      ctx,
    );
    expect(suffix.headers.get("content-range")).toBe("bytes 990-999/1000");
    expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(audio.slice(990));
    const open = await handleAudioRequest(
      req("/audio", { headers: { Range: "bytes=0-" } }),
      published.guid,
      rssToken,
      ctx,
    );
    expect(open.status).toBe(206);
    expect(open.headers.get("content-length")).toBe("1000");
  });

  it("returns 416 for unsatisfiable ranges", async () => {
    const { rssToken, published } = setupChannel();
    const res = await handleAudioRequest(
      req("/audio", { headers: { Range: "bytes=5000-" } }),
      published.guid,
      rssToken,
      ctx,
    );
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */1000");
  });

  it("answers HEAD without reading the object", async () => {
    const { rssToken, published } = setupChannel();
    const res = await handleAudioRequest(req("/audio", { method: "HEAD" }), published.guid, rssToken, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("1000");
    expect(storage.getCalls).toHaveLength(0);
  });

  it("returns 304 for matching If-None-Match", async () => {
    const { rssToken, published } = setupChannel();
    const first = await handleAudioRequest(req("/audio"), published.guid, rssToken, ctx);
    const res = await handleAudioRequest(
      req("/audio", { headers: { "If-None-Match": first.headers.get("etag")! } }),
      published.guid,
      rssToken,
      ctx,
    );
    expect(res.status).toBe(304);
  });

  it("accepts the web token (used by the browser player)", async () => {
    const { webToken, published } = setupChannel();
    const res = await handleAudioRequest(req("/audio"), published.guid, `${webToken}.mp3`, ctx);
    expect(res.status).toBe(200);
  });

  it("never serves draft episodes", async () => {
    const { rssToken, draft } = setupChannel();
    expect((await handleAudioRequest(req("/audio"), draft.guid, rssToken, ctx)).status).toBe(404);
  });

  it("rejects episodes from another channel (IDOR)", async () => {
    const { published } = setupChannel();
    const other = repo.addChannel({ title: "Outro" });
    const res = await handleAudioRequest(req("/audio"), published.guid, other.rssToken, ctx);
    expect(res.status).toBe(404);
  });

  it("rejects revoked, unknown and malformed tokens and malformed GUIDs", async () => {
    const { channel, rssToken, published } = setupChannel();
    repo.rotate(channel.id, "rss");
    expect((await handleAudioRequest(req("/audio"), published.guid, rssToken, ctx)).status).toBe(404);
    expect((await handleAudioRequest(req("/audio"), published.guid, generateToken(), ctx)).status).toBe(404);
    expect((await handleAudioRequest(req("/audio"), published.guid, "nope", ctx)).status).toBe(404);
    expect((await handleAudioRequest(req("/audio"), "not-a-guid", rssToken, ctx)).status).toBe(404);
  });

  it("returns 404 when the stored object is missing", async () => {
    const { rssToken, published } = setupChannel();
    await storage.delete(published.audioStorageKey);
    expect((await handleAudioRequest(req("/audio"), published.guid, rssToken, ctx)).status).toBe(404);
  });

  it("redirects to a short-lived URL in redirect mode", async () => {
    const { rssToken, published } = setupChannel();
    const res = await handleAudioRequest(req("/audio"), published.guid, rssToken, {
      ...ctx,
      audioDeliveryMode: "redirect",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain(published.audioStorageKey);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("cover endpoint", () => {
  it("redirects to the default cover when there is none", async () => {
    const { rssToken } = setupChannel();
    const res = await handleCoverRequest(req("/cover"), `${rssToken}.png`, ctx);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${APP}/default-cover.png`);
  });

  it("serves the uploaded cover", async () => {
    const { channel, webToken } = repo.addChannel({
      coverImageKey: "covers/x/a.png",
      coverImageMimeType: "image/png",
    });
    storage.put("covers/x/a.png", new Uint8Array([1, 2, 3]), "image/png");
    const res = await handleCoverRequest(req("/cover"), webToken, ctx);
    expect(channel.coverImageKey).toBe("covers/x/a.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });

  it("rejects invalid tokens", async () => {
    expect((await handleCoverRequest(req("/cover"), generateToken(), ctx)).status).toBe(404);
  });
});

describe("public channel page data", () => {
  it("exposes only published episodes with web-token audio URLs and the RSS link", async () => {
    const { webToken, rssToken, published } = setupChannel();
    const view = await loadPublicChannelView(webToken, ctx);
    expect(view).not.toBeNull();
    expect(view!.episodes.map((e) => e.title)).toEqual(["Publicado"]);
    expect(view!.episodes[0]!.audioUrl).toBe(`/audio/${published.guid}/${webToken}.mp3`);
    expect(view!.coverUrl).toBe("/default-cover.png");
    expect(view!.feedUrl).toBe(`${APP}/rss/${rssToken}`);
    expect(JSON.stringify(view)).not.toMatch(/audio\/[0-9a-f-]+\/[0-9a-f-]+\.mp3"/); // no storage keys
  });

  it("does not accept the RSS token as a page token", async () => {
    const { rssToken } = setupChannel();
    expect(await loadPublicChannelView(rssToken, ctx)).toBeNull();
  });

  it("returns null after the web token is rotated", async () => {
    const { webToken, channel } = setupChannel();
    repo.rotate(channel.id, "web");
    expect(await loadPublicChannelView(webToken, ctx)).toBeNull();
  });
});
