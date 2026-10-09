-- phase40：好友看得到夥伴的「配件」（2026-10-09，夥伴第三版 R11）
-- 頭飾（pet_hat，phase38）之外，夥伴現在還能戴頸部配件（圍巾、鈴鐺、領結、小背包、披風）。
-- 可重複執行；可空的短字串，只允許小寫英文字母（配件 id）。App 端讀不到這欄（還沒跑這支）時照舊只畫頭飾，不會壞。
alter table public.profiles add column if not exists pet_acc text;
alter table public.profiles drop constraint if exists profiles_pet_acc_fmt;
alter table public.profiles add constraint profiles_pet_acc_fmt check (pet_acc is null or pet_acc ~ '^[a-z]{1,16}$');
