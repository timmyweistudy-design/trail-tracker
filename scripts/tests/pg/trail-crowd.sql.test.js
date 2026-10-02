const { boot, as, ROOT } = require("./harness");
const fs = require("fs");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const { pg, c } = await boot();
  const U = i => "00000000-0000-0000-0000-0000000000" + String(i).padStart(2, "0");
  for (let i = 1; i <= 9; i++) await c.query("insert into auth.users values ($1)", [U(i)]);
  for (let i = 0; i < 2; i++) { try { await c.query(fs.readFileSync(ROOT + "schema-phase32-trail-crowd.sql", "utf8")); ok(true, "phase32 runs " + (i + 1)); } catch (e) { ok(false, "phase32: " + e.message); process.exit(1); } }
  // 2 人走過 → 全部 0（k-匿名）
  // 週六 2026-09-26 09:00 台灣 = 01:00Z（用相對時間避免過期：找最近的週六上午）
  const sat = new Date(); sat.setUTCDate(sat.getUTCDate() - ((sat.getUTCDay() + 1) % 7 || 7)); sat.setUTCHours(1, 0, 0, 0);   // 最近一個（已過去的）週六 09:00 台灣
  let r = await as(c, U(1), "insert into trail_visits(trail_id, started_at, duration_min) values ('t0', now() - interval '2 hours', 120) returning user_id");
  ok(!r.err && r.rows[0].user_id === U(1), "insert own visit " + (r.err || ""));
  const seed = async (u, iso) => { await c.query("set session_replication_role = replica"); await c.query("insert into trail_visits(user_id, trail_id, started_at) values ($1,'t1',$2)", [u, iso]); await c.query("set session_replication_role = origin"); };
  await seed(U(1), sat.toISOString()); await seed(U(2), sat.toISOString());
  r = await as(c, null, "select * from trail_crowd('t1')");
  ok(!r.err && r.rows[0].hikers7 === 0 && r.rows[0].hikers30 === 0 && r.rows[0].grid === null, "2 hikers → all hidden " + (r.err || JSON.stringify(r.rows[0])));
  await seed(U(3), sat.toISOString());
  r = await as(c, null, "select * from trail_crowd('t1')");
  ok(r.rows[0].hikers7 === 3 && r.rows[0].hikers30 === 3 && r.rows[0].grid === null, "3 hikers → counts shown, grid still hidden (<5)");
  // 再 2 人走週二清晨 → 5 人，給熱度圖
  const tue = new Date(sat.getTime() - 4 * 864e5); tue.setUTCHours(22 - 24 + 24, 0, 0, 0);   // 週二 22:00Z = 週三 06:00 台灣
  const tueTw = new Date(sat.getTime() - 4 * 864e5 + (6 - 9) * 3600e3);   // 週二 06:00 台灣
  for (const i of [4, 5]) await seed(U(i), tueTw.toISOString());
  r = await as(c, null, "select * from trail_crowd('t1')");
  const g = r.rows[0].grid;
  ok(Array.isArray(g) && g.length === 28, "5 hikers → 28-cell grid");
  ok(g && g[5 * 4 + 1] === 4 && g[1 * 4 + 0] === 3 && g.filter(x => x > 0).length === 2, "grid: Sat morning=4 (busiest), Tue dawn=3 " + JSON.stringify(g));
  ok(r.rows[0].year_hikers === 5, "year hikers = 5");
  // 不能偽造、不能讀別人
  r = await as(c, U(1), "insert into trail_visits(user_id, trail_id, started_at) values ($1,'t1',now())", [U(2)]);
  ok(!!r.err, "cannot insert for someone else");
  r = await as(c, U(1), "insert into trail_visits(trail_id, started_at) values ('t1', now() + interval '1 day')");
  ok(/out of range/.test(r.err || ""), "future start rejected");
  r = await as(c, U(1), "insert into trail_visits(trail_id, started_at) values ('t1', now() - interval '10 days')");
  ok(/out of range/.test(r.err || ""), "old start rejected");
  r = await as(c, U(1), "insert into trail_visits(trail_id, started_at, duration_min) values ('t0', (select started_at from trail_visits where trail_id='t0'), 120)");
  ok(/duplicate/.test(r.err || ""), "duplicate visit rejected " + r.err);
  r = await as(c, U(2), "select * from trail_visits");
  ok(!r.err && r.rows.length === 1, "user sees only own visits " + (r.err || r.rows.length));
  r = await as(c, null, "select * from trail_visits");
  ok(!!r.err || r.rows.length === 0, "anon cannot read raw visits");
  for (let i = 0; i < 30; i++) await as(c, U(6), "insert into trail_visits(trail_id, started_at) values ($1, now())", ["r" + i]);
  r = await as(c, U(6), "insert into trail_visits(trail_id, started_at) values ('tz', now())");
  ok(/rate limit/.test(r.err || ""), "31st visit in a day rate-limited " + r.err);
  // 公開貼文也算進 7/30 天人數
  await c.query("insert into posts(author_id, trail_id, hiked_on) values ($1,'t2',current_date),($2,'t2',current_date),($3,'t2',current_date)", [U(7), U(8), U(9)]);
  r = await as(c, null, "select * from trail_crowd('t2')");
  ok(r.rows[0].hikers7 === 3 && r.rows[0].grid === null, "public posts count toward recent hikers " + JSON.stringify(r.rows[0]) + (r.err || ""));
  r = await as(c, null, "select * from trail_crowd('nope')");
  ok(!r.err && r.rows[0].hikers7 === 0 && r.rows[0].grid === null, "unknown trail → zeros");
  console.log("FAILS", fails); await c.end(); await pg.stop();
})().catch(e => { console.error(e); process.exit(1); });
