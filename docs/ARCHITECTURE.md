# Architecture

## Overview

Ouve Isto is a single Next.js application with three external services:

| Component         | Responsibility                                                               |
| ----------------- | ---------------------------------------------------------------------------- |
| Next.js (Vercel)  | UI (dashboard + public page), server actions, JSON API, RSS, audio streaming |
| Supabase Auth     | Publisher accounts and sessions (cookies via `@supabase/ssr`)                |
| Supabase Postgres | Profiles, channels, episodes, pending uploads, rate-limit counters (RLS)     |
| Cloudflare R2     | Private object storage for audio and cover images (S3 API)                   |

The browser never talks to Supabase directly. It talks to the Next.js server, plus R2 for a single presigned
PUT per upload. All authorization decisions are made on the server.

```
                  ┌──────────────── Next.js ────────────────┐
 Publisher ──────►│ proxy.ts (session refresh, /painel guard)│
  (cookies)       │ Server Components + Server Actions       │──► Supabase (user JWT, RLS)
                  │ /api/publisher/* (JSON, same-origin)     │──► Supabase (service role, after checks)
                  │                                          │──► R2 (presign, head, read prefix, delete)
 Listener ───────►│ /c/:token   /rss/:token   /cover/:token   │──► Supabase (service role, token lookup)
 Podcast app ────►│ /audio/:guid/:token  (Pages API route)    │──► R2 (ranged GET, streamed)
                  └──────────────────────────────────────────┘
 Publisher browser ──── presigned PUT ────────────────────────────► R2
```

## Code organisation

- `src/lib/*` — pure, framework-free modules (unit tested): `tokens`, `xml`, `rss`, `audio-formats`,
  `http-range`, `validation`, `format`, `env`.
- `src/server/services/*` — publisher operations (`channels`, `episodes`, `uploads`). Each takes a
  `PublisherContext` (`userId`, user-scoped `db`, service-role `admin`, `storage`, secrets, limits, rate
  limiter), so they are testable against a real database with fake storage.
- `src/server/public/*` — listener-facing logic: `handlers.ts` implements feed, audio, cover and page-data
  loading as pure `Request → Response` functions over a `PublicRepository` and `ObjectStorage`.
  `supabase-repository.ts` is the production repository; tests use an in-memory one.
- `src/server/storage/*` — `ObjectStorage` interface with `R2Storage`, `LocalStorage` (dev/CI) and
  `MemoryStorage` (tests).
- `src/app/*` — thin route handlers, pages and server actions wiring the above together.

## Database schema

Defined in [`supabase/migrations`](../supabase/migrations).

```
auth.users 1─1 profiles 1─* channels 1─* episodes
                    │            └──* uploads (pending/complete)
                    └──* uploads
rate_limits (bucket_key, window_start) → hits
```

**profiles** — `id` (= `auth.users.id`), `email`, `display_name`, timestamps. Created by a trigger on sign-up;
e-mail kept in sync by a trigger.

**channels** — `id`, `owner_id`, `title`, `description`, `author_name`, `language`, `category`, `explicit`,
`cover_image_key`, `cover_image_mime_type`, `web_token_hash`, `rss_token_hash`, `web_token_ciphertext`,
`rss_token_ciphertext`, `tokens_rotated_at`, `published`, timestamps. Token hashes are unique; the two
tokens of a channel must differ.

**episodes** — `id`, `channel_id`, `title`, `description`, `audio_storage_key` (unique), `audio_mime_type`,
`audio_size_bytes`, `duration_seconds`, `guid` (unique, immutable — enforced by trigger), `status`
(`draft`/`published`), `published_at` (set by trigger on first publish), timestamps. Check constraints:
audio fields are all-or-nothing; a published episode must have audio and a publication date.

**uploads** — pending presigned uploads: `owner_id`, `kind` (`audio`/`cover`), `channel_id`, `episode_id`,
server-chosen `storage_key`, declared MIME type and size, `expires_at`, `completed_at`.

**rate_limits** — fixed-window counters keyed by an HMAC of the subject.

Indexes cover the hot paths: channels by owner, episodes by `(channel_id, status, published_at)`, unique
token hashes for O(1) lookup. Foreign keys cascade: deleting a user deletes their profile, channels,
episodes and uploads; deleting a channel deletes its episodes.

### Functions

- `rate_limit_hit(key, window, max)` — atomic upsert + check (service role only).
- `complete_upload(upload, owner, mime, size, duration)` — **one transaction** that locks the upload row,
  re-checks ownership, attaches the object to the episode or channel, marks the upload complete and returns
  the replaced storage key (service role only).
- `owns_channel(channel)` — `SECURITY DEFINER` helper used by episode RLS policies.

### Privileges and RLS

- `anon`: no table privileges at all.
- `authenticated`: RLS restricts every table to the user's own rows. Column-level grants allow reading
  channels **without** token hash/ciphertext columns and updating only editable fields (title, description,
  etc.). Episodes: insert `(channel_id, title, description)`, update `(title, description, status)`. Audio
  metadata and token columns are writable only by the service role.
