# Ouve Isto

**Ouve Isto** ("listen to this") is a private audio publishing platform — a lightweight, personal, private
podcast. Publishers record or upload short audio stories, anecdotes and thoughts, and share them through a
secret web page and a private RSS feed. Listeners need no account: whoever has the link can listen in the
browser or subscribe in any podcast app that accepts custom RSS feeds.

> Publishing requires authentication. Listening does not. Access is granted by possession of a secret URL
> (a bearer link). Links can be rotated at any time to revoke access. Secret links are **not** DRM and do
> not provide absolute confidentiality — see [docs/SECURITY.md](docs/SECURITY.md).

The UI is in Portuguese (Portugal). Code, schema and technical documentation are in English.

## Features

- **Accounts for publishers**: e-mail/password sign-up, login, logout, password reset, persistent sessions.
- **Channels**: create multiple channels with title, description, author, category, explicit flag, cover
  image; activate/deactivate; delete with confirmation.
- **Secret links**: each channel has a web link (`/c/<token>`) and an RSS link (`/rss/<token>`). Copy them,
  or rotate either/both to invalidate old links immediately.
- **Recording in the browser** (MediaRecorder): start, pause/resume, stop, timer, live level meter,
  preview before publishing. Falls back to file upload when recording is unavailable.
- **Uploads** of MP3, M4A, AAC, WAV, WebM/Opus and Ogg/Opus straight to private Cloudflare R2 via short-lived
  presigned URLs, with progress, size/duration limits and server-side content verification.
- **Episodes**: draft → publish → unpublish → delete; edit title/description; replace audio; stable GUIDs.
- **Private RSS 2.0 feed** with iTunes tags, correct enclosures (type, length), RFC 822 dates, ETags.
- **Stable enclosure URLs** (`/audio/<guid>/<token>.<ext>`) that stream from private storage with HTTP
  Range, HEAD and exact `Content-Length` — safe for podcast apps that download later.
- **Public listener page**: responsive, accessible, `noindex`, no third-party requests, RSS instructions.
- **Security**: RLS + column privileges, hashed + encrypted tokens, rate limiting, CSP and security headers,
  `Referrer-Policy: no-referrer`, input validation with Zod, no tracking.

Deliberately out of scope: likes, comments, followers, analytics, monetisation, public directories.

## Architecture at a glance

```
Browser (publisher) ──► Next.js on Vercel ──► Supabase (Auth + Postgres with RLS)
      │                       │
      │ presigned PUT         └──► Cloudflare R2 (private bucket) ◄── stream / range
      └──────────────────────────► R2
Podcast app / listener ──► /rss/<token>, /c/<token>, /audio/<guid>/<token>.mp3 ──► Next.js
```

- **Next.js 16 (App Router, TypeScript strict, Tailwind CSS 4)** renders the dashboard and the public page,
  and exposes route handlers for feeds, uploads and audio.
- **Supabase**: Auth for publishers; Postgres holds profiles, channels, episodes, pending uploads and rate
  limit counters. RLS restricts publishers to their own rows; listeners never query the database directly.
- **Cloudflare R2** stores audio and cover images privately. The browser uploads directly with a
  presigned PUT; the app streams audio back with Range support (or redirects to a short-lived presigned GET).

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · RSS: [docs/RSS.md](docs/RSS.md) · Security:
[docs/SECURITY.md](docs/SECURITY.md) · Deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Tech stack

| Area       | Choice                                                                   |
| ---------- | ------------------------------------------------------------------------ |
| Framework  | Next.js 16.4 (App Router + one Pages API route), React 19, TypeScript 5  |
| Styling    | Tailwind CSS 4, shadcn-style components (cva + tailwind-merge), Lucide   |
| Auth & DB  | Supabase Auth, PostgreSQL 17, RLS, Supabase CLI migrations               |
| Storage    | Cloudflare R2 via `@aws-sdk/client-s3` (local filesystem adapter in dev) |
| Validation | Zod 4                                                                    |
| Tests      | Vitest (unit + integration), Playwright (E2E)                            |
| CI/CD      | GitHub Actions → Vercel                                                  |

## Repository layout

```
src/
  app/                  App Router pages and route handlers
    (auth)/             /entrar, /registar, /recuperar-palavra-passe + server actions
    painel/             publisher dashboard (protected)
    c/[token]/          public channel page
    rss/[token]/        RSS feed
    cover/[token]/      channel cover image
    api/publisher/...   JSON API used by the recorder/uploader (episodes, uploads, previews)
    api/dev-storage/    presigned-upload receiver for the local storage adapter (dev only)
  pages/api/public/audio/[guid]/[token].ts   audio enclosure endpoint (rewritten from /audio/...)
  components/           UI components (recorder, uploader, forms, ui primitives)
  lib/                  pure modules: tokens, RSS/XML, audio formats, ranges, validation, env
  server/               server-only code: services, public handlers, storage adapters, Supabase clients
  proxy.ts              session refresh + dashboard guard (Next 16 "proxy", formerly middleware)
supabase/
  migrations/           SQL schema, RLS policies, functions
  config.toml           local Supabase configuration
tests/
  unit/ integration/ e2e/ helpers/
scripts/                local env generator, seed, default cover renderer
docs/                   architecture, deployment, RSS, security
```

## Local development

Prerequisites: **Node.js ≥ 22.12**, **Docker** (for the local Supabase stack).

```bash
npm install
```

```bash
npm run db:start      # starts Postgres, Auth, REST and Mailpit locally and applies migrations
```

```bash
npm run env:local     # writes .env.local with the local Supabase keys and fresh secrets
```

