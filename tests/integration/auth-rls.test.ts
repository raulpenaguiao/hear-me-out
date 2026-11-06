import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { issueToken } from "@/lib/tokens";
import { createChannel } from "@/server/services/channels";
import { createEpisode } from "@/server/services/episodes";
import { TEST_SECRETS } from "../helpers/memory-repo";
import {
  admin,
  anonClient,
  createTestUser,
  deleteTestUser,
  publisherContext,
  uniqueEmail,
  type TestUser,
} from "./setup";

describe("authentication", () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created) await admin.auth.admin.deleteUser(id);
  });

  it("signs up, creates a profile, signs in and out", async () => {
    const client = anonClient();
    const email = uniqueEmail("signup");
    const signUp = await client.auth.signUp({
      email,
      password: "a-long-enough-password",
      options: { data: { display_name: "Ana" } },
    });
    expect(signUp.error).toBeNull();
    const userId = signUp.data.user!.id;
    created.push(userId);

    const { data: profile } = await admin.from("profiles").select("*").eq("id", userId).single();
    expect(profile).toMatchObject({ email, display_name: "Ana" });

    const signOut = await client.auth.signOut();
    expect(signOut.error).toBeNull();

    const wrong = await client.auth.signInWithPassword({ email, password: "wrong-password" });
    expect(wrong.error).not.toBeNull();

    const ok = await client.auth.signInWithPassword({ email, password: "a-long-enough-password" });
    expect(ok.error).toBeNull();
    expect(ok.data.session?.access_token).toBeTruthy();
  });

  it("rejects short passwords", async () => {
    const res = await anonClient().auth.signUp({ email: uniqueEmail("short"), password: "1234" });
    expect(res.error).not.toBeNull();
  });
});

describe("row level security", () => {
  let alice: TestUser;
  let bob: TestUser;
  let aliceChannelId: string;
  let aliceEpisodeId: string;

  beforeAll(async () => {
    [alice, bob] = await Promise.all([createTestUser("alice"), createTestUser("bob")]);
    const ctx = publisherContext(alice);
    ({ id: aliceChannelId } = await createChannel(ctx, {
      title: "Canal da Alice",
      description: "",
      authorName: null,
      category: "Society & Culture",
      explicit: false,
      published: true,
    }));
    ({ id: aliceEpisodeId } = await createEpisode(ctx, {
      channelId: aliceChannelId,
      title: "Rascunho",
      description: "",
    }));
  });

  afterAll(async () => {
    await Promise.all([deleteTestUser(alice), deleteTestUser(bob)]);
  });

  it("lets owners read their own channels and episodes", async () => {
    const channels = await alice.client.from("channels").select("id, title");
    expect(channels.data).toEqual([{ id: aliceChannelId, title: "Canal da Alice" }]);
    const episodes = await alice.client.from("episodes").select("id");
    expect(episodes.data).toEqual([{ id: aliceEpisodeId }]);
  });

  it("hides other users' data", async () => {
    expect((await bob.client.from("channels").select("id")).data).toEqual([]);
    expect((await bob.client.from("episodes").select("id")).data).toEqual([]);
    expect((await bob.client.from("profiles").select("id")).data).toEqual([{ id: bob.id }]);
  });

  it("prevents modifying or deleting other users' rows", async () => {
    const update = await bob.client.from("channels").update({ title: "hacked" }).eq("id", aliceChannelId).select();
    expect(update.data ?? []).toEqual([]);
    const del = await bob.client.from("episodes").delete().eq("id", aliceEpisodeId).select();
    expect(del.data ?? []).toEqual([]);
    const { data } = await admin.from("channels").select("title").eq("id", aliceChannelId).single();
    expect(data?.title).toBe("Canal da Alice");
  });

  it("prevents inserting episodes into other users' channels", async () => {
    const res = await bob.client
      .from("episodes")
      .insert({ channel_id: aliceChannelId, title: "intruso" })
      .select();
    expect(res.error).not.toBeNull();
  });

  it("does not expose token hashes or ciphertexts to the authenticated role", async () => {
    for (const column of ["web_token_hash", "rss_token_hash", "web_token_ciphertext", "rss_token_ciphertext"]) {
      const res = await alice.client.from("channels").select(column).eq("id", aliceChannelId);
      expect(res.error, column).not.toBeNull();
    }
  });

  it("does not let publishers write protected columns directly", async () => {
    const audio = await alice.client
      .from("episodes")
      .update({ audio_storage_key: "audio/someone-else/secret.mp3" } as never)
      .eq("id", aliceEpisodeId);
    expect(audio.error).not.toBeNull();

    const token = issueToken("web", TEST_SECRETS);
    const hash = await alice.client
      .from("channels")
      .update({ web_token_hash: token.hash } as never)
      .eq("id", aliceChannelId);
    expect(hash.error).not.toBeNull();

    const insert = await alice.client.from("channels").insert({
      owner_id: alice.id,
      title: "direto",
      web_token_hash: token.hash,
      rss_token_hash: issueToken("rss", TEST_SECRETS).hash,
      web_token_ciphertext: token.ciphertext,
      rss_token_ciphertext: "x",
    });
    expect(insert.error).not.toBeNull();
  });

  it("does not allow publishing an episode without audio", async () => {
    const res = await alice.client.from("episodes").update({ status: "published" }).eq("id", aliceEpisodeId);
    expect(res.error?.code).toBe("23514");
  });

  it("gives anonymous clients no access at all", async () => {
    const anon = anonClient();
    for (const table of ["profiles", "channels", "episodes", "uploads", "rate_limits"] as const) {
      const res = await anon.from(table).select("*");
      // Either a permission error or an empty result; never data.
      expect(res.data ?? [], table).toEqual([]);
    }
    const rpc = await anon.rpc("rate_limit_hit", { p_key: "x", p_window_seconds: 60, p_max_hits: 1 });
    expect(rpc.error).not.toBeNull();
  });

  it("does not let authenticated users call privileged functions", async () => {
    const res = await alice.client.rpc("complete_upload", {
      p_upload_id: crypto.randomUUID(),
      p_owner_id: alice.id,
      p_mime_type: "audio/mpeg",
      p_size_bytes: 1,
      p_duration_seconds: 1,
    });
    expect(res.error).not.toBeNull();
  });

  it("keeps episode GUIDs immutable", async () => {
    const res = await admin.from("episodes").update({ guid: crypto.randomUUID() }).eq("id", aliceEpisodeId);
    expect(res.error).not.toBeNull();
  });
});

describe("database rate limiter", () => {
  it("counts hits within a window", async () => {
    const key = `test:${crypto.randomUUID()}`;
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const { data } = await admin.rpc("rate_limit_hit", { p_key: key, p_window_seconds: 600, p_max_hits: 3 });
      results.push(data === true);
    }
    expect(results).toEqual([true, true, true, false]);
  });
});
