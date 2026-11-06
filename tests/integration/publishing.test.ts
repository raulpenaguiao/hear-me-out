import { XMLParser, XMLValidator } from "fast-xml-parser";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashToken } from "@/lib/tokens";
import { handleAudioRequest, handleFeedRequest, loadPublicChannelView } from "@/server/public/handlers";
import { SupabasePublicRepository } from "@/server/public/supabase-repository";
import type { PublicContext } from "@/server/public/types";
import {
  createChannel,
  deleteChannel,
  getChannelLinks,
  listChannels,
  rotateChannelTokens,
} from "@/server/services/channels";
import type { PublisherContext } from "@/server/services/context";
import {
  createEpisode,
  deleteEpisode,
  getEpisode,
  setEpisodeStatus,
  updateEpisode,
} from "@/server/services/episodes";
import { ServiceError } from "@/server/services/errors";
import { completeUpload, createUpload } from "@/server/services/uploads";
import { MemoryStorage } from "@/server/storage/memory";
import { fakeMp3, makeWav } from "../helpers/audio";
import { TEST_SECRETS } from "../helpers/memory-repo";
import { admin, APP_URL, createTestUser, deleteTestUser, publisherContext, type TestUser } from "./setup";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  isArray: (n) => n === "item",
});

let alice: TestUser;
let bob: TestUser;
let storage: MemoryStorage;
let ctx: PublisherContext;
let bobCtx: PublisherContext;
let pub: PublicContext;

function tokenFrom(url: string): string {
  return url.split("/").at(-1)!;
}

async function feedItems(rssToken: string) {
  const res = await handleFeedRequest(new Request(`${APP_URL}/rss/${rssToken}`), rssToken, pub);
  if (res.status !== 200) return { status: res.status, items: [] as Array<Record<string, unknown>> };
  const xml = await res.text();
  expect(XMLValidator.validate(xml)).toBe(true);
  const doc = parser.parse(xml);
  return { status: res.status, items: (doc.rss.channel.item ?? []) as Array<Record<string, unknown>> };
}

/** Simulates the browser PUT to the presigned URL, then completes the upload. */
async function uploadAudio(
  context: PublisherContext,
  episodeId: string,
  data: Uint8Array,
  opts: { fileName?: string; contentType?: string; durationSeconds?: number; storedData?: Uint8Array } = {},
) {
  const created = await createUpload(context, {
    kind: "audio",
    episodeId,
    fileName: opts.fileName ?? "historia.wav",
    contentType: opts.contentType ?? "audio/wav",
    size: data.byteLength,
  });
  const key = created.url.replace("memory://upload/", "");
  storage.put(key, opts.storedData ?? data);
  return completeUpload(context, created.uploadId, { durationSeconds: opts.durationSeconds ?? 2 });
}

beforeAll(async () => {
  [alice, bob] = await Promise.all([createTestUser("pub-alice"), createTestUser("pub-bob")]);
  storage = new MemoryStorage();
  ctx = publisherContext(alice, storage);
  bobCtx = publisherContext(bob, storage);
  pub = {
    repo: new SupabasePublicRepository(admin),
    storage,
    secrets: TEST_SECRETS,
    appUrl: APP_URL,
    audioDeliveryMode: "proxy",
  };
});

afterAll(async () => {
  await Promise.all([deleteTestUser(alice), deleteTestUser(bob)]);
});

async function newChannel(context = ctx, title = "Peripécias") {
  return createChannel(context, {
    title,
    description: "Histórias & aventuras",
    authorName: null,
    category: "Society & Culture",
    explicit: false,
    published: true,
  });
}

