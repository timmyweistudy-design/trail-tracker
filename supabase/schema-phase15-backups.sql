-- 雲端備份（Premium 跨裝置同步）。每位使用者一列。可重複執行。
create table if not exists public.backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.backups enable row level security;
drop policy if exists backups_rw on public.backups;
create policy backups_rw on public.backups for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
