-- PRO 專屬反應表情：擴充 reactions 可用的 emoji。可重複執行。
alter table public.reactions drop constraint if exists reactions_emoji_check;
alter table public.reactions add constraint reactions_emoji_check
  check (emoji in ('❤️','👍','🔥','😮','💪','😂','🏔️','🦌','⛺','🌟'));
