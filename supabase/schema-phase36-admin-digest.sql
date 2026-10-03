-- 管理提醒：每天早上 9 點（台灣）檢查一次，過去 24 小時有「新的檢舉」或「新的錯誤」，就給每位管理員發一則
-- type='admin' 的通知（App 通知頁＋推播），點了直接開管理頁。沒有新東西就不發，不會每天吵。
-- 使用條款寫了「24 小時內處理檢舉」，靠這個提醒才守得住。
-- 要先跑過 schema-phase33-admin.sql（app_admins、trail_report_flags）。需要 pg_cron（留守人 phase31 已經開過）。可重複執行。

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow','like','comment','team','gift','mention','follow_req','follow_ok','guard','guard_ext','overdue','safe','admin'));

create or replace function public.admin_digest() returns int
language plpgsql security definer set search_path = public as $$
declare n_flags int; n_errs int; n_sent int := 0;
begin
  select (select count(*) from trail_report_flags where created_at > now() - interval '24 hours')
       + (select count(*) from reports where created_at > now() - interval '24 hours')
    into n_flags;
  -- 錯誤：過去 24 小時出現、而且之前 7 天沒出現過的「新種類」錯誤（老問題不重複吵）
  select count(distinct e.message) into n_errs from client_errors e
   where e.created_at > now() - interval '24 hours'
     and not exists (select 1 from client_errors o where o.message = e.message
                      and o.created_at <= now() - interval '24 hours' and o.created_at > now() - interval '8 days');
  if n_flags = 0 and n_errs = 0 then return 0; end if;
  insert into notifications(user_id, actor_id, type)
    select a.user_id, null, 'admin' from app_admins a
     where not exists (select 1 from notifications x where x.user_id = a.user_id and x.type = 'admin' and x.created_at > now() - interval '20 hours');
  get diagnostics n_sent = row_count;
  return n_sent;
end $$;
revoke all on function public.admin_digest() from public, anon, authenticated;

-- 每天 01:00 UTC＝台灣 09:00
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'tt-admin-digest';
    perform cron.schedule('tt-admin-digest', '0 1 * * *', 'select public.admin_digest()');
  else
    raise notice 'pg_cron 沒開：管理提醒不會自動發（Database → Extensions 打開 pg_cron 後重跑這支）';
  end if;
end $$;