```bash
npm run db:seed       # optional: demo user demo@ouveisto.local / ouve-isto-demo with a channel
```

```bash
npm run dev           # http://localhost:3000
```

Locally the app uses `STORAGE_DRIVER=local`: audio is stored under `.data/storage` and presigned uploads are
emulated by `/api/dev-storage/upload`. No Cloudflare account is needed. E-mail confirmation is disabled in
the local Supabase config; password-reset e-mails can be read in Mailpit at http://127.0.0.1:54324.

To test against a real R2 bucket locally, set `STORAGE_DRIVER=r2` and the `R2_*` variables (and add
`http://localhost:3000` to the bucket's CORS allowed origins).

### Environment variables

See [`.env.example`](.env.example) for the full, commented list. Summary:

| Variable                                                                     | Required     | Purpose                                             |
| ---------------------------------------------------------------------------- | ------------ | --------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                                                        | prod         | Public origin used in links, RSS and enclosures     |
| `NEXT_PUBLIC_SUPABASE_URL`                                                   | yes          | Supabase project URL                                |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                                              | yes          | Supabase anon/publishable key                       |
| `SUPABASE_SERVICE_ROLE_KEY`                                                  | yes          | Service role key (server only)                      |
| `TOKEN_HASH_SECRET`                                                          | yes          | HMAC key for token hashes (≥ 32 chars)              |
| `TOKEN_ENCRYPTION_KEY`                                                       | yes          | 32-byte base64 AES key for stored token ciphertexts |
| `STORAGE_DRIVER`                                                             | yes          | `r2` (production) or `local` (development/tests)    |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`     | with `r2`    | Cloudflare R2 credentials and bucket                |
| `AUDIO_DELIVERY_MODE`                                                        | no (`proxy`) | `proxy` streams via the app; `redirect` 302s to R2  |
| `AUDIO_MAX_UPLOAD_MB` / `AUDIO_MAX_DURATION_MINUTES` / `COVER_MAX_UPLOAD_MB` | no           | Upload limits (200 / 180 / 5)                       |
| `RATE_LIMIT_ENABLED`, `TRUST_PROXY_HEADERS`                                  | no (`true`)  | Rate limiting controls                              |

### Database migrations

Migrations live in `supabase/migrations`. Locally they are applied by `npm run db:start` and re-applied from
scratch with `npm run db:reset`. Create a new one with `npx supabase migration new <name>` and regenerate
types with `npm run db:types`. In production, CI runs `supabase db push` before deploying
(see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).

## Tests

```bash
npm run lint && npm run format:check && npm run typecheck
```

```bash
npm run test:unit          # no external services needed
```

```bash
npm run test:integration   # needs the local Supabase stack and .env.local
```

```bash
npm run test:e2e           # builds the app and runs Playwright against local Supabase + local storage
```

- **Unit** (118 tests): token generation/hashing/encryption, XML escaping, RSS structure, audio format
  sniffing, range parsing, validation, and the public feed/audio/cover handlers (authorization, revoked
  tokens, drafts, IDOR, Range/HEAD/304/416, rate limiting) with in-memory doubles.
- **Integration** (29 tests + 6 opt-in): real Supabase — auth, RLS isolation, column privileges, privileged functions,
  channel/episode lifecycle, feeds, token rotation, audio authorization, upload verification, rate limiter.
  The R2 adapter tests run when `S3_TEST_ENDPOINT` points at an S3-compatible server (MinIO, moto).
- **E2E** (15 tests): registration, login/logout, channel creation, file upload, in-browser recording (fake
  microphone), publishing, drafts, anonymous listening with range requests, RSS, invalid tokens, token
  rotation, unpublishing, and mobile layout checks.

Validate a real feed with external tools as described in [docs/RSS.md](docs/RSS.md#validating-feeds).

## Deployment

Production runs on **Vercel** (app), **Supabase** (auth + database) and **Cloudflare R2** (audio). GitHub
Actions runs every check on pull requests; on `main` it applies database migrations and deploys to Vercel
production only after all checks pass. Preview deployments for branches come from the Vercel GitHub
integration. Step-by-step instructions: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Known limitations

- **Bearer links**: anyone with a link can listen and forward it; downloaded files cannot be recalled.
  Rotation stops future access only. Podcast apps and hosting providers may log feed URLs.
- **Podcast app support** for private feeds varies. Apple Podcasts, Pocket Casts, Overcast, AntennaPod and
  Podcast Addict accept custom RSS URLs; **Spotify and YouTube Music do not**.
- **WebM/Opus recordings** (Chrome/Firefox/Android) play in browsers and many Android apps but **not in Apple
  Podcasts**. Safari/iOS records M4A (AAC), which is broadly compatible. There is no server-side transcoding.
- **Durations** are measured in the browser (recorder timer or file metadata), not by the server.
- **Uploads**: the presigned PUT signs the declared `Content-Type` and `Content-Length`, and the server
  re-verifies size and content after upload (deleting mismatches). The R2 adapter was tested against an
  S3-compatible emulator (moto), not against Cloudflare R2 itself. Abandoned uploads (never completed) may
  leave orphaned objects; see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#r2-lifecycle-optional).
- **Streaming via Vercel Functions** is subject to function duration limits and bandwidth costs; for very large
  files or heavy traffic use `AUDIO_DELIVERY_MODE=redirect`.
- **Rate limiting** is per IP/user in Postgres (fixed windows); it is a speed bump, not DDoS protection.
- The CSP allows `'unsafe-inline'` scripts (required by Next.js without nonces).
- Dev-only tooling (`typescript-eslint` → `minimatch`) has moderate `npm audit` advisories; production
  dependencies report none.
