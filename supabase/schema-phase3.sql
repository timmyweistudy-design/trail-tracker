-- 讓 comments / likes 的變更可被 Realtime 廣播（前端訂閱即時更新）。可重複執行。
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='comments') then
    alter publication supabase_realtime add table public.comments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='likes') then
    alter publication supabase_realtime add table public.likes;
  end if;
end $$;
