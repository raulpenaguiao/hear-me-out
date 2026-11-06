# Deployment

Production topology:

```
GitHub ──(push to main)──► GitHub Actions: checks → integration/E2E → migrate Supabase → deploy Vercel
Vercel (Next.js app)  ──►  Supabase (Auth + Postgres)
                      ──►  Cloudflare R2 (private bucket)
```

Environments:

| Environment | App                                                                          | Database / Auth                             | Storage                               |
| ----------- | ---------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------- |
| Local       | `npm run dev`                                                                | Local Supabase (Docker)                     | Local filesystem                      |
| CI          | `next start` in GitHub Actions                                               | Local Supabase in the runner                | Local filesystem                      |
| Preview     | Vercel preview deployments (branches/PRs, via the Vercel GitHub integration) | Supabase (a staging project is recommended) | R2 (a separate bucket is recommended) |
| Production  | Vercel production (deployed by GitHub Actions after CI passes)               | Supabase production project                 | R2 production bucket                  |

You need accounts on **GitHub**, **Vercel**, **Supabase** and **Cloudflare**. Budget about 30–45 minutes.

---

## 1. Supabase

1. Create a project at https://supabase.com/dashboard (choose an EU region, e.g. Frankfurt, if your users are
   in Portugal). Save the **database password**.
2. Note from **Project Settings → API** (or "API Keys"):
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon / publishable key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role / secret key → `SUPABASE_SERVICE_ROLE_KEY` (**server only, never expose**)
   - Project reference (the `xxxx` in `xxxx.supabase.co`) → GitHub secret `SUPABASE_PROJECT_REF`
3. Create a personal access token at https://supabase.com/dashboard/account/tokens → GitHub secret
   `SUPABASE_ACCESS_TOKEN`.
4. Apply the schema. CI does this on every deploy, but for the first time you can run it locally:

   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```

   ```bash
   npx supabase db push
   ```

5. **Authentication → URL configuration**:
   - Site URL: `https://YOUR-DOMAIN`
   - Redirect URLs: `https://YOUR-DOMAIN/auth/confirm` (add your preview domain pattern too, e.g.
     `https://*-your-team.vercel.app/auth/confirm`, if previews should handle e-mail links).
6. **Authentication → Providers → Email**: keep e-mail sign-up enabled, **enable "Confirm email"**, set the
   minimum password length to 8. Consider enabling leaked-password protection.
7. **Authentication → SMTP**: configure a real SMTP provider. The built-in sender is heavily rate limited and
   meant for testing only.
