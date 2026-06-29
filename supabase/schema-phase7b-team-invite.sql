-- 邀請好友加入小隊 + 通知。可重複執行。
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in ('follow','like','comment','team'));

create or replace function public.invite_to_team(p_team uuid, p_user uuid) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_team_member(p_team, auth.uid()) then return false; end if;          -- 只有隊員能邀請
  insert into team_members(team_id, user_id) values (p_team, p_user) on conflict do nothing;
  insert into notifications(user_id, actor_id, type) values (p_user, auth.uid(), 'team');
  return true;
end $$;
