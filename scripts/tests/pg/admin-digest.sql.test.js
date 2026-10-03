// 管理提醒（schema-phase36-admin-digest.sql）：有新檢舉或新種類錯誤才發、一天最多一則、只發給管理員
const { boot, as, ROOT } = require("./harness");
const fs = require("fs");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const { pg, c } = await boot();
  const A = "00000000-0000-0000-0000-00000000000a", ADM = "00000000-0000-0000-0000-0000000000ad";
  await c.query("alter table auth.users add column email text");
  await c.query("insert into auth.users values ($1,'a@x'),($2,'gatherthetrail@gmail.com')", [A, ADM]);
  await c.query("insert into profiles values ($1,'amei','阿梅',null),($2,'adm','Admin',null)", [A, ADM]);
  await c.query("alter table posts add column caption text, add column trail_name text");
  await c.query(`create table public.reports (id uuid primary key default gen_random_uuid(), reporter_id uuid, post_id uuid, reported_user uuid, reason text, created_at timestamptz default now());
    create table public.client_errors (id uuid primary key default gen_random_uuid(), user_id uuid, message text, app_ver text, ua text, happened_at timestamptz, created_at timestamptz not null default now());`);
  await c.query(fs.readFileSync(ROOT + "schema-phase30-trail-reports.sql", "utf8"));
  await c.query(fs.readFileSync(ROOT + "schema-phase33-admin.sql", "utf8"));
  for (let i = 0; i < 2; i++) { try { await c.query(fs.readFileSync(ROOT + "schema-phase36-admin-digest.sql", "utf8")); ok(true, "phase36 runs " + (i + 1)); } catch (e) { ok(false, "phase36: " + e.message); process.exit(1); } }
  const digest = async () => (await c.query("select admin_digest() n")).rows[0].n;
  const adminNotifs = async () => (await c.query("select count(*)::int n from notifications where type='admin' and user_id=$1", [ADM])).rows[0].n;
  ok(await digest() === 0 && await adminNotifs() === 0, "nothing new → no notification");
  // 老錯誤（之前就有）不算新
  await c.query("insert into client_errors(message, created_at) values ('Old bug', now()-interval '3 days'),('Old bug', now()-interval '1 hour')");
  ok(await digest() === 0, "recurring old error → no notification");
  await c.query("insert into client_errors(message) values ('Brand new TypeError')");
  ok(await digest() === 1 && await adminNotifs() === 1, "new kind of error → admin notified");
  ok((await c.query("select count(*)::int n from notifications where user_id=$1", [A])).rows[0].n === 0, "non-admin not notified");
  await c.query("insert into reports(reporter_id, reason) values ($1,'spam')", [A]);
  ok(await digest() === 0 && await adminNotifs() === 1, "already notified today → no duplicate");
  await c.query("update notifications set created_at = now() - interval '1 day' where type='admin'");
  ok(await digest() === 1 && await adminNotifs() === 2, "next day with new report → notified again");
  let r = await as(c, A, "select admin_digest()"); ok(!!r.err, "users can't call admin_digest");
  r = await as(c, A, "insert into notifications(user_id, type) values ($1,'admin')", [ADM]); ok(!!r.err, "users can't forge admin notifications");
  console.log("FAILS", fails); await c.end(); await pg.stop();
})().catch(e => { console.error(e); process.exit(1); });
