/**
 * Local development seed: creates a demo publisher with a channel and a few
 * episodes (generated tones) using the real service layer and the local
 * storage adapter.
 *
 * Usage: npm run db:seed            (reads .env.local)
 * Requires STORAGE_DRIVER=local. Never run against production.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createRateLimiter } from "@/server/rate-limit";
import { createChannel, getChannelLinks } from "@/server/services/channels";
import type { PublisherContext } from "@/server/services/context";
import { createEpisode, setEpisodeStatus } from "@/server/services/episodes";
import { completeUpload, createUpload } from "@/server/services/uploads";
import { LocalStorage } from "@/server/storage/local";
import { makeWav } from "../tests/helpers/audio";

const DEMO_EMAIL = process.env.SEED_EMAIL ?? "demo@ouveisto.local";
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "ouve-isto-demo";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (run npm run env:local first)`);
  return value;
}

async function main() {
  if ((process.env.STORAGE_DRIVER ?? "local") !== "local") {
    throw new Error("The seed script only supports STORAGE_DRIVER=local.");
  }
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) {
    throw new Error("Refusing to seed a non-local Supabase project.");
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient<Database>(url, env("SUPABASE_SERVICE_ROLE_KEY"), options);

  const existing = await admin.auth.admin.listUsers();
  const old = existing.data.users.find((u) => u.email === DEMO_EMAIL);
  if (old) await admin.auth.admin.deleteUser(old.id);

  const created = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: "Demo" },
  });
  if (created.error) throw created.error;

  const db = createClient<Database>(url, env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), options);
  const signIn = await db.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  if (signIn.error) throw signIn.error;

  const secrets = { hashSecret: env("TOKEN_HASH_SECRET"), encryptionKey: env("TOKEN_ENCRYPTION_KEY") };
  const storage = new LocalStorage(
    process.env.LOCAL_STORAGE_DIR ?? ".data/storage",
    `${secrets.hashSecret}:local-storage`,
    appUrl,
  );
  const ctx: PublisherContext = {
    userId: created.data.user.id,
    db,
    admin,
    storage,
    secrets,
    appUrl,
    limits: {
      audioMaxBytes: 200 * 1024 * 1024,
      audioMaxDurationSeconds: 3 * 3600,
      coverMaxBytes: 5 * 1024 * 1024,
      uploadUrlTtlSeconds: 900,
    },
    rateLimit: createRateLimiter({ admin, secret: secrets.hashSecret, enabled: false }),
  };

  const { id: channelId } = await createChannel(ctx, {
    title: "Peripécias",
    description: "Histórias, desabafos e outras aventuras do dia a dia.",
    authorName: "Demo",
    category: "Society & Culture",
    explicit: false,
    published: true,
  });

  const episodes = [
    {
      title: "O dia em que perdi o comboio",
      description: "E ganhei um amigo.",
      seconds: 4,
      freq: 330,
      publish: true,
    },
    {
      title: "A receita da avó",
      description: "Arroz doce & segredos.",
      seconds: 6,
      freq: 440,
      publish: true,
    },
    { title: "Ainda em rascunho", description: "", seconds: 3, freq: 550, publish: false },
  ];

  for (const ep of episodes) {
    const { id } = await createEpisode(ctx, { channelId, title: ep.title, description: ep.description });
    const wav = makeWav(ep.seconds, 16000, ep.freq);
    const upload = await createUpload(ctx, {
      kind: "audio",
      episodeId: id,
      fileName: "seed.wav",
      contentType: "audio/wav",
      size: wav.byteLength,
    });
    const key = new URL(upload.url).searchParams.get("key")!;
    await storage.writeFromStream(key, new Blob([wav.slice()]).stream(), wav.byteLength);
    await completeUpload(ctx, upload.uploadId, { durationSeconds: ep.seconds });
    if (ep.publish) await setEpisodeStatus(ctx, id, "published");
  }

  const links = await getChannelLinks(ctx, channelId);
  console.log("Seed complete.");
  console.log(`  Login:    ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  Web page: ${links.webUrl}`);
  console.log(`  RSS feed: ${links.rssUrl}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
