-- phase41：夥伴社群·互動（2026-10-09，夥伴第三版 R12）。可重複執行。要先跑過 phase5（封鎖）、phase9（送果實）、phase21（小隊位置）。
--   1) 送小東西給好友的夥伴：give_pet_item(to, item)／claim_pet_items()
--   2) 回訪：pet_return_visit(to)／claim_pet_visits()——雙方各記一筆日記
--   3) 小隊地圖上的夥伴戴帽子＋配件：team_presence.pet_look（小 JSON，跟每 8 秒那次位置一起送）
--   4) 封鎖的人送不了、回訪不了；送果實（phase9）也補上同樣的檢查
-- 小東西的收藏只存在手機上（localStorage），伺服器沒辦法驗「送的人真的有」——
-- 伺服器負責的是：只能送給互相追蹤的好友、沒封鎖、同一件不重送給同一個人、每天每位好友一件、領取只領一次（兩台手機不會重複領）。

-- ── 1) 送小東西 ──
create table if not exists public.pet_item_gifts (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  item text not null check (item ~ '^[a-z]{1,16}$'),
  claimed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (from_user, to_user, item)
);
create index if not exists idx_petitem_to on public.pet_item_gifts(to_user, claimed);
alter table public.pet_item_gifts enable row level security;
drop policy if exists petitem_select on public.pet_item_gifts;
create policy petitem_select on public.pet_item_gifts for select to authenticated using (to_user = auth.uid() or from_user = auth.uid());
-- 寫入、領取一律走下面的 RPC（security definer）

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow','like','comment','team','gift','mention','follow_req','follow_ok','guard','guard_ext','overdue','safe','admin','pet_item','pet_visit'));

-- 回傳 'ok'｜'dup'（這件已經送過這個人）｜'daily'（今天已經送過他一件）｜'blocked'｜'not_friend'｜'self'
create or replace function public.give_pet_item(p_to uuid, p_item text) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_to = me then return 'self'; end if;
  if public.is_blocked(me, p_to) then return 'blocked'; end if;
  if not public.is_friend(me, p_to) then return 'not_friend'; end if;
  if p_item is null or p_item !~ '^[a-z]{1,16}$' then raise exception 'bad item'; end if;
  if exists (select 1 from pet_item_gifts where from_user = me and to_user = p_to
             and (created_at at time zone 'Asia/Taipei')::date = (now() at time zone 'Asia/Taipei')::date) then
    return 'daily';
  end if;
  insert into pet_item_gifts(from_user, to_user, item) values (me, p_to, p_item) on conflict (from_user, to_user, item) do nothing;
  if not found then return 'dup'; end if;
  insert into notifications(user_id, actor_id, type) values (p_to, me, 'pet_item');
  return 'ok';
end $$;
revoke all on function public.give_pet_item(uuid, text) from public, anon;
grant execute on function public.give_pet_item(uuid, text) to authenticated;

-- 領取：一個 UPDATE … RETURNING，兩台手機同時開也只有一台領到；封鎖之後送來的不給
create or replace function public.claim_pet_items() returns table(item text, from_user uuid, from_name text)
language plpgsql security definer set search_path = public as $$
begin
  return query
    with c as (
      update pet_item_gifts g set claimed = true
      where g.to_user = auth.uid() and not g.claimed and not public.is_blocked(g.to_user, g.from_user)
      returning g.item, g.from_user)
    select c.item, c.from_user, coalesce(p.display_name, p.handle) from c left join profiles p on p.id = c.from_user;
end $$;
revoke all on function public.claim_pet_items() from public, anon;
grant execute on function public.claim_pet_items() to authenticated;

-- ── 2) 回訪 ──
create table if not exists public.pet_visits (
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  day date not null default ((now() at time zone 'Asia/Taipei')::date),
  claimed boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (from_user, to_user, day)
);
create index if not exists idx_petvisit_to on public.pet_visits(to_user, claimed);
alter table public.pet_visits enable row level security;
drop policy if exists petvisit_select on public.pet_visits;
create policy petvisit_select on public.pet_visits for select to authenticated using (to_user = auth.uid() or from_user = auth.uid());

