-- 原生推播裝置 token（iOS APNs / Android FCM）。Web Push 用另一張 push_subscriptions。
-- 後端 send-push 讀這張表，對每個 token 發 APNs/FCM。
create table if not exists public.native_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null default 'ios',
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);
create index if not exists idx_native_push_user on public.native_push_tokens (user_id);

alter table public.native_push_tokens enable row level security;

-- 使用者只能管自己的 token；後端用 service_role 讀（繞過 RLS）
drop policy if exists nptk_select on public.native_push_tokens;
create policy nptk_select on public.native_push_tokens for select to authenticated using (user_id = auth.uid());
drop policy if exists nptk_upsert on public.native_push_tokens;
create policy nptk_upsert on public.native_push_tokens for insert to authenticated with check (user_id = auth.uid());
drop policy if exists nptk_update on public.native_push_tokens;
create policy nptk_update on public.native_push_tokens for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists nptk_delete on public.native_push_tokens;
create policy nptk_delete on public.native_push_tokens for delete to authenticated using (user_id = auth.uid());
