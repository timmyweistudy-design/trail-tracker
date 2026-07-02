-- Phase 18：追蹤需對方同意（預設開啟，設定可關閉）。可重複執行。
-- 流程：A 按追蹤 → 若 B 開啟審核（預設）→ 建立 follow_requests + 通知 B；
--       B 在通知按「同意」→ 寫入 follows、刪請求、通知 A；「拒絕」→ 只刪請求。
--       若 B 關閉審核 → 直接寫入 follows（與舊行為相同）。

-- 個人設定：是否需要審核追蹤（預設需要）
alter table public.profiles add column if not exists follow_approval boolean not null default true;

-- 追蹤請求
create table if not exists public.follow_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (requester_id, target_id)
);
create index if not exists idx_freq_target on public.follow_requests (target_id, created_at desc);

alter table public.follow_requests enable row level security;
drop policy if exists freq_select on public.follow_requests;
create policy freq_select on public.follow_requests for select to authenticated
  using (requester_id = auth.uid() or target_id = auth.uid());
drop policy if exists freq_delete on public.follow_requests;
create policy freq_delete on public.follow_requests for delete to authenticated
  using (requester_id = auth.uid() or target_id = auth.uid());
-- insert 一律走 request_follow()（security definer），避免繞過對方的審核設定

-- 通知型別加上 follow_req（請求）與 follow_ok（同意）
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow','like','comment','team','gift','mention','follow_req','follow_ok'));

-- 申請追蹤：對方關閉審核→直接追蹤；開啟→建立請求＋通知。回傳 'followed' | 'requested' | 'self'
create or replace function public.request_follow(p_target uuid) returns text
language plpgsql security definer set search_path = public as $$
declare need boolean;
begin
  if p_target = auth.uid() then return 'self'; end if;
  select coalesce(follow_approval, true) into need from profiles where id = p_target;
  if need is null then need := true; end if;
  if exists (select 1 from follows where follower_id = auth.uid() and following_id = p_target) then
    return 'followed';
  end if;
  if not need then
    insert into follows(follower_id, following_id) values (auth.uid(), p_target) on conflict do nothing;
    return 'followed';
  end if;
  if not exists (select 1 from follow_requests where requester_id = auth.uid() and target_id = p_target) then
    insert into follow_requests(requester_id, target_id) values (auth.uid(), p_target);
    insert into notifications(user_id, actor_id, type) values (p_target, auth.uid(), 'follow_req');
  end if;
  return 'requested';
end $$;

-- 同意追蹤請求（被追蹤者執行）：寫入 follows、刪請求、通知請求者
create or replace function public.approve_follow(p_requester uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from follow_requests where requester_id = p_requester and target_id = auth.uid()) then
    return false;
  end if;
  insert into follows(follower_id, following_id) values (p_requester, auth.uid()) on conflict do nothing;
  delete from follow_requests where requester_id = p_requester and target_id = auth.uid();
  insert into notifications(user_id, actor_id, type) values (p_requester, auth.uid(), 'follow_ok');
  return true;
end $$;

-- 拒絕追蹤請求（被追蹤者執行）
create or replace function public.decline_follow(p_requester uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from follow_requests where requester_id = p_requester and target_id = auth.uid();
  return true;
end $$;

grant execute on function public.request_follow(uuid) to authenticated;
grant execute on function public.approve_follow(uuid) to authenticated;
grant execute on function public.decline_follow(uuid) to authenticated;
