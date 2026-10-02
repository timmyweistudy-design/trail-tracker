const { boot, as, ROOT } = require("./harness");
const fs = require("fs");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const { pg, c } = await boot();
  const A = "00000000-0000-0000-0000-00000000000a", B = "00000000-0000-0000-0000-00000000000b", C = "00000000-0000-0000-0000-00000000000c", D = "00000000-0000-0000-0000-00000000000d", ADM = "00000000-0000-0000-0000-0000000000ad";
  await c.query("alter table auth.users add column email text");
  for (const [u, e] of [[A, "a@x"], [B, "b@x"], [C, "c@x"], [D, "d@x"], [ADM, "GatherTheTrail@gmail.com"]]) await c.query("insert into auth.users values ($1,$2)", [u, e]);
  await c.query("insert into profiles values ($1,'amei','阿梅',null),($2,'bob','B',null),($3,'c','C',null),($4,'d','D',null),($5,'adm','Admin',null)", [A, B, C, D, ADM]);
  await c.query("alter table posts add column caption text, add column trail_name text");
  await c.query(`create table public.reports (id uuid primary key default gen_random_uuid(), reporter_id uuid, post_id uuid, reported_user uuid, reason text, created_at timestamptz default now());
                 create table public.client_errors (id uuid primary key default gen_random_uuid(), user_id uuid, message text, app_ver text, ua text, happened_at timestamptz, created_at timestamptz not null default now());
                 create or replace function public.protect_post_hidden() returns trigger language plpgsql as $$ begin
                   if new.hidden is distinct from old.hidden and current_user in ('authenticated','anon') then raise exception 'not allowed'; end if; return new; end $$;
                 create trigger protect_post_hidden before update on public.posts for each row execute function public.protect_post_hidden();`);
  await c.query(fs.readFileSync(ROOT + "schema-phase30-trail-reports.sql", "utf8"));
  for (let i = 0; i < 2; i++) { try { await c.query(fs.readFileSync(ROOT + "schema-phase33-admin.sql", "utf8")); ok(true, "phase33 runs " + (i + 1)); } catch (e) { ok(false, "phase33: " + e.message); process.exit(1); } }
  ok((await c.query("select count(*)::int n from app_admins where user_id=$1", [ADM])).rows[0].n === 1, "developer email seeded as admin (case-insensitive)");
  let r = await as(c, A, "insert into trail_reports(trail_id, kind, note) values ('t1','tree','垃圾內容') returning id");
  const R = r.rows[0].id;
  // 自己不能改 hidden
  r = await as(c, A, "update trail_reports set hidden=true where id=$1", [R]);
  ok(/not allowed/.test(r.err || "") || !!r.err || r.rows.length === 0, "author cannot set hidden");
  // 檢舉：一人一次，3 人自動藏
  r = await as(c, B, "insert into trail_report_flags(report_id, reason) values ($1,'廣告')", [R]); ok(!r.err, "flag 1 " + (r.err || ""));
  r = await as(c, B, "insert into trail_report_flags(report_id) values ($1)", [R]); ok(!!r.err, "same user can't flag twice");
  r = await as(c, B, "insert into trail_report_flags(report_id, reporter_id) values ($1,$2)", [R, C]); ok(!!r.err, "can't flag as someone else");
  await as(c, C, "insert into trail_report_flags(report_id) values ($1)", [R]);
  ok((await c.query("select hidden from trail_reports where id=$1", [R])).rows[0].hidden === false, "2 flags → still visible");
  await as(c, D, "insert into trail_report_flags(report_id) values ($1)", [R]);
  ok((await c.query("select hidden from trail_reports where id=$1", [R])).rows[0].hidden === true, "3 flags → auto-hidden");
  ok((await as(c, null, "select * from trail_reports_recent('t1')")).rows.length === 0, "auto-hidden report gone from public list");
  // 管理員
  r = await as(c, A, "select * from admin_queue()"); ok(/admin only/.test(r.err || ""), "non-admin can't read queue");
  r = await as(c, A, "select admin_set_hidden('report',$1,false)", [R]); ok(/admin only/.test(r.err || ""), "non-admin can't unhide");
  await c.query("insert into posts(id, author_id, caption, trail_name) values ('11111111-1111-1111-1111-111111111111',$1,'可疑貼文','某步道')", [A]);
  await c.query("insert into reports(reporter_id, post_id, reason) values ($1,'11111111-1111-1111-1111-111111111111','騷擾')", [B]);
  r = await as(c, ADM, "select * from admin_queue()");
  ok(!r.err && r.rows.length === 2 && r.rows.some(x => x.kind === "report" && x.flags === 3 && x.hidden) && r.rows.some(x => x.kind === "post" && /騷擾/.test(x.reasons)), "admin queue lists flagged report + reported post " + (r.err || ""));
  r = await as(c, ADM, "select admin_set_hidden('report',$1,false)", [R]); ok(!r.err, "admin unhides report " + (r.err || ""));
  ok((await as(c, null, "select * from trail_reports_recent('t1')")).rows.length === 1, "report back in public list");
  r = await as(c, ADM, "select admin_set_hidden('post','11111111-1111-1111-1111-111111111111',true)"); ok(!r.err, "admin hides post " + (r.err || ""));
  ok((await c.query("select hidden from posts where id='11111111-1111-1111-1111-111111111111'")).rows[0].hidden === true, "post hidden");
  // 錯誤
  await c.query("insert into client_errors(user_id, message, app_ver) values ($1,'TypeError x',null),($2,'TypeError x','v1'),($1,'Other',null)", [A, B]);
  await c.query("insert into client_errors(user_id, message, created_at) values ($1,'舊的',now()-interval '20 days')", [A]);
  r = await as(c, ADM, "select * from admin_errors(7)");
  ok(!r.err && r.rows.length === 2 && r.rows[0].message === "TypeError x" && r.rows[0].n === 2 && r.rows[0].users === 2, "errors grouped, last 7 days only " + (r.err || JSON.stringify(r.rows)));
  ok(!!(await as(c, A, "select * from admin_errors(7)")).err, "non-admin can't read errors");
  ok(!!(await as(c, null, "select * from admin_errors(7)")).err, "anon can't read errors");
  console.log("FAILS", fails); await c.end(); await pg.stop();
})().catch(e => { console.error(e); process.exit(1); });
