-- 修正 phase24 的第 1 項：hidden 欄位的寫入保護。可重複執行。
--
-- 為什麼 phase24 的 revoke update(hidden) 沒生效：
-- PostgreSQL 的欄位層級 REVOKE 對「已經持有整表 UPDATE 權限」的角色是無效的
-- （要先 revoke 整表再逐欄 grant 回去）。posts 的 authenticated 有整表 UPDATE，所以那行等於沒作用。
-- 這裡改用 trigger 擋：一般使用者（authenticated/anon）改不動 hidden，
-- 而 autohide_reported() 是 security definer（以 owner 身分執行）→ 不受影響，仍可自動隱藏。

create or replace function public.protect_post_hidden()
returns trigger language plpgsql as $$
begin
  if new.hidden is distinct from old.hidden and current_user in ('authenticated', 'anon') then
    new.hidden := old.hidden;   -- 靜默還原（前端本來就不該改這個欄位）
  end if;
  return new;
end; $$;

drop trigger if exists trg_protect_post_hidden on public.posts;
create trigger trg_protect_post_hidden before update on public.posts
  for each row execute function public.protect_post_hidden();

-- ── 撤回檢舉 → 檢舉數掉回門檻以下就解除自動隱藏 ──────────────────────
-- 「檢舉可撤回」只做了一半：撤回後貼文仍被隱藏著。這裡補上反向邏輯，
-- 與 autohide_reported()（3 位不同檢舉人 → 隱藏）對稱。
create or replace function public.unhide_if_under_threshold()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if OLD.post_id is not null and
     (select count(distinct reporter_id) from reports where post_id = OLD.post_id) < 3 then
    update posts set hidden = false where id = OLD.post_id and hidden = true;
  end if;
  return OLD;
end; $$;

drop trigger if exists trg_unhide_reported on public.reports;
create trigger trg_unhide_reported after delete on public.reports for each row
  execute function public.unhide_if_under_threshold();
