-- 通知：別人追蹤/讚/留言你時，由 DB trigger 自動建立通知列。可重複執行。

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,   -- 收件者
  actor_id uuid references auth.users(id) on delete cascade,           -- 觸發者
  type text not null check (type in ('follow','like','comment')),
  post_id uuid references public.posts(id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_user on public.notifications (user_id, created_at desc);

-- 內嵌觸發者 profile 用
alter table public.notifications drop constraint if exists notif_actor_profile_fk;
alter table public.notifications add constraint notif_actor_profile_fk
  foreign key (actor_id) references public.profiles(id) on delete cascade;

-- RLS：只能讀/改/刪自己的通知；insert 只由下方 trigger（security definer）建立
alter table public.notifications enable row level security;
drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notif_delete on public.notifications;
create policy notif_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- Triggers：按讚 / 留言 / 追蹤 → 自動通知對方（不通知自己）
create or replace function public.notify_like() returns trigger language plpgsql security definer set search_path = public as $$
declare author uuid;
begin
  select author_id into author from posts where id = NEW.post_id;
  if author is not null and author <> NEW.user_id then
    insert into notifications(user_id, actor_id, type, post_id) values (author, NEW.user_id, 'like', NEW.post_id);
  end if;
  return NEW;
end $$;
drop trigger if exists trg_notify_like on public.likes;
create trigger trg_notify_like after insert on public.likes for each row execute function public.notify_like();

create or replace function public.notify_comment() returns trigger language plpgsql security definer set search_path = public as $$
declare author uuid;
begin
  select author_id into author from posts where id = NEW.post_id;
  if author is not null and author <> NEW.author_id then
    insert into notifications(user_id, actor_id, type, post_id) values (author, NEW.author_id, 'comment', NEW.post_id);
  end if;
  return NEW;
end $$;
drop trigger if exists trg_notify_comment on public.comments;
create trigger trg_notify_comment after insert on public.comments for each row execute function public.notify_comment();

create or replace function public.notify_follow() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications(user_id, actor_id, type) values (NEW.following_id, NEW.follower_id, 'follow');
  return NEW;
end $$;
drop trigger if exists trg_notify_follow on public.follows;
create trigger trg_notify_follow after insert on public.follows for each row execute function public.notify_follow();

-- Realtime：訂閱自己的新通知 → 即時紅點
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
