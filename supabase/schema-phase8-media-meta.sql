-- 隨手拍照片帶上拍攝時間與里程。可重複執行。
alter table public.post_media add column if not exists taken_at timestamptz;
alter table public.post_media add column if not exists km numeric;
