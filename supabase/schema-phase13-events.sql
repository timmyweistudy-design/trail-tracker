-- 揪團活動（某日某步道）+ 報名。可重複執行。
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  trail_id text,
  trail_name text,
  title text not null check (char_length(title) between 1 and 120),
  when_at timestamptz not null,
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists idx_events_when on public.events (when_at);

-- 內嵌主辦人 profile
alter table public.events drop constraint if exists events_creator_profile_fk;
alter table public.events add constraint events_creator_profile_fk
  foreign key (creator_id) references public.profiles(id) on delete cascade;

create table if not exists public.event_rsvps (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;

drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated using (true);
drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert to authenticated with check (creator_id = auth.uid());
drop policy if exists events_update on public.events;
create policy events_update on public.events for update to authenticated using (creator_id = auth.uid()) with check (creator_id = auth.uid());
drop policy if exists events_delete on public.events;
create policy events_delete on public.events for delete to authenticated using (creator_id = auth.uid());

drop policy if exists rsvp_select on public.event_rsvps;
create policy rsvp_select on public.event_rsvps for select to authenticated using (true);
drop policy if exists rsvp_insert on public.event_rsvps;
create policy rsvp_insert on public.event_rsvps for insert to authenticated with check (user_id = auth.uid());
drop policy if exists rsvp_delete on public.event_rsvps;
create policy rsvp_delete on public.event_rsvps for delete to authenticated using (user_id = auth.uid());