describe("channels", () => {
  it("creates multiple channels with distinct secret links", async () => {
    const a = await newChannel(ctx, "Canal A");
    const b = await newChannel(ctx, "Canal B");
    const titles = (await listChannels(ctx)).map((c) => c.title);
    expect(titles).toEqual(expect.arrayContaining(["Canal A", "Canal B"]));
    const [la, lb] = await Promise.all([getChannelLinks(ctx, a.id), getChannelLinks(ctx, b.id)]);
    expect(la.webUrl).toMatch(new RegExp(`^${APP_URL}/c/[A-Za-z0-9_-]{43}$`));
    expect(la.rssUrl).toMatch(new RegExp(`^${APP_URL}/rss/[A-Za-z0-9_-]{43}$`));
    expect(new Set([la.webUrl, la.rssUrl, lb.webUrl, lb.rssUrl].map(tokenFrom)).size).toBe(4);
  });

  it("stores only hashes and ciphertexts, never plaintext tokens", async () => {
    const { id } = await newChannel();
    const links = await getChannelLinks(ctx, id);
    const { data } = await admin.from("channels").select("*").eq("id", id).single();
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain(tokenFrom(links.webUrl));
    expect(serialized).not.toContain(tokenFrom(links.rssUrl));
    expect(data!.web_token_hash).toBe(hashToken(tokenFrom(links.webUrl), "web", TEST_SECRETS.hashSecret));
  });

  it("does not reveal other users' channel links", async () => {
    const { id } = await newChannel();
    await expect(getChannelLinks(bobCtx, id)).rejects.toMatchObject({ code: "not_found" });
    await expect(rotateChannelTokens(bobCtx, id, "both")).rejects.toMatchObject({ code: "not_found" });
    await expect(deleteChannel(bobCtx, id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("episode publishing and RSS", () => {
  it("publishes, edits, unpublishes and deletes episodes with immediate feed updates", async () => {
    const { id: channelId } = await newChannel();
    const links = await getChannelLinks(ctx, channelId);
    const rssToken = tokenFrom(links.rssUrl);

    expect((await feedItems(rssToken)).items).toHaveLength(0);

    const { id: episodeId } = await createEpisode(ctx, {
      channelId,
      title: "Primeira história",
      description: "Era uma vez <um> & dois",
    });
    const wav = makeWav(1);
    const completed = await uploadAudio(ctx, episodeId, wav, { durationSeconds: 61 });
    expect(completed).toMatchObject({ kind: "audio", sizeBytes: wav.byteLength, mimeType: "audio/wav" });

    // Drafts never reach the feed.
    expect((await feedItems(rssToken)).items).toHaveLength(0);

    await setEpisodeStatus(ctx, episodeId, "published");
    const episode = await getEpisode(ctx, episodeId);
    expect(episode.publishedAt).not.toBeNull();

    let { items } = await feedItems(rssToken);
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.title).toBe("Primeira história");
    expect(item.description).toBe("Era uma vez <um> & dois");
    expect(item["itunes:duration"]).toBe("00:01:01");
    const enclosure = item.enclosure as Record<string, string>;
    expect(enclosure["@_url"]).toBe(`${APP_URL}/audio/${episode.guid}/${rssToken}.wav`);
    expect(enclosure["@_type"]).toBe("audio/wav");
    expect(enclosure["@_length"]).toBe(String(wav.byteLength));
    const guid = (item.guid as Record<string, string>)["#text"];

    // Edits keep the GUID stable.
    await updateEpisode(ctx, episodeId, { title: "Título novo", description: "" });
    ({ items } = await feedItems(rssToken));
    expect(items[0]!.title).toBe("Título novo");
    expect((items[0]!.guid as Record<string, string>)["#text"]).toBe(guid);

    // The enclosure streams with range support.
    const range = await handleAudioRequest(
      new Request("https://x/audio", { headers: { Range: "bytes=0-43" } }),
      episode.guid,
      `${rssToken}.wav`,
      pub,
    );
    expect(range.status).toBe(206);
    expect(new Uint8Array(await range.arrayBuffer())).toEqual(wav.slice(0, 44));

    // The public page lists it.
    const view = await loadPublicChannelView(tokenFrom(links.webUrl), pub);
    expect(view?.episodes.map((e) => e.title)).toEqual(["Título novo"]);

    // Unpublishing removes it from the feed and blocks audio.
    await setEpisodeStatus(ctx, episodeId, "draft");
    expect((await feedItems(rssToken)).items).toHaveLength(0);
    const blocked = await handleAudioRequest(new Request("https://x/audio"), episode.guid, rssToken, pub);
    expect(blocked.status).toBe(404);

    // Deleting removes the row and the stored object.
    await setEpisodeStatus(ctx, episodeId, "published");
    const key = [...storage.objects.keys()].find((k) => k.includes(episodeId))!;
    await deleteEpisode(ctx, episodeId);
    expect(storage.objects.has(key)).toBe(false);
    expect((await feedItems(rssToken)).items).toHaveLength(0);
  });

  it("refuses to publish an episode without audio", async () => {
    const { id: channelId } = await newChannel();
    const { id } = await createEpisode(ctx, { channelId, title: "Sem áudio", description: "" });
    await expect(setEpisodeStatus(ctx, id, "published")).rejects.toBeInstanceOf(ServiceError);
  });

  it("rejects episode creation in someone else's channel", async () => {
    const { id: channelId } = await newChannel();
    await expect(
      createEpisode(bobCtx, { channelId, title: "intruso", description: "" }),
    ).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("token rotation", () => {
  it("invalidates old links immediately and keeps episodes reachable via new ones", async () => {
    const { id: channelId } = await newChannel();
    const before = await getChannelLinks(ctx, channelId);
    const { id: episodeId } = await createEpisode(ctx, { channelId, title: "Rodar", description: "" });
    await uploadAudio(ctx, episodeId, makeWav(0.5));
    await setEpisodeStatus(ctx, episodeId, "published");
    const { guid } = await getEpisode(ctx, episodeId);

    const oldRss = tokenFrom(before.rssUrl);
    const oldWeb = tokenFrom(before.webUrl);
    expect((await feedItems(oldRss)).status).toBe(200);

    const after = await rotateChannelTokens(ctx, channelId, "rss");
    expect(after.webUrl).toBe(before.webUrl);
    expect(after.rssUrl).not.toBe(before.rssUrl);
    expect((await feedItems(oldRss)).status).toBe(404);
    expect((await feedItems(tokenFrom(after.rssUrl))).items).toHaveLength(1);
    expect((await handleAudioRequest(new Request("https://x"), guid, oldRss, pub)).status).toBe(404);
    expect(
      (await handleAudioRequest(new Request("https://x"), guid, tokenFrom(after.rssUrl), pub)).status,
    ).toBe(200);

    const both = await rotateChannelTokens(ctx, channelId, "both");
    expect(await loadPublicChannelView(oldWeb, pub)).toBeNull();
    expect((await handleAudioRequest(new Request("https://x"), guid, oldWeb, pub)).status).toBe(404);
    expect(await loadPublicChannelView(tokenFrom(both.webUrl), pub)).not.toBeNull();
  });

  it("hides deactivated channels from listeners", async () => {
    const { id: channelId } = await newChannel();
    const links = await getChannelLinks(ctx, channelId);
    await alice.client.from("channels").update({ published: false }).eq("id", channelId);
    expect((await feedItems(tokenFrom(links.rssUrl))).status).toBe(404);
    expect(await loadPublicChannelView(tokenFrom(links.webUrl), pub)).toBeNull();
  });
});

describe("upload validation", () => {
  let episodeId: string;
  beforeAll(async () => {
    const { id: channelId } = await newChannel();
    ({ id: episodeId } = await createEpisode(ctx, { channelId, title: "Uploads", description: "" }));
  });

  it("rejects unsupported types and oversized files before issuing a URL", async () => {
    await expect(
      createUpload(ctx, {
        kind: "audio",
        episodeId,
        fileName: "x.exe",
        contentType: "application/x-msdownload",
        size: 10,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      createUpload(ctx, {
        kind: "audio",
        episodeId,
        fileName: "x.mp3",
        contentType: "audio/mpeg",
        size: 10 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("rejects uploads to other users' episodes", async () => {
    await expect(
      createUpload(bobCtx, {
        kind: "audio",
        episodeId,
        fileName: "x.mp3",
        contentType: "audio/mpeg",
        size: 10,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects content that does not match the declared type", async () => {
    const html = new TextEncoder().encode(
      "<!DOCTYPE html><html><body>not audio</body></html>".padEnd(200, " "),
    );
    await expect(
      uploadAudio(ctx, episodeId, html, { fileName: "x.mp3", contentType: "audio/mpeg" }),
    ).rejects.toMatchObject({ code: "upload_invalid" });
    // MP3 bytes declared as WAV are rejected too.
    await expect(
      uploadAudio(ctx, episodeId, fakeMp3(), { fileName: "x.wav", contentType: "audio/wav" }),
    ).rejects.toMatchObject({ code: "upload_invalid" });
  });

  it("rejects objects whose size differs from the declared size", async () => {
    const wav = makeWav(0.5);
    await expect(uploadAudio(ctx, episodeId, wav, { storedData: makeWav(0.6) })).rejects.toMatchObject({
      code: "upload_invalid",
    });
  });

  it("rejects completion of a missing object and double completion", async () => {
    const created = await createUpload(ctx, {
      kind: "audio",
      episodeId,
      fileName: "x.wav",
      contentType: "audio/wav",
      size: 100,
    });
    await expect(completeUpload(ctx, created.uploadId, { durationSeconds: 1 })).rejects.toMatchObject({
      code: "upload_invalid",
    });
    const wav = makeWav(0.2);
    const ok = await createUpload(ctx, {
      kind: "audio",
      episodeId,
      fileName: "x.wav",
      contentType: "audio/wav",
      size: wav.byteLength,
    });
    storage.put(ok.url.replace("memory://upload/", ""), wav);
    await completeUpload(ctx, ok.uploadId, { durationSeconds: 1 });
    await expect(completeUpload(ctx, ok.uploadId, { durationSeconds: 1 })).rejects.toMatchObject({
      code: "not_found",
    });
    // Another user cannot complete someone else's upload.
    await expect(completeUpload(bobCtx, created.uploadId, { durationSeconds: 1 })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("rejects audio longer than the configured limit", async () => {
    await expect(
      uploadAudio(ctx, episodeId, makeWav(0.2), { durationSeconds: 10_000 }),
    ).rejects.toMatchObject({
      code: "upload_invalid",
    });
  });

  it("replaces previous audio and deletes the old object", async () => {
    await uploadAudio(ctx, episodeId, makeWav(0.2));
    const first = (await admin.from("episodes").select("audio_storage_key").eq("id", episodeId).single())
      .data!.audio_storage_key!;
    await uploadAudio(ctx, episodeId, makeWav(0.3));
    const second = (await admin.from("episodes").select("audio_storage_key").eq("id", episodeId).single())
      .data!.audio_storage_key!;
    expect(second).not.toBe(first);
    expect(storage.objects.has(first)).toBe(false);
    expect(storage.objects.has(second)).toBe(true);
  });
});

describe("channel deletion", () => {
  it("deletes episodes and stored audio", async () => {
    const { id: channelId } = await newChannel();
    const links = await getChannelLinks(ctx, channelId);
    const { id: episodeId } = await createEpisode(ctx, { channelId, title: "Adeus", description: "" });
    await uploadAudio(ctx, episodeId, makeWav(0.2));
    const key = (await admin.from("episodes").select("audio_storage_key").eq("id", episodeId).single()).data!
      .audio_storage_key!;
    await deleteChannel(ctx, channelId);
    expect(storage.objects.has(key)).toBe(false);
    expect((await admin.from("episodes").select("id").eq("id", episodeId)).data).toEqual([]);
    expect((await feedItems(tokenFrom(links.rssUrl))).status).toBe(404);
  });
});
