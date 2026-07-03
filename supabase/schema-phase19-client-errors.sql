-- Phase 19：前端錯誤自動上報。可重複執行。
-- 使用者手機上發生的 JS 錯誤自動上傳（已登入者），開發者在 SQL Editor 查：
--   select created_at, message, app_ver, ua from client_errors order by created_at desc limit 100;

create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  message text not null check (char_length(message) <= 500),
  app_ver text,
  ua text,
  happened_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_cerr_created on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;
-- 已登入者可新增自己的錯誤；不開放前端讀取（開發者從後台看）
drop policy if exists cerr_insert on public.client_errors;
create policy cerr_insert on public.client_errors for insert to authenticated
  with check (user_id = auth.uid());

-- 保留 30 天即可（可選：在後台排程刪除舊資料）
-- delete from client_errors where created_at < now() - interval '30 days';
