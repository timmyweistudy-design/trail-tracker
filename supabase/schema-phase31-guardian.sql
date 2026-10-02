-- 留守人：出發前設定「預計下山時間」和留守人（互相追蹤的好友，最多 5 位）。
-- 超過預計時間 30 分鐘還沒按結束 → 通知留守人，附上最後回報的位置；之後平安結束會再通知一次「平安下山」。
-- 可重複執行。在 Supabase SQL Editor 執行一次即可。
--
-- 會用到：
--   1. pg_cron（Supabase：Database → Extensions → pg_cron 打開）。每 5 分鐘檢查一次誰超時。
--      沒開也能用：留守人打開 App 時會順手檢查（但就不會「自己」準時跳通知）。
--   2. send-push Edge Function（schema-phase4 那支）要重新部署一次，推播文字才認得新的通知類型。

create table if not exists public.trip_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trail_id text,
  trail_name text check (trail_name is null or char_length(trail_name) <= 120),
  expected_at timestamptz not null,
  guardians uuid[] not null check (cardinality(guardians) between 1 and 5),
  status text not null default 'active' check (status in ('active','done','cancelled','overdue')),
  last_lat double precision check (last_lat is null or last_lat between -90 and 90),
  last_lon double precision check (last_lon is null or last_lon between -180 and 180),
  last_at timestamptz,
  alerted_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists trip_plans_due_idx on public.trip_plans (expected_at) where status = 'active';
create index if not exists trip_plans_guard_idx on public.trip_plans using gin (guardians);
create index if not exists trip_plans_owner_idx on public.trip_plans (owner_id, created_at desc);

alter table public.trip_plans enable row level security;

-- 看：自己的，或自己是留守人的
drop policy if exists tp_select on public.trip_plans;
create policy tp_select on public.trip_plans for select to authenticated
  using (owner_id = auth.uid() or auth.uid() = any(guardians));
drop policy if exists tp_insert on public.trip_plans;
create policy tp_insert on public.trip_plans for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists tp_update on public.trip_plans;
create policy tp_update on public.trip_plans for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists tp_delete on public.trip_plans;
create policy tp_delete on public.trip_plans for delete to authenticated
  using (owner_id = auth.uid());
-- 本人只能改這幾欄（不能自己清掉 alerted_at、不能改留守人名單）
revoke update on public.trip_plans from authenticated;
grant update (expected_at, last_lat, last_lon, last_at, status, ended_at) on public.trip_plans to authenticated;

-- 通知：多一欄指向行程；類型加上 guard（被指定為留守人）、guard_ext（延後下山）、overdue（超時）、safe（平安下山）
alter table public.notifications add column if not exists plan_id uuid references public.trip_plans(id) on delete cascade;
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow','like','comment','team','gift','mention','follow_req','follow_ok','guard','guard_ext','overdue','safe'));

-- 新增：留守人只能是互相追蹤的好友；同一人同時只留一個進行中的行程；通知每位留守人
create or replace function public.trip_plans_before_ins() returns trigger
language plpgsql security definer set search_path = public as $$
declare g uuid; ok uuid[] := '{}';
begin
  foreach g in array new.guardians loop
    if g <> new.owner_id and public.is_friend(new.owner_id, g) and not (g = any(ok)) then ok := ok || g; end if;
  end loop;
  if cardinality(ok) = 0 then raise exception 'guardian must be a mutual friend'; end if;
  new.guardians := ok;
  new.status := 'active'; new.alerted_at := null; new.ended_at := null;
  if new.expected_at < now() - interval '5 minutes' or new.expected_at > now() + interval '3 days' then
    raise exception 'expected time out of range';
  end if;
  update trip_plans set status = 'cancelled', ended_at = now()
    where owner_id = new.owner_id and status in ('active','overdue');
  return new;
end $$;
drop trigger if exists trip_plans_before_ins on public.trip_plans;
create trigger trip_plans_before_ins before insert on public.trip_plans
  for each row execute function public.trip_plans_before_ins();

create or replace function public.trip_plans_after_ins() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications(user_id, actor_id, type, plan_id)
    select g, new.owner_id, 'guard', new.id from unnest(new.guardians) g;
  return null;
end $$;
drop trigger if exists trip_plans_after_ins on public.trip_plans;
create trigger trip_plans_after_ins after insert on public.trip_plans
  for each row execute function public.trip_plans_after_ins();

