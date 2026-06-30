-- 個人頁封面照 + 置頂貼文 + PRO 徽章配色（皆使用者可自行更新）。可重複執行。
alter table public.profiles add column if not exists cover_url text;
alter table public.profiles add column if not exists pro_color text;   -- PRO 徽章配色 "c1,c2,ink"
alter table public.posts add column if not exists pinned boolean not null default false;
create index if not exists idx_posts_pinned on public.posts (author_id, pinned);
