-- Ouve Isto — initial schema
--
-- Security model summary (see docs/SECURITY.md):
--   * Publishers access their own rows through PostgREST with RLS.
--   * Sensitive columns (token hashes/ciphertexts, audio storage metadata) are
--     NOT writable by the `authenticated` role; the server writes them with the
--     service role after validating ownership and the uploaded object.
--   * Listeners never touch the database directly: public pages, feeds and
--     audio are served by server-side handlers that resolve secret tokens.
--   * The `anon` role has no table privileges at all.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text check (display_name is null or char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 80), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Keep the profile e-mail in sync if the user changes it.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
after update of email on auth.users
for each row execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- channels
-- ---------------------------------------------------------------------------

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 4000),
  author_name text check (author_name is null or char_length(author_name) <= 120),
  language text not null default 'pt-PT' check (language ~ '^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$'),
  category text not null default 'Society & Culture' check (char_length(category) <= 80),
  explicit boolean not null default false,
  cover_image_key text unique,
  cover_image_mime_type text,
  -- Bearer tokens: HMAC-SHA256 hashes for lookup, AES-256-GCM ciphertext so the
  -- owner can view/copy the link again. Plaintext tokens are never stored.
  web_token_hash text not null unique,
  rss_token_hash text not null unique,
  web_token_ciphertext text not null,
  rss_token_ciphertext text not null,
  tokens_rotated_at timestamptz not null default now(),
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint channels_distinct_tokens check (web_token_hash <> rss_token_hash),
  constraint channels_cover_consistency check (
    (cover_image_key is null) = (cover_image_mime_type is null)
  )
);

create index channels_owner_id_created_at_idx on public.channels (owner_id, created_at desc);

create trigger channels_set_updated_at
before update on public.channels
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- episodes
-- ---------------------------------------------------------------------------

create type public.episode_status as enum ('draft', 'published');

create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 10000),
  audio_storage_key text unique,
  audio_mime_type text,
  audio_size_bytes bigint check (audio_size_bytes is null or audio_size_bytes > 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  -- Public, stable identifier used in RSS <guid> and enclosure URLs.
  -- Never changes across edits; the internal id is never exposed publicly.
  guid uuid not null unique default gen_random_uuid(),
  status public.episode_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint episodes_audio_consistency check (
    (audio_storage_key is null and audio_mime_type is null and audio_size_bytes is null)
    or (audio_storage_key is not null and audio_mime_type is not null and audio_size_bytes is not null)
  ),
  constraint episodes_published_requires_audio check (
    status = 'draft' or (audio_storage_key is not null and published_at is not null)
  )
);

create index episodes_channel_status_published_idx
  on public.episodes (channel_id, status, published_at desc);
create index episodes_channel_updated_idx on public.episodes (channel_id, updated_at desc);

create trigger episodes_set_updated_at
before update on public.episodes
for each row execute function public.set_updated_at();

-- Set the publication date the first time an episode is published, and keep
-- the guid immutable.
create or replace function public.episodes_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.guid is distinct from old.guid then
    raise exception 'episode guid is immutable';
  end if;
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger episodes_before_write
before insert or update on public.episodes
for each row execute function public.episodes_before_write();

-- ---------------------------------------------------------------------------
-- uploads (pending presigned uploads; service role only)
-- ---------------------------------------------------------------------------

create type public.upload_kind as enum ('audio', 'cover');

create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  kind public.upload_kind not null,
  channel_id uuid not null references public.channels (id) on delete cascade,
  episode_id uuid references public.episodes (id) on delete cascade,
  storage_key text not null unique,
  declared_mime_type text not null,
  declared_size_bytes bigint not null check (declared_size_bytes > 0),
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint uploads_audio_has_episode check (kind <> 'audio' or episode_id is not null)
);

create index uploads_owner_created_idx on public.uploads (owner_id, created_at desc);

-- ---------------------------------------------------------------------------
-- rate limiting (fixed window counters; service role only)
-- ---------------------------------------------------------------------------

create table public.rate_limits (
  bucket_key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket_key, window_start)
);

create index rate_limits_window_start_idx on public.rate_limits (window_start);

