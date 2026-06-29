-- 發文星級評分。可重複執行。
alter table public.posts add column if not exists rating int check (rating between 1 and 5);
