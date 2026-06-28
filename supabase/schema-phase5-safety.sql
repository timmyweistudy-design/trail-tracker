-- 內容安全：封鎖（雙向隱形）+ 檢舉。可重複執行。

-- 封鎖
create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.blocks enable row level security;
drop policy if exists blocks_select on public.blocks;
create policy blocks_select on public.blocks for select to authenticated using (blocker_id = auth.uid());
drop policy if exists blocks_insert on public.blocks;
create policy blocks_insert on public.blocks for insert to authenticated with check (blocker_id = auth.uid());
drop policy if exists blocks_delete on public.blocks;
create policy blocks_delete on public.blocks for delete to authenticated using (blocker_id = auth.uid());

-- 任一方向封鎖即視為封鎖
create or replace function public.is_blocked(a uuid, b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

-- 把封鎖納入貼文可見性（雙向隱形）：更新既有 can_see_post，所有 posts/comments/likes 的 RLS 自動套用
create or replace function public.can_see_post(p_author uuid, p_visibility text) returns boolean language sql stable security definer set search_path = public as $$
  select (not public.is_blocked(auth.uid(), p_author))
     and (p_visibility = 'public'
       or p_author = auth.uid()
       or (p_visibility = 'friends' and public.is_friend(auth.uid(), p_author)));
$$;

-- 檢舉（僅儲存，供管理者用 SQL Editor 檢視；一般使用者讀不到）
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.posts(id) on delete set null,
  reported_user uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated with check (reporter_id = auth.uid());
