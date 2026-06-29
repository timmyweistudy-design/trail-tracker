-- Phase 6：個人頁顯示寵物進度、貼文路線縮圖、步道連結。可重複執行。
alter table public.profiles add column if not exists pet_name text;
alter table public.profiles add column if not exists pet_level int;
alter table public.profiles add column if not exists total_km numeric;
alter table public.posts add column if not exists track_thumb jsonb;
