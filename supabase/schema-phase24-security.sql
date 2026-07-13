-- 安全性修補（2026-07-13 全面 bug 掃描）。可重複執行。
-- 這幾項都是「前端擋了、後端沒擋」——只要在瀏覽器 console 直接呼叫 Supabase 就能繞過。

-- ── 1. 被檢舉自動隱藏的貼文，作者可以自己改回顯示 ─────────────────────
-- posts_update 只檢查 author_id、沒限制欄位 → 作者可 update({hidden:false})，
-- phase11 的「3 人檢舉自動隱藏」機制形同虛設。hidden 改成一般使用者不可寫（trigger/service_role 仍可）。
-- ⚠️ 這兩行無效（欄位層級 revoke 對已持有整表 UPDATE 權限的角色不起作用）→ 改用 schema-phase25 的 trigger。
-- revoke update (hidden) on public.posts from authenticated;
-- revoke update (hidden) on public.posts from anon;

-- ── 2. 知道 team_id 就能直接加入小隊（繞過加入碼）→ 看得到隊員即時 GPS ──
-- tm_insert 只檢查 user_id = auth.uid()，沒驗加入碼。改成一般人不能直接 insert：
-- 加入一律走 join_team_by_code（security definer，會驗加入碼）；隊長可直接把人加進自己的隊伍。
drop policy if exists tm_insert on public.team_members;
drop policy if exists tm_insert_owner on public.team_members;
create policy tm_insert_owner on public.team_members for insert to authenticated
  with check (exists (select 1 from public.teams t where t.id = team_id and t.owner = auth.uid()));

-- ── 3. PRO 專屬表情沒有伺服器端驗證 ──────────────────────────────────
-- 前端只用 Premium.isOn() 決定顯不顯示按鈕，DB 完全沒檢查 → 非會員在 console 直接送就能用。
-- ⚠️ 這份清單必須與 web/js/social/postview.js 的 REACT_PRO 一致（基本表情是 ❤️👍🔥😮💪😂，其餘皆為 PRO）。
create or replace function public.check_pro_reaction()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.emoji not in ('❤️', '👍', '🔥', '😮', '💪', '😂')
     and not public.is_premium(auth.uid()) then
    raise exception 'PRO reaction requires an active subscription';
  end if;
  return new;
end; $$;
drop trigger if exists trg_check_pro_reaction on public.reactions;
create trigger trg_check_pro_reaction before insert or update on public.reactions
  for each row execute function public.check_pro_reaction();

-- ── 4. 被封鎖的人仍可追蹤/送追蹤請求（騷擾繞過封鎖）────────────────────
-- 4a. 表層先擋死：follows 直接 insert 也要檢查封鎖關係（discover.js 在 RPC 失敗時會退回直接 insert）。
--     is_blocked(a,b) 本身是雙向檢查（任一方封鎖都算）。
drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows for insert to authenticated
  with check (follower_id = auth.uid() and not public.is_blocked(follower_id, following_id));

-- 4b. request_follow 加封鎖檢查。其餘邏輯與回傳值（'self' | 'followed' | 'requested'）完全照舊，
--     通知類型維持 'follow_req'（notifications_type_check 只認這個值）。新增回傳 'blocked'。
create or replace function public.request_follow(p_target uuid) returns text
language plpgsql security definer set search_path = public as $$
declare need boolean;
begin
  if p_target = auth.uid() then return 'self'; end if;
  if public.is_blocked(auth.uid(), p_target) then return 'blocked'; end if;   -- 任一方封鎖 → 不建立、不通知
  select coalesce(follow_approval, true) into need from profiles where id = p_target;
  if need is null then need := true; end if;
  if exists (select 1 from follows where follower_id = auth.uid() and following_id = p_target) then
    return 'followed';
  end if;
  if not need then
    insert into follows(follower_id, following_id) values (auth.uid(), p_target) on conflict do nothing;
    return 'followed';
  end if;
  if not exists (select 1 from follow_requests where requester_id = auth.uid() and target_id = p_target) then
    insert into follow_requests(requester_id, target_id) values (auth.uid(), p_target);
    insert into notifications(user_id, actor_id, type) values (p_target, auth.uid(), 'follow_req');
  end if;
  return 'requested';
end $$;