- `service_role`: used server-side for token writes, verified audio metadata, public token lookups and rate
  limiting — always after an explicit ownership check through the user-scoped client.

## Authentication

Supabase Auth with e-mail + password, using `@supabase/ssr` cookie sessions:

- Sign-up, sign-in, sign-out and password-reset requests are **server actions** (rate limited per IP and
  per e-mail).
- `src/proxy.ts` (Next 16's replacement for middleware) refreshes the session cookie on dashboard and auth
  routes and redirects anonymous users from `/painel/*` to `/entrar`. Layouts and actions re-check with
  `supabase.auth.getUser()` (validated with the Auth server) — the proxy is not the only gate.
- `/auth/confirm` handles e-mail links (PKCE `code` and `token_hash` formats) for sign-up confirmation and
  password recovery, then redirects to the dashboard or the "new password" page.
- Public routes (`/c`, `/rss`, `/audio`, `/cover`) are excluded from the proxy and never read cookies.

## Audio storage

Object keys are chosen by the server and never derived from file names. Browsers can only write to the
staging prefix; verified objects are moved to their final key:

```
uploads/<channel_id>/<random-128-bit>.<ext>          (staging, client-writable via presigned PUT)
audio/<channel_id>/<episode_id>/<random-128-bit>.<ext>
covers/<channel_id>/<random-128-bit>.<ext>
```

Upload flow:

1. `POST /api/publisher/uploads` — validates declared MIME type + extension (they must agree), size limits and
   ownership (via RLS), rate limits, records a pending `uploads` row, returns a presigned PUT URL
   (15 min; `Content-Type` and `Content-Length` are signed, so R2 rejects a PUT of a different type or size).
2. Browser `PUT`s the file straight to R2 with progress reporting (XHR).
3. `POST /api/publisher/uploads/:id/complete` — `HEAD`s the object, requires the stored size to equal the
   declared size and be within limits, reads the first 4 KiB and **sniffs the container format** (MP3/ID3,
   ADTS AAC, MP4/M4A, WAV, WebM/EBML, Ogg; JPEG/PNG/WebP for covers), checks the duration limit, then moves the
   object out of `uploads/`, re-verifies it at the final key and calls `complete_upload`. Rejected objects are deleted. A replaced object is deleted after the swap.

The local adapter emulates step 1–2 with HMAC-signed URLs handled by `/api/dev-storage/upload`.

## Audio streaming

Enclosure URLs are stable: `/audio/<episode guid>/<channel token>.<ext>`. Each request:

1. validates the token format and GUID format, looks up the channel by HMAC of the token (RSS or web
   token), requiring `published = true`;
2. looks up the episode by `(channel_id, guid, status = 'published')` — so tokens of one channel can never
   reach another channel's episodes (no IDOR);
3. serves the object:
   - **proxy mode** (default): parses a single `Range`, returns 200/206/416 with `Content-Length`,
     `Content-Range`, `Accept-Ranges`, `ETag`, `Last-Modified`; supports `HEAD`, `If-None-Match`, `If-Range`.
     The body is a stream piped from R2's ranged `GetObject` — never buffered in memory.
   - **redirect mode**: 302 to a 1-hour presigned R2 GET URL (R2 then handles ranges natively).

Every failure is the same 404 (no oracle). Repeated invalid tokens from one IP get 429.

This endpoint is a **Pages Router API route** reached through a rewrite. App Router route handlers in
Next.js 16 strip `Content-Length` from responses, and podcast apps rely on it (HEAD probes, download sizes).
The raw Node response of a Pages API route preserves headers exactly. Audio responses also carry
`Cache-Control: no-transform` so they are never gzip-compressed.

## RSS generation

See [RSS.md](RSS.md). Feeds are generated on every request from the database (no stale caches), with
an ETag derived from the XML so podcast apps get cheap `304 Not Modified` responses.

## Token-based access

Each channel has two independent 256-bit tokens:

- **web token** → `/c/<token>` (public page) and web-player audio URLs;
- **RSS token** → `/rss/<token>`, enclosure URLs and the cover image in the feed.

The public page shows the RSS link (so web-link holders can subscribe). Rotating a token replaces its hash
in one `UPDATE`; old URLs return 404 on the very next request. Details in [SECURITY.md](SECURITY.md).

## Security decisions (summary)

- Hash tokens with HMAC-SHA256 (keyed, domain-separated) for lookup; store AES-256-GCM ciphertext so owners
  can view links again. Neither reveals tokens without server secrets.
- Least privilege in the database: RLS + column grants + service-role-only functions.
- Server-side authorization on every operation; JSON endpoints require same-origin JSON requests.
- Strict input validation (Zod), server-chosen storage keys, content sniffing.
- `Referrer-Policy: no-referrer` everywhere and no third-party resources, so tokens do not leak via
  `Referer` or external requests. `noindex` everywhere.
- No analytics or tracking. Errors are logged without tokens or request data.
