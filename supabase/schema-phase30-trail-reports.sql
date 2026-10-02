-- 山友路況回報：走完（或走到一半）回報「倒木、坍方、溪水暴漲、路跡不清…」，附一句話、照片、位置。
-- 7 天後自動不再顯示（官方公告最慢更新的那一塊，由走過的人補上）。可重複執行。
-- 在 Supabase SQL Editor 執行一次即可；沒跑之前 App 的「山友回報」區塊會安靜不顯示，不影響其他功能。

create table if not exists public.trail_reports (
  id uuid primary key default gen_random_uuid(),
  trail_id text not null,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('ok','tree','slide','water','trace','wildlife','other')),
  note text check (note is null or char_length(note) <= 300),
  photo_url text check (photo_url is null or photo_url like 'https://%'),
  lat double precision check (lat is null or lat between 20 and 27),
  lon double precision check (lon is null or lon between 118 and 123),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists trail_reports_trail_idx on public.trail_reports (trail_id, created_at desc);

alter table public.trail_reports enable row level security;

-- 新增：只能用自己的身分
drop policy if exists tr_insert_self on public.trail_reports;
create policy tr_insert_self on public.trail_reports for insert to authenticated
  with check (author_id = auth.uid());
-- 刪除：只能刪自己的
drop policy if exists tr_delete_self on public.trail_reports;
create policy tr_delete_self on public.trail_reports for delete to authenticated
  using (author_id = auth.uid());
-- 直接查表：只看得到自己的（別人的走下面的 RPC，只回需要的欄位）
drop policy if exists tr_select_self on public.trail_reports;
create policy tr_select_self on public.trail_reports for select to authenticated
  using (author_id = auth.uid());

-- 防洗版：同一人一天最多回報 10 則
create or replace function public.trail_reports_rate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from trail_reports where author_id = new.author_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'rate limit: too many reports today';
  end if;
  return new;
end $$;
drop trigger if exists trail_reports_rate on public.trail_reports;
create trigger trail_reports_rate before insert on public.trail_reports
  for each row execute function public.trail_reports_rate();

-- 某條步道 7 天內的回報（訪客也看得到；只回名字、不回 user id 以外的個資）
create or replace function public.trail_reports_recent(p_trail text)
returns table (id uuid, kind text, note text, photo_url text, lat double precision, lon double precision,
               created_at timestamptz, author_name text, is_mine boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.kind, r.note, r.photo_url, r.lat, r.lon, r.created_at,
         coalesce(nullif(p.display_name, ''), p.handle, '山友') as author_name,
         (r.author_id = auth.uid()) as is_mine
  from trail_reports r left join profiles p on p.id = r.author_id
  where r.trail_id = p_trail and not r.hidden and r.created_at > now() - interval '7 days'
  order by r.created_at desc
  limit 20;
$$;
grant execute on function public.trail_reports_recent(text) to anon, authenticated;
