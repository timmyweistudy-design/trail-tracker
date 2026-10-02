const { boot, as, ROOT } = require("./harness");
const fs = require("fs");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const { pg, c } = await boot();
  const sys = async (q, a) => { await c.query("begin"); await c.query("set local tt.sys = '1'"); await c.query(q, a); await c.query("commit"); };
  const A = "00000000-0000-0000-0000-00000000000a", B = "00000000-0000-0000-0000-00000000000b", C = "00000000-0000-0000-0000-00000000000c", X = "00000000-0000-0000-0000-0000000000ff";
  for (const u of [A, B, C, X]) await c.query("insert into auth.users values ($1)", [u]);
  await c.query("insert into profiles values ($1,'amei','阿梅',null),($2,'bob','',null),($3,'cc','C',null),($4,'x','X',null)", [A, B, C, X]);
  // A<->B 互追；A->C 單向
  await c.query("insert into follows values ($1,$2),($2,$1),($1,$3)", [A, B, C]);
  // 跑兩次確認可重複執行
  for (let i = 0; i < 2; i++) { try { await c.query(fs.readFileSync(ROOT + "schema-phase31-guardian.sql", "utf8")); ok(true, "phase31 runs (pass " + (i + 1) + ")"); } catch (e) { ok(false, "phase31 runs: " + e.message); process.exit(1); } }
  const exp = new Date(Date.now() + 3 * 3600e3).toISOString();
  // 非好友當留守人 → 拒絕
  let r = await as(c, A, "insert into trip_plans(trail_name, expected_at, guardians) values ('x', $1, array[$2]::uuid[]) returning id", [exp, C]);
  ok(/mutual friend/.test(r.err || ""), "non-friend guardian rejected: " + r.err);
  // 混合：B 是好友、C 不是、自己 → 只留 B
  r = await as(c, A, "insert into trip_plans(trail_name, expected_at, guardians) values ('玉山', $1, array[$2,$3,$4,$2]::uuid[]) returning id, guardians, status", [exp, B, C, A]);
  ok(!r.err && r.rows[0].guardians.length === 1 && r.rows[0].guardians[0] === B, "guardians filtered to friends only " + (r.err || JSON.stringify(r.rows[0] && r.rows[0].guardians)));
  const P1 = r.rows[0] && r.rows[0].id;
  let n = await c.query("select type, user_id from notifications where plan_id=$1", [P1]);
  ok(n.rows.length === 1 && n.rows[0].type === "guard" && n.rows[0].user_id === B, "guardian notified on create");
  // 太早/太晚的預計時間 → 拒絕
  r = await as(c, A, "insert into trip_plans(expected_at, guardians) values (now() + interval '5 days', array[$1]::uuid[])", [B]);
  ok(/out of range/.test(r.err || ""), "expected time >3 days rejected");
  // 看得到：本人、留守人；看不到：別人
  ok((await as(c, B, "select id from trip_plans")).rows.length === 1, "guardian can read plan");
  ok((await as(c, X, "select id from trip_plans")).rows.length === 0, "stranger cannot read plan");
  ok((await as(c, null, "select id from trip_plans")).err !== null || (await as(c, null, "select id from trip_plans")).rows.length === 0, "anon cannot read plan");
  // 留守人不能改
  r = await as(c, B, "update trip_plans set status='done' where id=$1 returning id", [P1]);
  ok(!r.err && r.rows.length === 0, "guardian cannot update plan");
  // 本人更新位置 OK、不能自己設 overdue、不能清 alerted_at、不能改 guardians
  r = await as(c, A, "update trip_plans set last_lat=23.47, last_lon=120.95, last_at=now() where id=$1 returning id", [P1]);
  ok(!r.err && r.rows.length === 1, "owner updates last position");
  r = await as(c, A, "update trip_plans set status='overdue' where id=$1", [P1]);
  ok(/not allowed/.test(r.err || ""), "owner cannot set overdue");
  r = await as(c, A, "update trip_plans set alerted_at=null where id=$1", [P1]);
  ok(/permission denied/.test(r.err || ""), "owner cannot touch alerted_at: " + r.err);
  r = await as(c, A, "update trip_plans set guardians=array[$2]::uuid[] where id=$1", [P1, X]);
  ok(/permission denied/.test(r.err || ""), "owner cannot change guardians");
  // 檢查：還沒到時間 → 不通知
  r = await as(c, B, "select public.trip_plans_check() n");
  ok(r.rows[0].n === 0, "check: nothing overdue yet");
  // 讓它過期（系統直接改時間）
  await sys("update trip_plans set expected_at = now() - interval '31 minutes' where id=$1", [P1]);
  r = await as(c, B, "select * from public.guard_plans()");
  ok(!r.err && r.rows.length === 1 && r.rows[0].status === "overdue" && r.rows[0].owner_name === "阿梅" && r.rows[0].last_lat === 23.47, "guard_plans runs check → overdue with last position " + (r.err || JSON.stringify(r.rows[0] && r.rows[0].status)));
  n = await c.query("select count(*)::int k from notifications where plan_id=$1 and type='overdue'", [P1]);
  ok(n.rows[0].k === 1, "overdue notification sent once");
  await as(c, B, "select public.trip_plans_check()");
  n = await c.query("select count(*)::int k from notifications where plan_id=$1 and type='overdue'", [P1]);
  ok(n.rows[0].k === 1, "no duplicate overdue notification");
  // 本人延後 → 回到 active、留守人收到 guard_ext、之後再超時會再通知
  r = await as(c, A, "update trip_plans set expected_at = now() + interval '1 hour' where id=$1 returning status, alerted_at", [P1]);
  ok(!r.err && r.rows[0].status === "active" && r.rows[0].alerted_at === null, "extend after overdue → active again " + (r.err || ""));
  n = await c.query("select count(*)::int k from notifications where plan_id=$1 and type='guard_ext'", [P1]);
  ok(n.rows[0].k === 1, "guardian notified of extension");
  // 延後到過去 → 拒絕
  r = await as(c, A, "update trip_plans set expected_at = now() - interval '1 hour' where id=$1", [P1]);
  ok(/out of range/.test(r.err || ""), "extend into the past rejected");
  // 再超時 → 再通知；結束 → safe
  await sys("update trip_plans set expected_at = now() - interval '40 minutes' where id=$1", [P1]);
  await as(c, B, "select public.trip_plans_check()");
  n = await c.query("select count(*)::int k from notifications where plan_id=$1 and type='overdue'", [P1]);
  ok(n.rows[0].k === 2, "second overdue after extension");
  r = await as(c, A, "update trip_plans set status='done' where id=$1 returning ended_at", [P1]);
  ok(!r.err && r.rows[0].ended_at, "owner ends plan");
  n = await c.query("select count(*)::int k from notifications where plan_id=$1 and type='safe'", [P1]);
  ok(n.rows[0].k === 1, "safe notification after overdue");
  r = await as(c, A, "update trip_plans set status='active' where id=$1", [P1]);
  ok(/already ended/.test(r.err || ""), "ended plan cannot be reopened");
  // 沒超時就結束 → 不通知 safe
  r = await as(c, A, "insert into trip_plans(expected_at, guardians) values ($1, array[$2]::uuid[]) returning id", [exp, B]);
  const P2 = r.rows[0].id;
  // 新行程會把舊的進行中收掉
  r = await as(c, A, "insert into trip_plans(expected_at, guardians) values ($1, array[$2]::uuid[]) returning id", [exp, B]);
  const P3 = r.rows[0].id;
  ok((await c.query("select status from trip_plans where id=$1", [P2])).rows[0].status === "cancelled", "new plan cancels previous active one");
  await as(c, A, "update trip_plans set status='done' where id=$1", [P3]);
  n = await c.query("select count(*)::int k from notifications where plan_id=$1 and type='safe'", [P3]);
  ok(n.rows[0].k === 0, "no safe notification when never overdue");
  // guard_plans 單筆、陌生人查不到
  ok((await as(c, X, "select * from public.guard_plans($1)", [P1])).rows.length === 0, "stranger guard_plans empty");
  ok((await as(c, B, "select * from public.guard_plans($1)", [P1])).rows.length === 1, "guardian gets single plan by id");
  ok((await as(c, null, "select * from public.guard_plans()")).err !== null, "anon cannot call guard_plans");
  // 舊行程 3 天後自動收掉
  r = await as(c, A, "insert into trip_plans(expected_at, guardians) values ($1, array[$2]::uuid[]) returning id", [exp, B]);
  await sys("update trip_plans set expected_at = now() - interval '4 days' where id=$1", [r.rows[0].id]);
  await as(c, B, "select public.trip_plans_check()");
  ok((await c.query("select status from trip_plans where id=$1", [r.rows[0].id])).rows[0].status === "cancelled", "stale plan auto-cancelled (no alert spam)");
  n = await c.query("select count(*)::int k from notifications where plan_id=$1 and type='overdue'", [r.rows[0].id]);
  ok(n.rows[0].k === 1 || n.rows[0].k === 0, "stale plan alert count sane: " + n.rows[0].k);
  // 舊通知類型仍可寫入
  try { await c.query("insert into notifications(user_id, actor_id, type) values ($1,$2,'follow_ok')", [A, B]); ok(true, "old notification types still allowed"); } catch (e) { ok(false, "old types: " + e.message); }
  console.log("FAILS", fails);
  await c.end(); await pg.stop();
})().catch(e => { console.error(e); process.exit(1); });
