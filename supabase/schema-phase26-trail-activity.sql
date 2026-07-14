-- 步道人氣：「最近有人走過這條」。可重複執行。
--
-- 隱私原則（重要）：
-- 1. 只統計 visibility = 'public' 的貼文——使用者自己選擇公開的內容，沒有動到任何私密資料。
-- 2. 少於 3 人不回傳任何數字（k-匿名）：不然「近 30 天 1 人走過」等於公開某一個人的行蹤。
-- 3. 只回聚合值，不回任何 user_id / 名字 / 軌跡。
-- security definer：讓未登入的訪客也看得到（posts 的 RLS 只開放給 authenticated）。

create or replace function public.trail_activity(p_trail text, p_days int default 30)
returns table (hikers int, hikes int, median_ms bigint, median_km numeric, median_ascent int)
language sql stable security definer set search_path = public as $$
  with pool as (
    select author_id, duration_ms, distance_km, ascent
    from posts
    where trail_id = p_trail
      and visibility = 'public'
      and hidden = false
      and coalesce(hiked_on, created_at::date) >= (current_date - p_days)
  ), agg as (
    select count(distinct author_id)::int as hikers, count(*)::int as hikes,
           percentile_cont(0.5) within group (order by duration_ms) filter (where duration_ms > 0) as ms,
           percentile_cont(0.5) within group (order by distance_km) filter (where distance_km > 0) as km,
           percentile_cont(0.5) within group (order by ascent) filter (where ascent > 0) as asc_m   -- ⚠️ 不可叫 asc：PostgreSQL 保留字
    from pool
  )
  -- k-匿名：少於 3 人時「連人數都不回」（回 0）。
  -- ⚠️ 第一版只擋了中位數、照樣回傳 hikers → 直接呼叫 RPC 就能看到「這條步道 1 人走過」，
  --    等於公開某個人的行蹤，正是這份檔案開頭說要避免的事。前端的 hikers < 3 判斷只是 UI 遮蔽，擋不住直接呼叫。
  select case when hikers >= 3 then hikers else 0 end,
         case when hikers >= 3 then hikes else 0 end,
         case when hikers >= 3 then ms::bigint end,
         case when hikers >= 3 then round(km::numeric, 1) end,
         case when hikers >= 3 then asc_m::int end
  from agg;
$$;

grant execute on function public.trail_activity(text, int) to anon, authenticated;
