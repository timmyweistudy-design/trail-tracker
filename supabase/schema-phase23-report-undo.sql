-- 檢舉可查詢/可撤回。可重複執行。
-- 原本 reports 只有 insert 政策：使用者送出後就查不到、也收不回，誤按只能認了。
-- 這裡只開放「自己送出的檢舉」可讀可刪，別人的仍然看不到。

drop policy if exists reports_select_own on public.reports;
create policy reports_select_own on public.reports
  for select to authenticated using (reporter_id = auth.uid());

drop policy if exists reports_delete_own on public.reports;
create policy reports_delete_own on public.reports
  for delete to authenticated using (reporter_id = auth.uid());
