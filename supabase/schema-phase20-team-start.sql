-- Phase 20：小隊開始訊號落地資料庫（可靠版）。可重複執行。
-- 之前用 Realtime broadcast 傳「開始」，隊員手機背景/重連瞬間就會漏接。
-- 改為：隊長開始 → 寫入 team_starts → 隊員靠 postgres_changes 即時收 + 每 5 秒輪詢補收，怎樣都收得到。

create table if not exists public.team_starts (
  team_id uuid primary key references public.teams(id) on delete cascade,
  started_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now()
);

alter table public.team_starts enable row level security;
-- 隊員可讀自己小隊的開始訊號
drop policy if exists ts_select on public.team_starts;
create policy ts_select on public.team_starts for select to authenticated
  using (public.is_team_member(team_id, auth.uid()));
-- 寫入一律走 RPC（security definer 檢查隊長身分）

-- 隊長按開始：寫入/覆蓋這個小隊的開始時間
create or replace function public.team_start(p_team uuid) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare t timestamptz;
begin
  if not exists (select 1 from teams where id = p_team and owner = auth.uid()) then
    raise exception 'not team owner';
  end if;
  insert into team_starts(team_id, started_by, started_at) values (p_team, auth.uid(), now())
    on conflict (team_id) do update set started_by = auth.uid(), started_at = now();
  select started_at into t from team_starts where team_id = p_team;
  return t;
end $$;
grant execute on function public.team_start(uuid) to authenticated;

-- Realtime：隊員訂閱 team_starts 的變更即時開始
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='team_starts') then
    alter publication supabase_realtime add table public.team_starts;
  end if;
end $$;
