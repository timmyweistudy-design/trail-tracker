-- Phase 2：讓 PostgREST 能從 posts/comments 內嵌 profiles（embed），並加查詢索引。可重複執行。
alter table public.posts drop constraint if exists posts_author_profile_fk;
alter table public.posts add constraint posts_author_profile_fk
  foreign key (author_id) references public.profiles(id) on delete cascade;

alter table public.comments drop constraint if exists comments_author_profile_fk;
alter table public.comments add constraint comments_author_profile_fk
  foreign key (author_id) references public.profiles(id) on delete cascade;

create index if not exists idx_posts_created   on public.posts (created_at desc);
create index if not exists idx_posts_author    on public.posts (author_id, created_at desc);
create index if not exists idx_posts_vis       on public.posts (visibility, created_at desc);
create index if not exists idx_comments_post   on public.comments (post_id, created_at);
create index if not exists idx_likes_post      on public.likes (post_id);
create index if not exists idx_follows_following on public.follows (following_id);