-- 回傳 'ok'｜'daily'（今天已經去過他家）｜'blocked'｜'not_friend'｜'self'
create or replace function public.pet_return_visit(p_to uuid) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_to = me then return 'self'; end if;
  if public.is_blocked(me, p_to) then return 'blocked'; end if;
  if not public.is_friend(me, p_to) then return 'not_friend'; end if;
  insert into pet_visits(from_user, to_user) values (me, p_to) on conflict do nothing;
  if not found then return 'daily'; end if;
  insert into notifications(user_id, actor_id, type) values (p_to, me, 'pet_visit');
  return 'ok';
end $$;
revoke all on function public.pet_return_visit(uuid) from public, anon;
grant execute on function public.pet_return_visit(uuid) to authenticated;

create or replace function public.claim_pet_visits() returns table(from_user uuid, from_name text, pet_name text)
language plpgsql security definer set search_path = public as $$
begin
  return query
    with c as (
      update pet_visits v set claimed = true
      where v.to_user = auth.uid() and not v.claimed and not public.is_blocked(v.to_user, v.from_user)
      returning v.from_user)
    select c.from_user, coalesce(p.display_name, p.handle), p.pet_name from c left join profiles p on p.id = c.from_user;
end $$;
revoke all on function public.claim_pet_visits() from public, anon;
grant execute on function public.claim_pet_visits() to authenticated;

-- ── 3) 小隊地圖上的夥伴外觀 ──
-- pet 欄（emoji）留著給舊版 App；新版另外送 pet_look = {"s":階段 0-6,"h":帽子,"a":配件}
alter table public.team_presence add column if not exists pet_look jsonb;
alter table public.team_presence drop constraint if exists team_presence_pet_look_size;
alter table public.team_presence add constraint team_presence_pet_look_size check (pet_look is null or pg_column_size(pet_look) <= 200);
-- 舊的 9 個參數版本要先拿掉：多一個有預設值的參數會變成兩個同名函式，PostgREST 會說選不出來
drop function if exists public.upsert_team_presence(uuid, boolean, boolean, double precision, double precision, real, text, text, text);
create or replace function public.upsert_team_presence(
  p_team uuid, p_ready boolean, p_recording boolean,
  p_lat double precision default null, p_lon double precision default null, p_heading real default null,
  p_name text default null, p_avatar text default null, p_pet text default null, p_pet_look jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_team_member(p_team, auth.uid()) then
    raise exception 'not team member';
  end if;
  insert into team_presence(team_id, user_id, ready, recording, lat, lon, heading, name, avatar, pet, pet_look, updated_at)
    values (p_team, auth.uid(), coalesce(p_ready,false), coalesce(p_recording,false),
            p_lat, p_lon, p_heading, p_name, p_avatar, p_pet, p_pet_look, now())
  on conflict (team_id, user_id) do update set
    ready = coalesce(p_ready,false), recording = coalesce(p_recording,false),
    lat = p_lat, lon = p_lon, heading = p_heading,
    name     = coalesce(p_name,     team_presence.name),
    avatar   = coalesce(p_avatar,   team_presence.avatar),
    pet      = coalesce(p_pet,      team_presence.pet),
    pet_look = coalesce(p_pet_look, team_presence.pet_look),
    updated_at = now();
end $$;
grant execute on function public.upsert_team_presence(uuid, boolean, boolean, double precision, double precision, real, text, text, text, jsonb) to authenticated;

-- ── 4) 送果實（phase9）補上封鎖／好友檢查 ──
create or replace function public.send_pet_gift(p_to uuid, p_n int) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_to = auth.uid() then return false; end if;
  if public.is_blocked(auth.uid(), p_to) or not public.is_friend(auth.uid(), p_to) then return false; end if;
  -- 每天對同一位好友限送一次（以台北日期為準）
  if exists (select 1 from pet_gifts where from_user = auth.uid() and to_user = p_to
             and (created_at at time zone 'Asia/Taipei')::date = (now() at time zone 'Asia/Taipei')::date) then
    return false;
  end if;
  insert into pet_gifts(from_user, to_user, berries) values (auth.uid(), p_to, greatest(1, least(p_n, 10)));
  insert into notifications(user_id, actor_id, type) values (p_to, auth.uid(), 'gift');
  return true;
end $$;
