-- 小隊管理：隊長可以把人移出小隊、把隊長交給別人（解散小隊＝刪 teams，phase7 已允許隊長刪）。
-- 在 Supabase SQL Editor 執行一次即可；沒跑之前 App 會提示「資料庫還沒開這個功能」，不影響其他功能。

-- 隊長可以刪除自己小隊的成員（原本只能刪自己＝退出）
drop policy if exists tm_delete_owner on public.team_members;
create policy tm_delete_owner on public.team_members for delete to authenticated
  using (exists (select 1 from public.teams t where t.id = team_id and t.owner = auth.uid()));

-- 轉移隊長：只有現任隊長能轉，而且新隊長必須已經是成員
create or replace function public.transfer_team(p_team uuid, p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from teams where id = p_team and owner = auth.uid()) then return false; end if;
  if not exists (select 1 from team_members where team_id = p_team and user_id = p_user) then return false; end if;
  update teams set owner = p_user where id = p_team;
  return true;
end $$;
grant execute on function public.transfer_team(uuid, uuid) to authenticated;