8. Optional — cross-device confirmation links: the default templates work when the link is opened in the same
   browser that signed up (PKCE). To make links work on any device, change the "Confirm signup" and "Reset
   password" templates to link to
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` (and `type=recovery` for reset);
   `/auth/confirm` supports both formats.

## 2. Cloudflare R2

1. In the Cloudflare dashboard → **R2 Object Storage**, create a bucket, e.g. `ouve-isto-audio`.
   - Keep **Public access disabled** (no r2.dev subdomain, no custom domain). The app never needs it.
2. Note your **Account ID** (R2 overview page) → `R2_ACCOUNT_ID`.
3. **Manage R2 API tokens → Create API token**:
   - Permissions: **Object Read & Write**
   - Scope: **only** the bucket above
   - Save the **Access Key ID** → `R2_ACCESS_KEY_ID` and **Secret Access Key** → `R2_SECRET_ACCESS_KEY`.
4. **Bucket → Settings → CORS policy** — browsers upload directly to R2 with presigned PUTs:

   ```json
   [
     {
       "AllowedOrigins": ["https://YOUR-DOMAIN"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["Content-Type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Add preview origins if previews use this bucket (prefer a separate bucket for previews), and
   `http://localhost:3000` only on a development bucket.

5. Set `R2_BUCKET` to the bucket name and `STORAGE_DRIVER=r2`.

### R2 lifecycle (optional)

Uploads that are started but never completed (e.g. the user closes the tab mid-upload) can leave objects
without a database reference. They are harmless (private, unreferenced) but cost storage. The MVP does not
clean them automatically. To find candidates:

```sql
select storage_key from public.uploads
where completed_at is null and expires_at < now() - interval '1 day';
```

Deleting those keys from R2 and then the rows is safe. Do **not** add a blanket R2 lifecycle expiry rule —
it would delete published audio.

## 3. Vercel

1. **Add New → Project → Import** this GitHub repository. Framework preset: Next.js (auto-detected). No build
   overrides are needed; `vercel.json` is committed.
2. **Settings → Environment Variables** — add for **Production** (and **Preview** with staging values):

   | Variable                                                                 | Value                                                                                        |
   | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
   | `NEXT_PUBLIC_APP_URL`                                                    | `https://YOUR-DOMAIN` (Production only; previews fall back to their own URL)                 |
   | `NEXT_PUBLIC_SUPABASE_URL`                                               | from Supabase                                                                                |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY`                                          | from Supabase                                                                                |
   | `SUPABASE_SERVICE_ROLE_KEY`                                              | from Supabase (mark as Sensitive)                                                            |
   | `TOKEN_HASH_SECRET`                                                      | `openssl rand -base64 48` (Sensitive). **Never change casually** — it invalidates all links. |
   | `TOKEN_ENCRYPTION_KEY`                                                   | `openssl rand -base64 32` (Sensitive)                                                        |
   | `STORAGE_DRIVER`                                                         | `r2`                                                                                         |
   | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | from Cloudflare (keys Sensitive)                                                             |
   | `AUDIO_DELIVERY_MODE`                                                    | `proxy` (default) or `redirect` — see below                                                  |
   | `AUDIO_MAX_UPLOAD_MB` etc.                                               | optional overrides                                                                           |

   Use **different** `TOKEN_*` secrets, Supabase project and bucket for Preview than for Production.

3. **Settings → Domains**: add your domain and point DNS as instructed. Then update `NEXT_PUBLIC_APP_URL`,
   the Supabase Site URL/redirect URLs and the R2 CORS origin to match.
4. **Production deploys come from GitHub Actions**, not from Vercel's Git integration: `vercel.json` sets
   `git.deploymentEnabled.main = false`, so pushing to `main` does not deploy until CI has passed. Preview
   deployments for other branches and PRs still come from the Vercel GitHub integration.
5. **Deployment Protection**: Vercel protects preview deployments by default — fine for previews. Make sure
   **production is not protected**, otherwise podcast apps and listeners cannot reach feeds and pages.
6. Create a token at https://vercel.com/account/tokens → GitHub secret `VERCEL_TOKEN`.
7. Get the org and project IDs. Run `npx vercel link` locally once; then read `.vercel/project.json`
   (`orgId` → `VERCEL_ORG_ID`, `projectId` → `VERCEL_PROJECT_ID`). `.vercel/` is git-ignored.

### Choosing `AUDIO_DELIVERY_MODE`

- `proxy` (default): audio is streamed through a Vercel Function. The bucket stays completely hidden and
  revocation is instant. It costs Vercel function time and bandwidth, and very long downloads are bounded by
  the function's maximum duration (`maxDuration = 300` s is configured; raise it on paid plans if needed).
- `redirect`: each authorized request is answered with a 302 to a one-hour presigned R2 URL. R2 serves the
  bytes (cheaper, no duration limit, native range support). Revocation is delayed by up to one hour for
  anyone who already obtained a redirect. Recommended for large files or many listeners.

## 4. GitHub Actions

The workflow is `.github/workflows/ci.yml`:

- **checks** (every PR and push): `npm ci`, lint, Prettier check, type check, unit tests, production build.
- **integration** (every PR and push): starts local Supabase in the runner (Docker), generates `.env.local`,
  runs integration tests and Playwright E2E (installs Chromium). Uploads the Playwright report on failure.
- **deploy** (push to `main` only, after both jobs pass): `supabase db push` to production, then
  `vercel pull` → `vercel build --prod` → `vercel deploy --prebuilt --prod`. If any deployment secret is
  missing the job logs a warning and skips the deployment instead of failing.

Configure in **GitHub → Settings → Secrets and variables → Actions** (or as secrets of a `production`
environment, which the deploy job uses — you can also add required reviewers there):

| Secret                  | Source                               |
| ----------------------- | ------------------------------------ |
| `VERCEL_TOKEN`          | Vercel account token                 |
| `VERCEL_ORG_ID`         | `.vercel/project.json` → `orgId`     |
| `VERCEL_PROJECT_ID`     | `.vercel/project.json` → `projectId` |
| `SUPABASE_ACCESS_TOKEN` | Supabase personal access token       |
| `SUPABASE_PROJECT_REF`  | Supabase project reference           |
| `SUPABASE_DB_PASSWORD`  | Supabase database password           |

Runtime secrets (Supabase keys, `TOKEN_*`, R2 keys) live in **Vercel** environment variables; `vercel pull`
fetches them during the build. They do not need to be GitHub secrets. CI tests never use production
credentials.

Recommended: protect `main` with a branch rule requiring the `checks` and `integration` jobs to pass.

## 5. First deploy checklist

1. Push to `main` (or re-run the workflow). Watch the **deploy** job; the summary shows the production URL.
2. Visit `https://YOUR-DOMAIN`, create an account, confirm the e-mail, create a channel.
3. Record or upload a short episode and publish it.
4. Open the channel's web link in a private window — it must work without logging in.
5. `curl -I https://YOUR-DOMAIN/rss/TOKEN` → `200`, `application/rss+xml; charset=utf-8`.
6. Add the RSS link to a podcast app (e.g. Apple Podcasts "Follow a Show by URL") and play the episode.
7. Rotate the RSS link and confirm the old one returns `404`.
8. Run the feed through a validator (see [RSS.md](RSS.md#validating-feeds)) using a throwaway channel.

## Rollback

- App: in Vercel → Deployments, "Promote to Production" on a previous deployment.
- Database: migrations are forward-only. Write a new migration that reverts the change; avoid destructive
  migrations without a backup (Supabase provides daily backups on paid plans; take a manual backup before
  risky changes).
