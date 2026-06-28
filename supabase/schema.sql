-- 社群功能資料庫結構（在 Supabase SQL Editor 執行一次）
-- ===== 表 =====
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique not null check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name text,
  avatar_url text,
  bio text check (char_length(bio) <= 300),
  created_at timestamptz not null default now()
);

create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  trail_id text,
  trail_name text,
  distance_km numeric,
  duration_ms bigint,
  ascent integer,
  hiked_on date,
  caption text check (char_length(caption) <= 2000),
  track jsonb,
  visibility text not null default 'friends' check (visibility in ('public','friends')),
  created_at timestamptz not null default now()
);

create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  kind text not null check (kind in ('photo','video')),
  path text not null,
  thumb_path text,
  w integer, h integer, dur numeric,
  ord integer not null default 0
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- ===== 輔助函式 =====
create or replace function public.is_friend(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from follows where follower_id = a and following_id = b)
     and exists(select 1 from follows where follower_id = b and following_id = a);
$$;

create or replace function public.can_see_post(p_author uuid, p_visibility text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_visibility = 'public'
      or p_author = auth.uid()
      or (p_visibility = 'friends' and public.is_friend(auth.uid(), p_author));
$$;

-- ===== RLS =====
alter table public.profiles   enable row level security;
alter table public.follows    enable row level security;
alter table public.posts      enable row level security;
alter table public.post_media enable row level security;
alter table public.comments   enable row level security;
alter table public.likes      enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists follows_select on public.follows;
create policy follows_select on public.follows for select to authenticated using (true);
drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows for insert to authenticated with check (follower_id = auth.uid());
drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows for delete to authenticated using (follower_id = auth.uid());

drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select to authenticated using (public.can_see_post(author_id, visibility));
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated with check (author_id = auth.uid());
drop policy if exists posts_update on public.posts;
create policy posts_update on public.posts for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete to authenticated using (author_id = auth.uid());

drop policy if exists post_media_select on public.post_media;
create policy post_media_select on public.post_media for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and public.can_see_post(p.author_id, p.visibility)));
drop policy if exists post_media_write on public.post_media;
create policy post_media_write on public.post_media for all to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()))
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and public.can_see_post(p.author_id, p.visibility)));
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id and public.can_see_post(p.author_id, p.visibility)));
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = auth.uid() or exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));

drop policy if exists likes_select on public.likes;
create policy likes_select on public.likes for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and public.can_see_post(p.author_id, p.visibility)));
drop policy if exists likes_insert on public.likes;
create policy likes_insert on public.likes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id and public.can_see_post(p.author_id, p.visibility)));
drop policy if exists likes_delete on public.likes;
create policy likes_delete on public.likes for delete to authenticated using (user_id = auth.uid());

-- ===== Storage =====
insert into storage.buckets (id, name, public) values ('media','media', true) on conflict (id) do nothing;
drop policy if exists media_read on storage.objects;
create policy media_read on storage.objects for select using (bucket_id = 'media');
drop policy if exists media_insert on storage.objects;
create policy media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists media_delete on storage.objects;
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