-- 更新：本人不能把狀態改成 overdue（只有系統檢查能）；延後時間會重新計時；
-- 已經通知過超時的，之後結束 → 通知「平安下山」，延後 → 通知「延後下山」
create or replace function public.trip_plans_before_upd() returns trigger
language plpgsql security definer set search_path = public as $$
declare sys boolean := coalesce(current_setting('tt.sys', true), '') = '1';
begin
  if not sys then
    if new.status = 'overdue' and old.status <> 'overdue' then raise exception 'not allowed'; end if;
    if old.status in ('done','cancelled') and new.status <> old.status then raise exception 'plan already ended'; end if;
    if new.expected_at is distinct from old.expected_at then
      if new.expected_at < now() or new.expected_at > now() + interval '3 days' then raise exception 'expected time out of range'; end if;
      if old.status = 'overdue' then new.status := 'active'; end if;
      new.alerted_at := null;   -- 新時間再超過還會再通知
    end if;
    if new.status in ('done','cancelled') and old.status not in ('done','cancelled') then new.ended_at := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists trip_plans_before_upd on public.trip_plans;
create trigger trip_plans_before_upd before update on public.trip_plans
  for each row execute function public.trip_plans_before_upd();

create or replace function public.trip_plans_after_upd() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.alerted_at is not null and new.status = 'done' and old.status <> 'done' then
    insert into notifications(user_id, actor_id, type, plan_id)
      select g, new.owner_id, 'safe', new.id from unnest(new.guardians) g;
  elsif old.alerted_at is not null and new.expected_at is distinct from old.expected_at and new.status = 'active' then
    insert into notifications(user_id, actor_id, type, plan_id)
      select g, new.owner_id, 'guard_ext', new.id from unnest(new.guardians) g;
  end if;
  return null;
end $$;
drop trigger if exists trip_plans_after_upd on public.trip_plans;
create trigger trip_plans_after_upd after update on public.trip_plans
  for each row execute function public.trip_plans_after_upd();

-- 檢查超時（pg_cron 每 5 分鐘跑；留守人開 App 時也會呼叫）。只動「真的超時」的行程，誰呼叫都一樣。
create or replace function public.trip_plans_check() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  perform set_config('tt.sys', '1', true);
  for r in select id, owner_id, guardians from trip_plans
           where status = 'active' and alerted_at is null and expected_at < now() - interval '30 minutes'
           for update skip locked loop
    update trip_plans set status = 'overdue', alerted_at = now() where id = r.id;
    insert into notifications(user_id, actor_id, type, plan_id)
      select g, r.owner_id, 'overdue', r.id from unnest(r.guardians) g;
    n := n + 1;
  end loop;
  -- 超過預計時間 3 天還掛著的，自動收掉（不再出現在留守人清單）
  update trip_plans set status = 'cancelled', ended_at = now()
    where status in ('active','overdue') and expected_at < now() - interval '3 days';
  perform set_config('tt.sys', '', true);
  return n;
end $$;
revoke all on function public.trip_plans_check() from public, anon;
grant execute on function public.trip_plans_check() to authenticated;

-- 我是留守人的行程（進行中、超時，或 24 小時內結束的），附上本人名字頭像
create or replace function public.guard_plans(p_id uuid default null)
returns table (id uuid, owner_id uuid, owner_name text, owner_avatar text, trail_id text, trail_name text,
               expected_at timestamptz, status text, last_lat double precision, last_lon double precision,
               last_at timestamptz, alerted_at timestamptz, ended_at timestamptz, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform public.trip_plans_check();
  return query
    select t.id, t.owner_id, coalesce(nullif(p.display_name, ''), p.handle, '山友'), p.avatar_url, t.trail_id, t.trail_name,
           t.expected_at, t.status, t.last_lat, t.last_lon, t.last_at, t.alerted_at, t.ended_at, t.created_at
    from trip_plans t left join profiles p on p.id = t.owner_id
    where auth.uid() = any(t.guardians)
      and (p_id is null or t.id = p_id)
      and (p_id is not null or t.status in ('active','overdue') or t.ended_at > now() - interval '24 hours')
    order by (t.status = 'overdue') desc, t.expected_at asc
    limit 20;
end $$;
revoke all on function public.guard_plans(uuid) from public, anon;
grant execute on function public.guard_plans(uuid) to authenticated;

-- 排程：有 pg_cron 就每 5 分鐘檢查一次（重跑這支 SQL 不會重複排）
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'tt-trip-check';
    perform cron.schedule('tt-trip-check', '*/5 * * * *', 'select public.trip_plans_check()');
  else
    raise notice 'pg_cron 不可用：超時通知只會在留守人打開 App 時觸發';
  end if;
end $$;
