-- 揪團報名的隱私修補。可重複執行。
--
-- 問題：rsvp_select 開放任何登入者讀取「所有人的報名紀錄」（event_rsvps 含 user_id），
-- 但 UI 只需要「人數」與「我有沒有報名」。等於任何人都能建出「誰、幾號、會出現在哪座山」的名單——
-- 對登山 App 來說這是實質的跟蹤風險（時間 + 地點 + 對象）。
--
-- 修法：只能讀自己的報名；人數改由 security definer 函式回聚合值。

drop policy if exists rsvp_select on public.event_rsvps;
create policy rsvp_select_own on public.event_rsvps
  for select to authenticated using (user_id = auth.uid());

-- 各活動的報名人數（只回數字，不回任何 user_id）
create or replace function public.event_rsvp_counts(p_events uuid[])
returns table (event_id uuid, n int)
language sql stable security definer set search_path = public as $$
  select event_id, count(*)::int
  from event_rsvps
  where event_id = any(p_events)
  group by event_id;
$$;

grant execute on function public.event_rsvp_counts(uuid[]) to authenticated;
