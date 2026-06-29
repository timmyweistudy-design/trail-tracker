-- 小隊：建立/加入小隊，記錄地圖上看到隊友定位（定位用 Realtime Presence，不入庫）。可重複執行。

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  owner uuid references auth.users(id) on delete set null,
  join_code text unique not null,
  created_at timestamptz not null default now()
);
create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
-- 內嵌成員 profile
alter table public.team_members drop constraint if exists tm_user_profile_fk;
alter table public.team_members add constraint tm_user_profile_fk foreign key (user_id) references public.profiles(id) on delete cascade;

create or replace function public.is_team_member(tid uuid, uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from team_members where team_id = tid and user_id = uid);
$$;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams for select to authenticated using (public.is_team_member(id, auth.uid()));
drop policy if exists teams_insert on public.teams;
create policy teams_insert on public.teams for insert to authenticated with check (owner = auth.uid());
drop policy if exists teams_delete on public.teams;
create policy teams_delete on public.teams for delete to authenticated using (owner = auth.uid());

drop policy if exists tm_select on public.team_members;
create policy tm_select on public.team_members for select to authenticated using (public.is_team_member(team_id, auth.uid()));
drop policy if exists tm_insert on public.team_members;
create policy tm_insert on public.team_members for insert to authenticated with check (user_id = auth.uid());
drop policy if exists tm_delete on public.team_members;
create policy tm_delete on public.team_members for delete to authenticated using (user_id = auth.uid());

-- 建立小隊（原子：建 team + 加入自己），回傳 team id
create or replace function public.create_team(p_name text, p_code text) returns uuid language plpgsql security definer set search_path = public as $$
declare tid uuid;
begin
  insert into teams(name, owner, join_code) values (p_name, auth.uid(), upper(p_code)) returning id into tid;
  insert into team_members(team_id, user_id) values (tid, auth.uid());
  return tid;
end $$;

-- 用代碼加入小隊
create or replace function public.join_team_by_code(p_code text) returns uuid language plpgsql security definer set search_path = public as $$
declare tid uuid;
begin
  select id into tid from teams where join_code = upper(p_code);
  if tid is null then return null; end if;
  insert into team_members(team_id, user_id) values (tid, auth.uid()) on conflict do nothing;
  return tid;
end $$;
