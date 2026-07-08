-- Phase 21：小隊改「輪詢資料庫」(REST/HTTPS) 取代 Realtime Presence WebSocket。
-- 原因：部分網路（私人DNS/VPN/代理/省電）把即時 WebSocket 頻頻砍斷（狀態 CLOSED），
-- presence 全無、互相看不到。改為每位隊員每 ~8 秒 upsert 自己的狀態，全員每 ~4 秒輪詢，
-- 只用一般 HTTPS 請求（和登入/發文同一條路，已證實可靠）。可重複執行。

create table if not exists public.team_presence (
  team_id    uuid not null references public.teams(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  ready      boolean not null default false,        -- 是否已按「準備」
  recording  boolean not null default false,        -- 是否記錄中（只有記錄中才分享位置）
  lat        double precision,                       -- 最新緯度（記錄中才帶）
  lon        double precision,                       -- 最新經度
  heading    real,                                   -- 行進方向（度）
  name       text,                                   -- 顯示名（省一次 join）
  avatar     text,
  pet        text,
  updated_at timestamptz not null default now(),     -- 最後更新：判斷是否在線 / 位置新舊
  primary key (team_id, user_id)
);

alter table public.team_presence enable row level security;

-- 同隊成員可讀彼此的即時狀態
drop policy if exists tp_select on public.team_presence;
create policy tp_select on public.team_presence for select to authenticated
  using (public.is_team_member(team_id, auth.uid()));
-- 寫入一律走 RPC（security definer 檢查是本人＋在隊上）

-- upsert 自己的即時狀態；位置只在記錄中帶（未記錄時 p_lat/p_lon 傳 null）
create or replace function public.upsert_team_presence(
  p_team uuid, p_ready boolean, p_recording boolean,
  p_lat double precision default null, p_lon double precision default null, p_heading real default null,
  p_name text default null, p_avatar text default null, p_pet text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_team_member(p_team, auth.uid()) then
    raise exception 'not team member';
  end if;
  insert into team_presence(team_id, user_id, ready, recording, lat, lon, heading, name, avatar, pet, updated_at)
    values (p_team, auth.uid(), coalesce(p_ready,false), coalesce(p_recording,false),
            p_lat, p_lon, p_heading, p_name, p_avatar, p_pet, now())
  on conflict (team_id, user_id) do update set
    ready = coalesce(p_ready,false), recording = coalesce(p_recording,false),
    lat = p_lat, lon = p_lon, heading = p_heading,
    name   = coalesce(p_name,   team_presence.name),
    avatar = coalesce(p_avatar, team_presence.avatar),
    pet    = coalesce(p_pet,    team_presence.pet),
    updated_at = now();
end $$;
grant execute on function public.upsert_team_presence(uuid, boolean, boolean, double precision, double precision, real, text, text, text) to authenticated;

-- 離開同行時清掉自己（讓別人立刻看到你離線）
create or replace function public.clear_team_presence(p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from team_presence where team_id = p_team and user_id = auth.uid();
end $$;
grant execute on function public.clear_team_presence(uuid) to authenticated;
