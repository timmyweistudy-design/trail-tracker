-- 管理後台：處理檢舉（貼文、山友路況回報）、看使用者手機上的錯誤。可重複執行。
-- 管理員＝app_admins 表裡的人（預設放開發者帳號 gatherthetrail@gmail.com）。
-- App 裡的入口：測試面板 →「管理」（只有管理員看得到資料，別人叫得到函式也只會被擋）。

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;   -- 不開任何 policy：前端讀不到也寫不了
insert into public.app_admins(user_id)
  select id from auth.users where lower(email) = 'gatherthetrail@gmail.com'
  on conflict do nothing;

create or replace function public.is_app_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from app_admins where user_id = auth.uid());
$$;
grant execute on function public.is_app_admin() to authenticated;

-- ── 山友路況回報的檢舉：一人一則一次；3 個人檢舉就先自動藏起來，等管理員看 ──
create table if not exists public.trail_report_flags (
  report_id uuid not null references public.trail_reports(id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (report_id, reporter_id)
);
alter table public.trail_report_flags enable row level security;
drop policy if exists trf_insert on public.trail_report_flags;
create policy trf_insert on public.trail_report_flags for insert to authenticated
  with check (reporter_id = auth.uid());
drop policy if exists trf_select on public.trail_report_flags;
create policy trf_select on public.trail_report_flags for select to authenticated
  using (reporter_id = auth.uid());

create or replace function public.trail_report_flags_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from trail_report_flags where report_id = new.report_id) >= 3 then
    update trail_reports set hidden = true where id = new.report_id;
  end if;
  return null;
end $$;
drop trigger if exists trail_report_flags_after on public.trail_report_flags;
create trigger trail_report_flags_after after insert on public.trail_report_flags
  for each row execute function public.trail_report_flags_after();

-- 一般使用者不能自己改 hidden（跟貼文的 phase25 一樣用 trigger 擋）
create or replace function public.protect_trail_report_hidden() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.hidden is distinct from old.hidden and current_user in ('authenticated', 'anon') and not public.is_app_admin() then
    raise exception 'not allowed';
  end if;
  return new;
end $$;
drop trigger if exists protect_trail_report_hidden on public.trail_reports;
create trigger protect_trail_report_hidden before update on public.trail_reports
  for each row execute function public.protect_trail_report_hidden();

-- ── 管理員用的函式（非管理員呼叫一律丟錯） ──
create or replace function public.admin_guard() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'admin only'; end if;
end $$;

-- 待處理：被檢舉過的路況回報（含已自動藏起來的）＋被檢舉的貼文
create or replace function public.admin_queue()
returns table (kind text, id uuid, created_at timestamptz, author text, body text, trail text, flags int, reasons text, hidden boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return query
    select 'report'::text, r.id, r.created_at, coalesce(nullif(p.display_name, ''), p.handle, '?'),
           concat_ws(' ', r.kind, r.note), r.trail_id, count(f.*)::int,
           string_agg(distinct f.reason, ' / '), r.hidden
    from trail_reports r join trail_report_flags f on f.report_id = r.id
    left join profiles p on p.id = r.author_id
    group by r.id, p.display_name, p.handle
    union all
    select 'post'::text, po.id, po.created_at, coalesce(nullif(p.display_name, ''), p.handle, '?'),
           left(coalesce(po.caption, ''), 200), po.trail_name, count(rp.*)::int,
           string_agg(distinct rp.reason, ' / '), po.hidden
    from posts po join reports rp on rp.post_id = po.id
    left join profiles p on p.id = po.author_id
    group by po.id, p.display_name, p.handle
    order by 3 desc
    limit 100;
end $$;

create or replace function public.admin_set_hidden(p_kind text, p_id uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if p_kind = 'report' then
    update trail_reports set hidden = p_hidden where id = p_id;
  elsif p_kind = 'post' then
    update posts set hidden = p_hidden where id = p_id;   -- security definer：current_user 是擁有者，貼文 hidden 的保護 trigger 會放行
  else
    raise exception 'unknown kind';
  end if;
end $$;

-- 錯誤：最近 7 天依訊息分組，最多 50 種
create or replace function public.admin_errors(p_days int default 7)
returns table (message text, n int, users int, last_at timestamptz, app_ver text, ua text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard();
  return query
    select e.message, count(*)::int, count(distinct e.user_id)::int, max(e.created_at),
           (array_agg(e.app_ver order by e.created_at desc))[1], (array_agg(e.ua order by e.created_at desc))[1]
    from client_errors e
    where e.created_at > now() - make_interval(days => p_days)
    group by e.message
    order by 2 desc
    limit 50;
end $$;

revoke all on function public.admin_guard() from public, anon;
revoke all on function public.admin_queue() from public, anon;
revoke all on function public.admin_set_hidden(text, uuid, boolean) from public, anon;
revoke all on function public.admin_errors(int) from public, anon;
grant execute on function public.admin_queue() to authenticated;
grant execute on function public.admin_set_hidden(text, uuid, boolean) to authenticated;
grant execute on function public.admin_errors(int) to authenticated;

-- 錯誤紀錄只留 30 天（有 pg_cron 就每天清一次）
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'tt-errors-cleanup';
    perform cron.schedule('tt-errors-cleanup', '15 4 * * *', 'delete from public.client_errors where created_at < now() - interval ''30 days''');
  end if;
end $$;
