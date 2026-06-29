-- Web Push 訂閱表（瀏覽器推播）。可重複執行。
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_push_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists push_select on public.push_subscriptions;
create policy push_select on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
drop policy if exists push_insert on public.push_subscriptions;
create policy push_insert on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
drop policy if exists push_delete on public.push_subscriptions;
create policy push_delete on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- 注意：實際「發送」推播需要部署 Edge Function（supabase/functions/send-push）
-- 並在 Database Webhooks 設定 notifications 表 INSERT 時呼叫它。詳見該函式說明。
