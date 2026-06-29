-- 社群強化（hashtag / 轉發 / 自動隱藏 / 留言按讚+回覆 / 表情回應 / @提及通知）。可重複執行。

-- ===== posts 新欄位 =====
alter table public.posts add column if not exists tags text[];                                   -- #主題標籤
alter table public.posts add column if not exists repost_of uuid references public.posts(id) on delete set null;  -- 轉發來源
alter table public.posts add column if not exists hidden boolean not null default false;          -- 被檢舉達門檻自動隱藏
create index if not exists idx_posts_tags on public.posts using gin (tags);
create index if not exists idx_posts_repost on public.posts (repost_of);

-- 把「自動隱藏」納入貼文可見性（作者本人仍看得到自己的）
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select to authenticated
  using (public.can_see_post(author_id, visibility) and (hidden = false or author_id = auth.uid()));

-- ===== 留言：回覆（樓中樓一層） =====
alter table public.comments add column if not exists parent_id uuid references public.comments(id) on delete cascade;
create index if not exists idx_comments_parent on public.comments (parent_id);

-- ===== 留言按讚 =====
create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table public.comment_likes enable row level security;
drop policy if exists clike_select on public.comment_likes;
create policy clike_select on public.comment_likes for select to authenticated
  using (exists (select 1 from public.comments cm join public.posts p on p.id = cm.post_id
                 where cm.id = comment_id and public.can_see_post(p.author_id, p.visibility)));
drop policy if exists clike_insert on public.comment_likes;
create policy clike_insert on public.comment_likes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists clike_delete on public.comment_likes;
create policy clike_delete on public.comment_likes for delete to authenticated using (user_id = auth.uid());

-- ===== 表情回應（每人每篇一種，可更換；與愛心讚並存的加值層） =====
create table if not exists public.reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('❤️','👍','🔥','😮','💪','😂')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.reactions enable row level security;
drop policy if exists react_select on public.reactions;
create policy react_select on public.reactions for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and public.can_see_post(p.author_id, p.visibility)));
drop policy if exists react_insert on public.reactions;
create policy react_insert on public.reactions for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id and public.can_see_post(p.author_id, p.visibility)));
drop policy if exists react_update on public.reactions;
create policy react_update on public.reactions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists react_delete on public.reactions;
create policy react_delete on public.reactions for delete to authenticated using (user_id = auth.uid());

-- ===== 通知：新增 'mention' 類型 + @提及 RPC =====
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow','like','comment','team','gift','mention'));

-- @提及：客戶端解析出被提及者後呼叫此 RPC 建立通知（不通知自己）
create or replace function public.notify_mention(p_user uuid, p_post uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is not null and p_user <> auth.uid() then
    insert into notifications(user_id, actor_id, type, post_id) values (p_user, auth.uid(), 'mention', p_post);
  end if;
end $$;
grant execute on function public.notify_mention(uuid, uuid) to authenticated;

-- ===== 檢舉達門檻自動隱藏（3 位不同檢舉人） =====
create or replace function public.autohide_reported() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.post_id is not null and
     (select count(distinct reporter_id) from reports where post_id = NEW.post_id) >= 3 then
    update posts set hidden = true where id = NEW.post_id;
  end if;
  return NEW;
end $$;
drop trigger if exists trg_autohide_reported on public.reports;
create trigger trg_autohide_reported after insert on public.reports for each row execute function public.autohide_reported();
