-- PRO 專屬反應表情：擴充 reactions 可用的 emoji。可重複執行。
-- ⚠️ 前端 postview.js 的 REACT_EMOJI / REACT_PRO 改動時，這份白名單要同步更新並重新在 Supabase 執行，
--    否則新表情會被資料庫 check constraint 擋下。
alter table public.reactions drop constraint if exists reactions_emoji_check;
alter table public.reactions add constraint reactions_emoji_check
  check (emoji in (
    -- 基本
    '❤️','👍','🔥','😮','💪','😂',
    -- PRO 臉部表情
    '🥰','🤩','😍','😎','🥳','😆','🤗','😲','😅','🫡','😤','🥹',
    -- PRO 山林系
    '🏔️','🦌','⛺','🌟','🐻','🦅','🍂','❄️','🌄','🥾','🌲','🏕️'
  ));
