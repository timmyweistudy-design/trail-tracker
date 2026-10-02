-- 山社：長期的登山同好會（小隊是「這一趟一起走」，山社是「平常一起爬的那群人」）。可重複執行。
-- 公開山社任何人都搜得到、按一下就加入；不公開的要加入碼。成員看得到：成員名單、本週排行、成員的貼文。
-- 本週排行只算「呼叫的人本來就看得到」的貼文（can_see_post），不會因為同一個山社就看到別人只給好友看的內容。
-- 全部寫入都走下面的函式（表本身不開 insert/update/delete policy）。

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 30),
  about text check (about is null or char_length(about) <= 200),
  region text check (region is null or char_length(region) <= 20),
  is_public boolean not null default true,
  owner uuid references auth.users(id) on delete set null,
  join_code text unique not null,
  created_at timestamptz not null default now()
);
create table if not exists public.club_members (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index if not exists idx_club_members_user on public.club_members(user_id);

create or replace function public.is_club_member(p_club uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from club_members where club_id = p_club and user_id = auth.uid());
$$;

alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
drop policy if exists clubs_select on public.clubs;
create policy clubs_select on public.clubs for select to authenticated using (is_public or public.is_club_member(id));
drop policy if exists club_members_select on public.club_members;
create policy club_members_select on public.club_members for select to authenticated using (public.is_club_member(club_id));

-- 加入碼只給成員看：表上不開放讀 join_code 這欄，成員從 club_list 拿
revoke all on public.clubs, public.club_members from anon;
revoke insert, update, delete on public.clubs, public.club_members from authenticated;
revoke select on public.clubs from authenticated;
grant select (id, name, about, region, is_public, owner, created_at) on public.clubs to authenticated;

-- 我的山社＋公開山社（可搜尋名稱、地區）
create or replace function public.club_list(p_q text default null)
returns table (id uuid, name text, about text, region text, is_public boolean, members int, is_member boolean, my_role text, join_code text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.about, c.region, c.is_public,
         (select count(*)::int from club_members m where m.club_id = c.id),
         me.user_id is not null, me.role,
         case when me.user_id is not null then c.join_code end,
         c.created_at
  from clubs c
  left join club_members me on me.club_id = c.id and me.user_id = auth.uid()
  where auth.uid() is not null
    and (me.user_id is not null
         or (c.is_public and (coalesce(btrim(p_q), '') = ''
             or c.name ilike '%' || btrim(p_q) || '%' or c.region ilike '%' || btrim(p_q) || '%')))
  order by me.user_id is null, 6 desc, c.created_at desc
  limit 60;
$$;

create or replace function public.create_club(p_name text, p_about text, p_region text, p_public boolean, p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if (select count(*) from clubs where owner = auth.uid()) >= 3 then raise exception 'club limit'; end if;
  insert into clubs(name, about, region, is_public, owner, join_code)
    values (btrim(p_name), nullif(btrim(coalesce(p_about, '')), ''), nullif(btrim(coalesce(p_region, '')), ''), coalesce(p_public, true), auth.uid(), upper(p_code))
    returning id into cid;
  insert into club_members(club_id, user_id, role) values (cid, auth.uid(), 'owner');
  return cid;
end $$;

-- 加入：公開山社用 id，不公開的用加入碼。最多加入 20 個。
create or replace function public._club_join(cid uuid) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from club_members where club_id = cid and user_id = auth.uid()) then return cid; end if;
  if (select count(*) from club_members where user_id = auth.uid()) >= 20 then raise exception 'join limit'; end if;
  insert into club_members(club_id, user_id) values (cid, auth.uid());
  return cid;
end $$;
create or replace function public.join_club(p_club uuid) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from clubs where id = p_club and is_public) then return null; end if;
  return public._club_join(p_club);
end $$;
create or replace function public.join_club_by_code(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into cid from clubs where join_code = upper(btrim(p_code));
  if cid is null then return null; end if;
  return public._club_join(cid);
end $$;

-- 退出：社長退出時交給最早加入的成員；沒有其他人就整個山社刪掉
create or replace function public.leave_club(p_club uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare nxt uuid;
begin
  if not exists (select 1 from club_members where club_id = p_club and user_id = auth.uid()) then return false; end if;
  delete from club_members where club_id = p_club and user_id = auth.uid();
  if exists (select 1 from clubs where id = p_club and owner = auth.uid()) then
    select user_id into nxt from club_members where club_id = p_club order by joined_at limit 1;
    if nxt is null then delete from clubs where id = p_club;
    else update clubs set owner = nxt where id = p_club; update club_members set role = 'owner' where club_id = p_club and user_id = nxt;
    end if;
  end if;
  return true;
end $$;

create or replace function public.kick_club_member(p_club uuid, p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_user = auth.uid() or not exists (select 1 from clubs where id = p_club and owner = auth.uid()) then return false; end if;
  delete from club_members where club_id = p_club and user_id = p_user;
  return found;
end $$;

create or replace function public.delete_club(p_club uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from clubs where id = p_club and owner = auth.uid();
  return found;
end $$;

-- 成員名單（成員才看得到）
create or replace function public.club_roster(p_club uuid)
returns table (user_id uuid, handle text, display_name text, avatar_url text, role text, joined_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_club_member(p_club) then raise exception 'members only'; end if;
  return query select m.user_id, p.handle, p.display_name, p.avatar_url, m.role, m.joined_at
    from club_members m left join profiles p on p.id = m.user_id
    where m.club_id = p_club order by m.role = 'owner' desc, m.joined_at;
end $$;

-- 本週排行：最近 p_days 天，成員發過的貼文（呼叫的人看得到、沒被藏）加總
create or replace function public.club_board(p_club uuid, p_days int default 7)
returns table (user_id uuid, handle text, display_name text, avatar_url text, km numeric, hikes int, ascent int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_club_member(p_club) then raise exception 'members only'; end if;
  return query
    select m.user_id, p.handle, p.display_name, p.avatar_url,
           round(coalesce(sum(po.distance_km), 0), 1), count(po.id)::int, coalesce(sum(po.ascent), 0)::int
    from club_members m
    left join profiles p on p.id = m.user_id
    left join posts po on po.author_id = m.user_id and po.hidden = false
         and coalesce(po.hiked_on, po.created_at::date) >= current_date - (greatest(1, least(p_days, 31)) - 1)
         and public.can_see_post(po.author_id, po.visibility)
    where m.club_id = p_club
    group by m.user_id, p.handle, p.display_name, p.avatar_url
    order by 5 desc, 6 desc, p.handle
    limit 100;
end $$;

revoke all on function public._club_join(uuid) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['club_list(text)', 'create_club(text,text,text,boolean,text)', 'join_club(uuid)', 'join_club_by_code(text)',
                           'leave_club(uuid)', 'kick_club_member(uuid,uuid)', 'delete_club(uuid)', 'club_roster(uuid)', 'club_board(uuid,int)', 'is_club_member(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
