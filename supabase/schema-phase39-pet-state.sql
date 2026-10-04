-- phase39：好友看到的是「當下」的夥伴（2026-10-04）
-- pet_state = { last: 最近一次走路的時間（ISO）, wx: 那邊的天氣 rain|snow|cloud|"", wxAt: 天氣的時間 }
-- 心情不存（會過時）：好友那邊用 last 跟自己夥伴卡同一套規則「現在」算；天氣超過 3 小時就不用。
alter table public.profiles add column if not exists pet_state jsonb;
alter table public.profiles drop constraint if exists profiles_pet_state_size;
alter table public.profiles add constraint profiles_pet_state_size check (pet_state is null or pg_column_size(pet_state) <= 400);
