// 不當字詞最後防線（schema-phase37-badwords.sql，由 moderation.js 產生）：跟 App 端用同一批測試詞，結果要一致
const { boot, as, ROOT } = require("./harness");
const fs = require("fs");
const path = require("path");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const { pg, c } = await boot();
  const A = "00000000-0000-0000-0000-00000000000a";
  await c.query("insert into auth.users values ($1)", [A]);
  await c.query("insert into profiles values ($1,'amei','阿梅',null)", [A]);
  await c.query(`alter table posts add column caption text; alter table posts add column trail_name text; alter table profiles add column bio text; alter table profiles add column pet_name text;
    create table public.comments(id uuid primary key default gen_random_uuid(), post_id uuid, author_id uuid, body text);
    create table public.events(id uuid primary key default gen_random_uuid(), creator_id uuid, title text, note text, trail_name text);
    create table public.teams(id uuid primary key default gen_random_uuid(), name text);
    create table public.blocks(blocker_id uuid, blocked_id uuid);
    create or replace function public.can_see_post(p_author uuid, p_visibility text) returns boolean language sql stable as $$ select true $$;
    grant select, insert, update, delete on all tables in schema public to authenticated;`);
  await c.query(fs.readFileSync(ROOT + "schema-phase30-trail-reports.sql", "utf8"));
  await c.query(fs.readFileSync(ROOT + "schema-phase34-clubs.sql", "utf8"));
  await c.query(fs.readFileSync(ROOT + "schema-phase35-moderation.sql", "utf8"));
  for (let i = 0; i < 2; i++) { try { await c.query(fs.readFileSync(ROOT + "schema-phase37-badwords.sql", "utf8")); ok(true, "phase37 runs " + (i + 1)); } catch (e) { ok(false, "phase37: " + e.message); process.exit(1); } }
  const C = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "badwords-cases.json"), "utf8"));
  const clean = async t => (await c.query("select tt_is_clean($1) v", [t])).rows[0].v;
  const miss = [], wrong = [];
  for (const t of C.bad) if (await clean(t)) miss.push(t);
  for (const t of C.ok) if (!(await clean(t))) wrong.push(t);
  ok(miss.length === 0, `db blocks all ${C.bad.length} bad${miss.length ? ": missed " + miss.join(" | ") : ""}`);
  ok(wrong.length === 0, `db passes all ${C.ok.length} ok${wrong.length ? ": wrongly blocked " + wrong.join(" | ") : ""}`);
  ok(await clean(null), "null is clean");
  let r = await as(c, A, "insert into teams(name) values ('幹 你 娘隊')"); ok(/objectionable/.test(r.err || ""), "bad team name blocked");
  r = await as(c, A, "insert into teams(name) values ('週末山友隊')"); ok(!r.err, "good team name ok " + (r.err || ""));
  r = await as(c, A, "insert into posts(author_id, caption, trail_name) values ($1,'好棒','f.u.c.k步道')", [A]); ok(/objectionable/.test(r.err || ""), "bad post trail_name blocked");
  r = await as(c, A, "insert into posts(author_id, caption, trail_name) values ($1,'好棒','樹幹步道')", [A]); ok(!r.err, "good post ok " + (r.err || ""));
  r = await as(c, A, "update profiles set pet_name='sh!t' where id=$1", [A]); ok(/objectionable/.test(r.err || ""), "bad pet name blocked");
  console.log("FAILS", fails); await c.end(); await pg.stop();
})().catch(e => { console.error(e); process.exit(1); });