-- Atomically records a hit and returns true while the caller is within the
-- limit. Keys are expected to be pre-hashed by the application (no raw IPs).
create or replace function public.rate_limit_hit(
  p_key text,
  p_window_seconds integer,
  p_max_hits integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as rl (bucket_key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (bucket_key, window_start)
  do update set hits = rl.hits + 1
  returning hits into v_hits;

  -- Opportunistic cleanup of old windows (cheap thanks to the index).
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_max_hits;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on public.profiles, public.channels, public.episodes, public.uploads, public.rate_limits
  from anon, authenticated;
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_user_email_change() from public, anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Token hashes and ciphertexts are deliberately not readable by `authenticated`.
grant select (
  id, owner_id, title, description, author_name, language, category, explicit,
  cover_image_key, cover_image_mime_type, tokens_rotated_at, published, created_at, updated_at
) on public.channels to authenticated;
grant update (title, description, author_name, language, category, explicit, published)
  on public.channels to authenticated;
grant delete on public.channels to authenticated;

grant select on public.episodes to authenticated;
grant insert (channel_id, title, description) on public.episodes to authenticated;
grant update (title, description, status) on public.episodes to authenticated;
grant delete on public.episodes to authenticated;

grant all on public.profiles, public.channels, public.episodes, public.uploads, public.rate_limits
  to service_role;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.channels enable row level security;
alter table public.episodes enable row level security;
alter table public.uploads enable row level security;
alter table public.rate_limits enable row level security;

create policy "profiles: owner can read"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: owner can update"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "channels: owner can read"
  on public.channels for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "channels: owner can update"
  on public.channels for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "channels: owner can delete"
  on public.channels for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Channel creation happens server-side with the service role (it needs to
-- write token hashes), so there is intentionally no insert policy.

create or replace function public.owns_channel(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.channels c
    where c.id = p_channel_id and c.owner_id = (select auth.uid())
  );
$$;

revoke all on function public.owns_channel(uuid) from public, anon;
grant execute on function public.owns_channel(uuid) to authenticated;

create policy "episodes: owner can read"
  on public.episodes for select to authenticated
  using (public.owns_channel(channel_id));

create policy "episodes: owner can insert"
  on public.episodes for insert to authenticated
  with check (public.owns_channel(channel_id));

create policy "episodes: owner can update"
  on public.episodes for update to authenticated
  using (public.owns_channel(channel_id))
  with check (public.owns_channel(channel_id));

create policy "episodes: owner can delete"
  on public.episodes for delete to authenticated
  using (public.owns_channel(channel_id));

-- uploads and rate_limits: no policies => no access for anon/authenticated.

-- ---------------------------------------------------------------------------
-- Upload completion (single transaction)
-- ---------------------------------------------------------------------------

-- Attaches a verified upload (already moved by the server from its staging
-- key to p_final_key) to its episode (audio) or channel (cover) and
-- marks the upload completed, atomically. Returns the storage key that was
-- replaced (so the caller can delete the old object), or null.
-- Called only by the server (service role) after it has verified the stored
-- object's size and content.
create or replace function public.complete_upload(
  p_upload_id uuid,
  p_final_key text,
  p_owner_id uuid,
  p_mime_type text,
  p_size_bytes bigint,
  p_duration_seconds integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_upload public.uploads%rowtype;
  v_previous text;
begin
  select * into v_upload
  from public.uploads
  where id = p_upload_id
  for update;

  if not found or v_upload.owner_id <> p_owner_id then
    raise exception 'upload not found' using errcode = 'P0002';
  end if;
  if v_upload.completed_at is not null then
    raise exception 'upload already completed' using errcode = 'P0001';
  end if;
  if p_final_key is null or p_final_key like 'uploads/%' then
    raise exception 'invalid final key' using errcode = 'P0001';
  end if;

  -- Re-check ownership of the target at completion time.
  if not exists (
    select 1 from public.channels c
    where c.id = v_upload.channel_id and c.owner_id = p_owner_id
  ) then
    raise exception 'upload not found' using errcode = 'P0002';
  end if;

  if v_upload.kind = 'audio' then
    select e.audio_storage_key into v_previous
    from public.episodes e
    where e.id = v_upload.episode_id and e.channel_id = v_upload.channel_id
    for update;
    if not found then
      raise exception 'upload not found' using errcode = 'P0002';
    end if;

    update public.episodes
    set audio_storage_key = p_final_key,
        audio_mime_type = p_mime_type,
        audio_size_bytes = p_size_bytes,
        duration_seconds = p_duration_seconds
    where id = v_upload.episode_id;
  else
    select c.cover_image_key into v_previous
    from public.channels c
    where c.id = v_upload.channel_id
    for update;

    update public.channels
    set cover_image_key = p_final_key,
        cover_image_mime_type = p_mime_type
    where id = v_upload.channel_id;
  end if;

  update public.uploads set completed_at = now() where id = p_upload_id;

  return v_previous;
end;
$$;

revoke all on function public.complete_upload(uuid, text, uuid, text, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.complete_upload(uuid, text, uuid, text, bigint, integer) to service_role;

revoke all on function public.owns_channel(uuid) from public;
