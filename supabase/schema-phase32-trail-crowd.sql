-- 步道人氣（擁擠熱度）：「最近 7 天 12 人走過」「週六上午最熱鬧」。可重複執行。
--
-- 資料來源：登入的使用者走完一條步道（真實記錄，不含模擬、上車），App 匿名送一筆「哪條步道、幾點出發、走多久」。
-- 不送軌跡、不送位置。使用者可以在設定關掉。
-- 隱私：
--   1. 只回聚合數字，不回任何 user_id。
--   2. 人數少於 3 人就回 0（k-匿名），不然「近 7 天 1 人走過」等於公開某個人的行蹤。
--   3. 星期×時段的熱度圖：一年內少於 5 人走過就整張不給；給的時候也只給 0–4 的等級，不給次數。
-- security definer：未登入的訪客也看得到統計（但讀不到原始資料表）。

create table if not exists public.trail_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trail_id text not null check (char_length(trail_id) between 1 and 80),
  started_at timestamptz not null,
  duration_min int check (duration_min is null or duration_min between 1 and 4320),
  created_at timestamptz not null default now(),
  unique (user_id, trail_id, started_at)
);
create index if not exists trail_visits_trail_idx on public.trail_visits (trail_id, started_at desc);

alter table public.trail_visits enable row level security;
drop policy if exists tv_insert on public.trail_visits;
create policy tv_insert on public.trail_visits for insert to authenticated with check (user_id = auth.uid());
drop policy if exists tv_select on public.trail_visits;
create policy tv_select on public.trail_visits for select to authenticated using (user_id = auth.uid());
drop policy if exists tv_delete on public.trail_visits;
create policy tv_delete on public.trail_visits for delete to authenticated using (user_id = auth.uid());

-- 防灌水：出發時間要在 3 天內；一人一天最多 30 筆
create or replace function public.trail_visits_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.started_at > now() + interval '10 minutes' or new.started_at < now() - interval '3 days' then
    raise exception 'started_at out of range';
  end if;
  if (select count(*) from trail_visits where user_id = new.user_id and created_at > now() - interval '1 day') >= 30 then
    raise exception 'rate limit: too many visits today';
  end if;
  return new;
end $$;
drop trigger if exists trail_visits_guard on public.trail_visits;
create trigger trail_visits_guard before insert on public.trail_visits
  for each row execute function public.trail_visits_guard();

-- 一條步道的人氣：近 7 天／30 天人數（加上公開貼文裡走過這條的人），與一年內「星期×時段」熱度等級
-- grid：28 格，索引 = 星期(0=週一 … 6=週日) × 4 + 時段(0=清晨 <8 點, 1=上午 8–11, 2=中午 11–14, 3=下午 14 點後)，台灣時間
create or replace function public.trail_crowd(p_trail text)
returns table (hikers7 int, hikers30 int, year_hikers int, grid int[])
language sql stable security definer set search_path = public as $$
  with v as (
    select user_id, started_at from trail_visits where trail_id = p_trail and started_at > now() - interval '365 days'
  ), p as (
    select author_id as user_id, coalesce(hiked_on::timestamptz, created_at) as started_at
    from posts where trail_id = p_trail and visibility = 'public' and hidden = false
      and coalesce(hiked_on, created_at::date) > current_date - 31
  ), allv as (select * from v union all select * from p),
  cnt as (
    select count(distinct user_id) filter (where started_at > now() - interval '7 days')::int as h7,
           count(distinct user_id) filter (where started_at > now() - interval '30 days')::int as h30
    from allv
  ), yr as (select count(distinct user_id)::int as n from v),
  cells as (
    select ((extract(isodow from started_at at time zone 'Asia/Taipei')::int - 1) * 4 +
            case when extract(hour from started_at at time zone 'Asia/Taipei') < 8 then 0
                 when extract(hour from started_at at time zone 'Asia/Taipei') < 11 then 1
                 when extract(hour from started_at at time zone 'Asia/Taipei') < 14 then 2 else 3 end) as k,
           count(*)::int as c
    from v group by 1
  ), mx as (select greatest(max(c), 1) as m from cells)
  select case when cnt.h7 >= 3 then cnt.h7 else 0 end,
         case when cnt.h30 >= 3 then cnt.h30 else 0 end,
         case when yr.n >= 5 then yr.n else 0 end,
         case when yr.n >= 5 then
           (select array_agg(coalesce((select ceil(4.0 * c / mx.m)::int from cells where cells.k = g), 0) order by g)
            from generate_series(0, 27) g)
         end
  from cnt, yr, mx;
$$;
grant execute on function public.trail_crowd(text) to anon, authenticated;
