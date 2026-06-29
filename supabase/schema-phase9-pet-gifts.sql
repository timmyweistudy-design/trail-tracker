-- 社群寵物互動：送果實給好友的夥伴。可重複執行。
create table if not exists public.pet_gifts (
  id uuid primary key default gen_random_uuid(),
  from_user uuid references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  berries int not null default 3,
  claimed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_petgift_to on public.pet_gifts(to_user, claimed);
alter table public.pet_gifts enable row level security;
drop policy if exists petgift_select on public.pet_gifts;
create policy petgift_select on public.pet_gifts for select to authenticated using (to_user = auth.uid() or from_user = auth.uid());
drop policy if exists petgift_update on public.pet_gifts;
create policy petgift_update on public.pet_gifts for update to authenticated using (to_user = auth.uid()) with check (to_user = auth.uid());
-- 只能透過 RPC 送禮（security definer）

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in ('follow','like','comment','team','gift'));

create or replace function public.send_pet_gift(p_to uuid, p_n int) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_to = auth.uid() then return false; end if;
  -- 每天對同一位好友限送一次（以台北日期為準）
  if exists (select 1 from pet_gifts where from_user = auth.uid() and to_user = p_to
             and (created_at at time zone 'Asia/Taipei')::date = (now() at time zone 'Asia/Taipei')::date) then
    return false;
  end if;
  insert into pet_gifts(from_user, to_user, berries) values (auth.uid(), p_to, greatest(1, least(p_n, 10)));
  insert into notifications(user_id, actor_id, type) values (p_to, auth.uid(), 'gift');
  return true;
end $$;
