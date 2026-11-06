# Security

## Bearer-link model

Ouve Isto deliberately has no listener accounts. **Possession of a secret URL grants access** — like an
unlisted video link or a shared document link. This keeps listening frictionless and works with any
podcast app, but it has inherent limits that the product never hides:

- Anyone who receives a link can listen, download and forward it.
- Downloaded audio cannot be recalled; there is **no DRM**.
- Revocation (rotating links) stops _future_ access via the old URL; it cannot undo past access.
- Links travel through chat apps, e-mail, browser history, podcast apps and their sync servers, any of which
  may retain them.

The UI states this on the landing page, the channel page ("Revogar acesso" card) and the public page footer.

## Tokens

- **Generation**: 32 bytes from Node's CSPRNG (`crypto.randomBytes`), base64url-encoded (43 characters,
  256 bits of entropy). Guessing is infeasible; rate limiting is an additional speed bump.
- **Two tokens per channel**: web (page + web player) and RSS (feed + enclosures). They are rotated
  independently.
- **Lookup by keyed hash**: `HMAC-SHA256(TOKEN_HASH_SECRET, "ouve-isto:<kind>:<token>")`, stored in unique
  indexed columns. Domain separation means a web token can never match an RSS hash. A database leak alone
  does not reveal tokens, and offline guessing would require the server secret.
- **Owner re-display**: so publishers can copy their links at any time, the token is also stored encrypted
  with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`, random IV, the token kind as associated data). Ciphertexts are
  readable only by the service role; the `authenticated` role has no column privilege on them.
- **Format checks** reject malformed tokens before any database query.
- **Rotation** overwrites the hash and ciphertext in a single `UPDATE`, so the old URL stops working on the
  next request (there is no caching of positive lookups).

Rotating `TOKEN_HASH_SECRET` invalidates every link (an emergency "revoke all"). Rotating
`TOKEN_ENCRYPTION_KEY` makes stored ciphertexts undecryptable — owners would need to rotate their channel
links to see them again.

## Threat model

| Threat                                         | Mitigation                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Guessing/enumerating links                     | 256-bit tokens; uniform 404s; per-IP rate limit on invalid tokens (429)                                      |
| Database dump                                  | Only HMACs and AES-GCM ciphertexts stored; secrets live in env vars                                          |
| Publisher A accessing publisher B's data       | RLS on every table; ownership checks before every service-role write; RPCs re-check ownership                |
| IDOR on audio (`/audio/<guid>/<token>`)        | Episode looked up by `(channel of token, guid, published)`; internal IDs never exposed                       |
| Listener seeing drafts                         | Every public query filters `status = 'published'` and `channels.published = true`                            |
| Tampering with audio metadata / token columns  | Column-level grants: `authenticated` cannot write them; only the server after validation                     |
| Malicious uploads (HTML/JS disguised as audio) | Declared type + extension must agree; server sniffs magic bytes; `nosniff`; inline disposition               |
| Oversized uploads                              | Size declared and checked before presigning; stored size verified; mismatches deleted                        |
| Path traversal in storage keys                 | Keys are server-generated; local adapter validates keys and resolves within its root                         |
| Token leakage via `Referer`                    | `Referrer-Policy: no-referrer` (header + meta); no third-party scripts, fonts, images or analytics           |
| Token leakage via search engines               | `noindex, nofollow` meta + `X-Robots-Tag`; `itunes:block` and `podcast:locked` in feeds                      |
| CSRF                                           | Server actions verify Origin (Next.js); JSON API requires `application/json` + same Origin; SameSite cookies |
| XSS                                            | React escaping; CSP (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`)                    |
| XML injection in feeds                         | Single escaping function for all text/attributes; invalid XML characters stripped                            |
| Open redirects after login                     | `next` parameter restricted to same-origin relative paths                                                    |
| Credential stuffing / brute force              | Supabase Auth limits plus app-level limits on login, sign-up and reset (per IP and e-mail)                   |
| User enumeration via password reset            | Identical response whether or not the account exists                                                         |
| Leaking secrets to the browser                 | Service role key and R2 keys are server-only; the browser only receives presigned URLs                       |
| Clickjacking                                   | `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`                                                        |

Out of scope for the MVP: protection against a recipient intentionally redistributing audio, DDoS
protection beyond the hosting platform, and compromise of the hosting accounts themselves.

## Audio access

- The R2 bucket is **private**. No public bucket URL or custom domain is needed or recommended.
- Uploads use presigned PUT URLs (15 minutes by default) for a server-chosen key, with `Content-Type` and
  `Content-Length` signed.
- In the default **proxy** mode, the application authorizes every byte-range request and streams the object.
  Revocation is immediate.
- In **redirect** mode, each authorized request receives a fresh presigned GET URL valid for one hour.
  Revocation applies to new requests immediately, but a redirect URL obtained before revocation remains valid
  until it expires.
- Publishers preview their own audio (including drafts) via an authenticated, RLS-checked endpoint that uses
  no tokens.

## Revocation limitations

- Rotation does not delete copies already downloaded by podcast apps or browsers.
- Podcast apps may show cached episode lists until they next refresh, and then fail to play new requests.
- Server-side podcast services (e.g. those that poll feeds centrally) will simply start receiving 404s.
- Deactivating a channel (toggle "Canal ativo") hides the page and feed without changing links; reactivating
  restores access with the same links.

## Operational security

- **Secrets** are only provided via environment variables (Vercel project settings, GitHub Actions secrets).
  Nothing secret is committed; `.env*` files are git-ignored except `.env.example` (placeholders only).
- **Logs**: the application never logs tokens, request URLs, IPs or bodies; errors log only a message/code.
  However, **hosting providers log request paths**, which contain tokens (`/c/…`, `/rss/…`, `/audio/…`).
  Restrict access to Vercel logs to trusted team members and keep log retention short. Disable any log
  drains or third-party observability that would export request URLs, or scrub paths there.
- **No tracking**: no analytics, fonts or scripts from third parties are loaded. Do not add analytics to
  `/c/*` pages without stripping the path.
- **Service role key** bypasses RLS: only `src/server/supabase/admin.ts` uses it, server-side, and every use
  is preceded by an explicit ownership check or restricted to token lookups.
- **Rate limiting** uses Postgres (`rate_limit_hit`) with HMAC'd keys (no raw IPs or e-mails stored).
  Windows: login 10/15 min, sign-up 5/h, reset 5/h, upload URLs 60/h per user, rotations 20/h, channel
  creation 20/h, invalid tokens 60/10 min per IP. If the limiter errors, requests are allowed (fail open)
  and the error is logged.
- **Security headers** (all routes): CSP, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, `Permissions-Policy` (microphone only
  for self), HSTS in production. The CSP allows `'unsafe-inline'` scripts because Next.js injects inline
  bootstrap scripts; nonce-based CSP would require per-request rendering of every page and is a possible
  hardening step.
- **Supabase Auth settings** for production: enable e-mail confirmation, set a strong minimum password
  length (≥ 8, as the app enforces), configure SMTP, set Site URL and allowed redirect URLs (see
  DEPLOYMENT.md), and consider enabling leaked-password protection.
- **Dependencies**: `npm audit --omit=dev` reports no known vulnerabilities at the time of writing; keep the
  lockfile updated (e.g. Dependabot).

## Reporting

Please report security issues privately to the repository owner rather than opening a public issue.
