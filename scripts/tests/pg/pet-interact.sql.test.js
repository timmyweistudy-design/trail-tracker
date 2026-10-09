// 夥伴社群·互動（schema-phase41-pet-social.sql，R12）：送小東西、回訪、小隊夥伴外觀、封鎖規則
const { boot, as, ROOT } = require("./harness");
const fs = require("fs");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const { pg, c } = await boot();
  const A = "00000000-0000-0000-0000-00000000000a", B = "00000000-0000-0000-0000-00000000000b", C = "00000000-0000-0000-0000-00000000000c";
  for (const [id, h] of [[A, "amei"], [B, "hsu"], [C, "stranger"]]) { await c.query("insert into auth.users values ($1)", [id]); await c.query("insert into profiles values ($1,$2,$2,null)", [id, h]); }
  await c.query("alter table profiles add column pet_name text; update profiles set pet_name='毛毛' where handle='amei'");
  await c.query("insert into follows values ($1,$2),($2,$1),($1,$3)", [A, B, C]);   // A↔B 互相追蹤；A→C 單向
  await c.query(`create table public.teams(id uuid primary key default gen_random_uuid(), name text);
    create table public.team_members(team_id uuid, user_id uuid);
    create or replace function public.is_team_member(t uuid, u uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists(select 1 from team_members where team_id = t and user_id = u) $$;
    grant select, insert, update, delete on all tables in schema public to authenticated;`);
  await c.query(fs.readFileSync(ROOT + "schema-phase5-safety.sql", "utf8"));
  await c.query(fs.readFileSync(ROOT + "schema-phase9-pet-gifts.sql", "utf8"));
  const p21 = fs.readFileSync(ROOT + "schema-phase21-team-presence.sql", "utf8"); await c.query(p21.slice(0, p21.indexOf("-- ── 隊長控制")));
  for (let i = 0; i < 2; i++) { try { await c.query(fs.readFileSync(ROOT + "schema-phase41-pet-social.sql", "utf8")); ok(true, "phase41 runs " + (i + 1)); } catch (e) { ok(false, "phase41: " + e.message); process.exit(1); } }
  const one = async (uid, sql, p) => { const r = await as(c, uid, sql, p); return r.err ? "ERR " + r.err : r.rows[0] && Object.values(r.rows[0])[0]; };
  const give = (from, to, item) => one(from, "select give_pet_item($1,$2) v", [to, item]);

  // 1) 送小東西
  ok(await give(A, B, "pine") === "ok", "friend → friend: ok");
  const n0 = (await c.query("select count(*)::int n from notifications where user_id=$1 and type='pet_item'", [B])).rows[0].n; ok(n0 === 1, "recipient gets a pet_item notification");
  ok(await give(A, B, "maple") === "daily", "second item same day: refused (daily)");
  await c.query("update pet_item_gifts set created_at = now() - interval '2 days'");
  ok(await give(A, B, "pine") === "dup", "same item to the same friend again: refused (dup)");
  ok(await give(A, B, "maple") === "ok", "different item next day: ok");
  ok(await give(A, C, "pine") === "not_friend", "one-way follow: not_friend");
  ok(await give(A, A, "pine") === "self", "to self: refused");
  ok(/bad item/.test(await give(B, A, "<x>") || ""), "malformed item id: rejected");
  ok(/not signed in/.test(await one(null, "select give_pet_item($1,'pine') v", [B]) || "") || /permission/.test(await one(null, "select give_pet_item($1,'pine') v", [B]) || ""), "anonymous: rejected");
  let r = await as(c, A, "insert into pet_item_gifts(from_user,to_user,item) values ($1,$2,'crystal')", [A, B]); ok(!!r.err, "direct insert bypassing the RPC is blocked by RLS");
  r = await as(c, C, "select * from pet_item_gifts"); ok(r.rows.length === 0, "a stranger can't read other people's gifts");
  // 領取：只領一次
  r = await as(c, B, "select * from claim_pet_items()"); ok(r.rows.length === 2 && r.rows.every(x => x.from_name === "amei"), "claim returns both items with the sender's name " + JSON.stringify(r.rows.map(x => x.item)));
  r = await as(c, B, "select * from claim_pet_items()"); ok(r.rows.length === 0, "second claim (other phone): nothing left");

  // 2) 回訪
  const visit = (from, to) => one(from, "select pet_return_visit($1) v", [to]);
  ok(await visit(B, A) === "ok", "return visit: ok");
  ok(await visit(B, A) === "daily", "second return visit same day: refused");
  ok(await visit(B, C) === "not_friend", "return visit to a non-friend: refused");
  r = await as(c, A, "select * from claim_pet_visits()"); ok(r.rows.length === 1 && r.rows[0].from_name === "hsu", "host claims the visit for the diary " + JSON.stringify(r.rows));
  r = await as(c, A, "select * from claim_pet_visits()"); ok(r.rows.length === 0, "visit claimed only once");

  // 4) 封鎖
  await c.query("update pet_item_gifts set created_at = now() - interval '3 days'");
  await give(A, B, "stone");   // 封鎖之前送出、還沒領
  await c.query("insert into blocks values ($1,$2)", [B, A]);   // B 封鎖 A
  ok(await give(A, B, "acorn") === "blocked", "blocked: give_pet_item refused");
  ok(await give(B, A, "acorn") === "blocked", "blocked works both ways");
  ok(await visit(A, B) === "blocked", "blocked: return visit refused");
  ok(await one(A, "select send_pet_gift($1,3) v", [B]) === false, "blocked: berries (phase9 RPC) refused too");
  r = await as(c, B, "select * from claim_pet_items()"); ok(r.rows.length === 0, "gift sent before the block is not delivered");
  await c.query("delete from blocks");
  ok(await one(A, "select send_pet_gift($1,3) v", [B]) === true, "unblocked friends: berries still work");
  ok(await one(A, "select send_pet_gift($1,3) v", [C]) === false, "berries to a non-friend: refused");

  // 3) 小隊夥伴外觀
  const T = (await c.query("insert into teams(name) values ('t') returning id")).rows[0].id;
  await c.query("insert into team_members values ($1,$2),($1,$3)", [T, A, B]);
  r = await as(c, A, "select upsert_team_presence(p_team => $1, p_ready => true, p_recording => true, p_lat => 24.9, p_lon => 121.7, p_pet => '🦊', p_pet_look => $2::jsonb)", [T, JSON.stringify({ s: 3, h: "straw", a: "scarf" })]);
  ok(!r.err, "upsert with pet_look " + (r.err || ""));
  r = await as(c, B, "select upsert_team_presence(p_team => $1, p_ready => true, p_recording => false, p_name => 'hsu', p_pet => '🐉')", [T]);
  ok(!r.err, "old client (9 named args, no pet_look) still works " + (r.err || ""));
  r = await as(c, B, "select pet, pet_look from team_presence where user_id=$1", [A]); ok(r.rows[0] && r.rows[0].pet === "🦊" && r.rows[0].pet_look.h === "straw", "teammate reads pet_look " + JSON.stringify(r.rows[0]));
  r = await as(c, A, "select upsert_team_presence(p_team => $1, p_ready => true, p_recording => true, p_pet_look => $2::jsonb)", [T, JSON.stringify({ junk: "x".repeat(300) })]);
  ok(/pet_look_size/.test(r.err || ""), "oversized pet_look rejected");
  const fns = (await c.query("select count(*)::int n from pg_proc where proname='upsert_team_presence'")).rows[0].n; ok(fns === 1, "only one upsert_team_presence (no ambiguous overload): " + fns);
  console.log("FAILS", fails); await c.end(); await pg.stop();
})().catch(e => { console.error(e); process.exit(1); });
