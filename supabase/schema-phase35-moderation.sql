-- 不當內容過濾（App Store 1.2 要求有過濾機制）：App 端 web/js/moderation.js 先擋，這裡是最後防線（繞過 App 直接打 API 也擋得住）。
-- 字詞清單要跟 moderation.js 的 TT_BAD_ZH / TT_BAD_EN 一致；刻意保守，不擋「樹幹」「幹線」這種正常字。
-- 被擋時錯誤訊息是 'objectionable content'，App 會顯示「內容有不適當的字詞，改一下再送出」。
-- 要先跑過 schema-phase34-clubs.sql（會用到 clubs 表）。可重複執行。

create or replace function public.tt_is_clean(t text) returns boolean
language sql immutable as $$
  select t is null or t !~* '(幹你娘|幹您娘|幹林娘|操你媽|操你妈|肏|屌你|雞掰|機掰|鸡掰|雞巴|鸡巴|婊子|賤人|贱人|王八蛋|去死吧|約砲|约炮|援交|娛樂城|娱乐城|博弈網|百家樂|百家乐|代儲)|\m(fuck|fucking|motherfucker|shit|bitch|cunt|nigger|nigga|faggot|asshole|porn|xxx)\M';
$$;

-- 觸發器參數＝要檢查的欄位名稱；更新時只檢查有改到的欄位（舊資料不會害別的欄位更新失敗）
create or replace function public.tt_block_bad_words() returns trigger
language plpgsql as $$
declare c text; v text;
begin
  foreach c in array TG_ARGV loop
    v := to_jsonb(new) ->> c;
    if TG_OP = 'UPDATE' and v is not distinct from (to_jsonb(old) ->> c) then continue; end if;
    if not public.tt_is_clean(v) then raise exception 'objectionable content' using errcode = '22023'; end if;
  end loop;
  return new;
end $$;

drop trigger if exists tt_clean_posts on public.posts;
create trigger tt_clean_posts before insert or update on public.posts
  for each row execute function public.tt_block_bad_words('caption');
drop trigger if exists tt_clean_comments on public.comments;
create trigger tt_clean_comments before insert or update on public.comments
  for each row execute function public.tt_block_bad_words('body');
drop trigger if exists tt_clean_trail_reports on public.trail_reports;
create trigger tt_clean_trail_reports before insert or update on public.trail_reports
  for each row execute function public.tt_block_bad_words('note');
drop trigger if exists tt_clean_events on public.events;
create trigger tt_clean_events before insert or update on public.events
  for each row execute function public.tt_block_bad_words('title', 'note', 'trail_name');
drop trigger if exists tt_clean_profiles on public.profiles;
create trigger tt_clean_profiles before insert or update on public.profiles
  for each row execute function public.tt_block_bad_words('display_name', 'bio', 'handle', 'pet_name');
drop trigger if exists tt_clean_clubs on public.clubs;
create trigger tt_clean_clubs before insert or update on public.clubs
  for each row execute function public.tt_block_bad_words('name', 'about');
