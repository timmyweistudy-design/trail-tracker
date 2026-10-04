-- phase38：好友拜訪頁照搬對方的夥伴舞台（2026-10-04）
-- 好友看到的不只是等級，還有對方夥伴戴的配件、舞台上走過的風景（瀑布、古道…），跟對方自己的夥伴卡一樣。
-- 兩個欄位都是可空、短字串；App 端讀不到（還沒跑這支）時會退回只用等級。
alter table public.profiles add column if not exists pet_hat text;
alter table public.profiles add column if not exists pet_decor text;
alter table public.profiles drop constraint if exists profiles_pet_hat_len;
alter table public.profiles add constraint profiles_pet_hat_len check (pet_hat is null or char_length(pet_hat) <= 24);
alter table public.profiles drop constraint if exists profiles_pet_decor_len;
alter table public.profiles add constraint profiles_pet_decor_len check (pet_decor is null or char_length(pet_decor) <= 40);
