// 不當內容過濾（schema-phase35-moderation.sql）：擋髒話、正常字不誤擋、更新只看有改的欄位
const { boot, as, ROOT } = require("./harness");
const fs = require("fs");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const { pg, c } = await boot();
  const A = "00000000-0000-0000-0000-00000000000a";
  await c.query("insert into auth.users values ($1)", [A]);
  await c.query("insert into profiles values ($1,'amei','阿梅',null)", [A]);
  await c.query(`alter table posts add column caption text;
    create table public.comments(id uuid primary key default gen_random_uuid(), post_id uuid, author_id uuid, body text);
    create table public.events(id uuid primary key default gen_random_uuid(), creator_id uuid, title text, note text, trail_name text);
    create table public.blocks(blocker_id uuid, blocked_id uuid);
    create or replace function public.can_see_post(p_author uuid, p_visibility text) returns boolean language sql stable as $$ select true $$;
    grant select, insert, update, delete on all tables in schema public to authenticated;`);
  await c.query(fs.readFileSync(ROOT + "schema-phase30-trail-reports.sql", "utf8"));
  await c.query(fs.readFileSync(ROOT + "schema-phase34-clubs.sql", "utf8"));
  for (let i = 0; i < 2; i++) { try { await c.query(fs.readFileSync(ROOT + "schema-phase35-moderation.sql", "utf8")); ok(true, "phase35 runs " + (i + 1)); } catch (e) { ok(false, "phase35: " + e.message); process.exit(1); } }
  const clean = async t => (await c.query("select tt_is_clean($1) v", [t])).rows[0].v;
  for (const t of ["今天走樹幹步道，幹線道路旁停車", "Dickson trail, shitake mushroom, 好美", "壽山 Scunthorpe", null, ""]) ok(await clean(t), "clean: " + t);
  for (const t of ["幹你娘", "這什麼 Fuck 啦", "加入娛樂城送點數", "SHIT"]) ok(!(await clean(t)), "blocked: " + t);
  let r = await as(c, A, "insert into posts(author_id, caption) values ($1,'好棒的步道')", [A]); ok(!r.err, "normal post ok " + (r.err || ""));
  r = await as(c, A, "insert into posts(author_id, caption) values ($1,'雞掰路況')", [A]); ok(/objectionable/.test(r.err || ""), "bad post blocked");
  r = await as(c, A, "insert into comments(author_id, body) values ($1,'you bitch')", [A]); ok(/objectionable/.test(r.err || ""), "bad comment blocked");
  r = await as(c, A, "insert into trail_reports(trail_id, kind, note) values ('t1','tree','約砲')"); ok(/objectionable/.test(r.err || ""), "bad trail report blocked");
  r = await as(c, A, "insert into events(creator_id, title, note) values ($1,'週末爬山','百家樂')", [A]); ok(/objectionable/.test(r.err || ""), "bad event note blocked");
  r = await as(c, A, "select create_club('幹你娘社',null,null,true,'ZZ1')"); ok(/objectionable/.test(r.err || ""), "bad club name blocked");
  r = await as(c, A, "select create_club('好山社','歡迎新手',null,true,'ZZ2')"); ok(!r.err, "good club ok " + (r.err || ""));
  r = await as(c, A, "update profiles set display_name='婊子' where id=$1", [A]); ok(/objectionable/.test(r.err || ""), "bad display name blocked");
  // 舊資料有髒字時，更新別的欄位不會被擋
  await c.query("alter table profiles disable trigger tt_clean_profiles; update profiles set display_name='王八蛋' where id=$1; alter table profiles enable trigger tt_clean_profiles;", [A]).catch(async () => {
    await c.query("alter table profiles disable trigger tt_clean_profiles"); await c.query("update profiles set display_name='王八蛋' where id=$1", [A]); await c.query("alter table profiles enable trigger tt_clean_profiles"); });
  r = await as(c, A, "update profiles set avatar_url='x' where id=$1", [A]); ok(!r.err, "unchanged legacy field doesn't block other updates " + (r.err || ""));
  console.log("FAILS", fails); await c.end(); await pg.stop();
})().catch(e => { console.error(e); process.exit(1); });
