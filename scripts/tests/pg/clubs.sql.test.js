// 山社（schema-phase34-clubs.sql）：建立、公開/加入碼加入、上限、退出交棒、踢人、排行只算看得到的貼文
const { boot, as, ROOT } = require("./harness");
const fs = require("fs");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const { pg, c } = await boot();
  const U = n => "00000000-0000-0000-0000-0000000000" + n;
  const [A, B, C, D] = ["0a", "0b", "0c", "0d"].map(U);
  for (const u of [A, B, C, D]) await c.query("insert into auth.users values ($1)", [u]);
  await c.query("insert into profiles values ($1,'amei','阿梅',null),($2,'bob','B',null),($3,'cat','C',null),($4,'dan','D',null)", [A, B, C, D]);
  await c.query(`create table public.blocks(blocker_id uuid, blocked_id uuid);
    create or replace function public.can_see_post(p_author uuid, p_visibility text) returns boolean language sql stable security definer set search_path = public as $$
      select p_visibility = 'public' or p_author = auth.uid() or (p_visibility = 'friends' and public.is_friend(auth.uid(), p_author)); $$;`);
  for (let i = 0; i < 2; i++) { try { await c.query(fs.readFileSync(ROOT + "schema-phase34-clubs.sql", "utf8")); ok(true, "phase34 runs " + (i + 1)); } catch (e) { ok(false, "phase34: " + e.message); process.exit(1); } }
  let r = await as(c, A, "select create_club('週末山友會','每週六爬郊山','臺北市',true,'abc123') id"); ok(!r.err, "create public club " + (r.err || ""));
  const PUB = r.rows[0].id;
  r = await as(c, A, "select create_club('秘密基地',null,null,false,'SECRET') id"); const PRIV = r.rows[0].id;
  ok((await c.query("select role from club_members where club_id=$1 and user_id=$2", [PUB, A])).rows[0].role === "owner", "creator is owner");
  r = await as(c, A, "select create_club('  ',null,null,true,'X1')"); ok(!!r.err, "blank name rejected");
  await as(c, A, "select create_club('三',null,null,true,'C3')");
  r = await as(c, A, "select create_club('四',null,null,true,'C4')"); ok(/club limit/.test(r.err || ""), "max 3 owned clubs");
  // 直接寫表被擋
  r = await as(c, B, "insert into club_members(club_id,user_id) values ($1,$2)", [PRIV, B]); ok(!!r.err, "can't insert membership directly");
  r = await as(c, B, "update clubs set owner=$2 where id=$1", [PUB, B]); ok(!!r.err, "no direct update " + (r.err || ""));
  ok((await c.query("select owner from clubs where id=$1", [PUB])).rows[0].owner === A, "owner unchanged");
  // 列表：B 看得到公開的、看不到私人的；看不到加入碼
  r = await as(c, B, "select * from club_list(null)");
  ok(r.rows.some(x => x.id === PUB && x.members === 1 && !x.is_member && x.join_code === null) && !r.rows.some(x => x.id === PRIV), "B lists public club without code, not private " + (r.err || ""));
  r = await as(c, B, "select * from club_list('台北')"); ok(r.rows.length === 0, "search no match");
  r = await as(c, B, "select * from club_list('臺北')"); ok(r.rows.length === 1 && r.rows[0].id === PUB, "search by region");
  r = await as(c, null, "select * from club_list(null)"); ok(!!r.err || r.rows.length === 0, "anon gets nothing");
  r = await as(c, B, "select id, name from clubs where id=$1", [PRIV]); ok(r.rows.length === 0, "private club row hidden from non-member");
  r = await as(c, B, "select name from clubs where id=$1", [PUB]); ok(r.rows.length === 1, "public club row readable");
  r = await as(c, B, "select join_code from clubs where id=$1", [PUB]); ok(/permission denied/.test(r.err || ""), "join_code column not readable directly");
  // 加入
  r = await as(c, B, "select join_club($1) id", [PRIV]); ok(r.rows[0].id === null, "can't join private by id");
  r = await as(c, B, "select join_club($1) id", [PUB]); ok(r.rows[0].id === PUB, "B joins public");
  r = await as(c, B, "select join_club($1) id", [PUB]); ok(r.rows[0].id === PUB && (await c.query("select count(*)::int n from club_members where club_id=$1", [PUB])).rows[0].n === 2, "join twice is idempotent");
  r = await as(c, C, "select join_club_by_code('secret') id"); ok(r.rows[0].id === PRIV, "C joins private by code (case-insensitive)");
  r = await as(c, C, "select join_club_by_code('NOPE') id"); ok(r.rows[0].id === null, "bad code → null");
  r = await as(c, C, "select * from club_list(null) where id=$1", [PRIV]); ok(r.rows[0] && r.rows[0].join_code === "SECRET" && r.rows[0].my_role === "member", "member sees code");
  // 名單：成員才看得到
  r = await as(c, D, "select * from club_roster($1)", [PUB]); ok(/members only/.test(r.err || ""), "non-member can't read roster");
  r = await as(c, B, "select * from club_roster($1)", [PUB]); ok(r.rows.length === 2 && r.rows[0].handle === "amei" && r.rows[0].role === "owner", "roster owner first");
  r = await as(c, D, "select * from club_members where club_id=$1", [PUB]); ok(r.rows.length === 0, "club_members table hidden from non-member");
  // 排行：B 的公開貼文算；A 只給好友看的貼文 → B 不是 A 的好友就不算
  await c.query(`insert into posts(author_id, visibility, distance_km, ascent, hiked_on) values
    ($1,'public',8.2,500,current_date), ($1,'public',3,100,current_date-2), ($1,'public',50,3000,current_date-20),
    ($2,'friends',12,800,current_date)`, [B, A]);
  await c.query("insert into posts(author_id, visibility, distance_km, ascent, hiked_on, hidden) values ($1,'public',99,9,current_date,true)", [B]);
  r = await as(c, B, "select * from club_board($1,7)", [PUB]);
  const rb = Object.fromEntries(r.rows.map(x => [x.handle, x]));
  ok(!r.err && +rb.bob.km === 11.2 && rb.bob.hikes === 2 && rb.bob.ascent === 600, "board: last 7 days, not hidden " + (r.err || JSON.stringify(rb.bob)));
  ok(+rb.amei.km === 0 && rb.amei.hikes === 0, "board: friends-only post not counted for non-friend");
  await c.query("insert into follows values ($1,$2),($2,$1)", [A, B]);
  r = await as(c, B, "select * from club_board($1,7)", [PUB]); ok(+r.rows[0].km === 12 && r.rows[0].handle === "amei", "board: counted once friends, sorted by km");
  r = await as(c, D, "select * from club_board($1,7)", [PUB]); ok(/members only/.test(r.err || ""), "non-member can't read board");
  // 踢人
  r = await as(c, B, "select kick_club_member($1,$2) ok", [PUB, A]); ok(r.rows[0].ok === false, "member can't kick");
  r = await as(c, A, "select kick_club_member($1,$2) ok", [PUB, B]); ok(r.rows[0].ok === true, "owner kicks B");
  r = await as(c, A, "select kick_club_member($1,$2) ok", [PUB, A]); ok(r.rows[0].ok === false, "owner can't kick self");
  // 社長退出 → 交給最早加入的人
  await as(c, B, "select join_club($1)", [PUB]); await c.query("select pg_sleep(0.01)"); await as(c, D, "select join_club($1)", [PUB]);
  r = await as(c, A, "select leave_club($1) ok", [PUB]); ok(r.rows[0].ok, "owner leaves");
  const own = (await c.query("select owner from clubs where id=$1", [PUB])).rows[0].owner;
  ok(own === B && (await c.query("select role from club_members where club_id=$1 and user_id=$2", [PUB, B])).rows[0].role === "owner", "ownership passed to earliest member");
  r = await as(c, A, "select delete_club($1) ok", [PUB]); ok(r.rows[0].ok === false, "ex-owner can't delete");
  // 最後一人退出 → 刪掉
  await as(c, B, "select leave_club($1)", [PUB]); await as(c, D, "select leave_club($1)", [PUB]);
  ok((await c.query("select count(*)::int n from clubs where id=$1", [PUB])).rows[0].n === 0, "last member leaving deletes club");
  r = await as(c, A, "select delete_club($1) ok", [PRIV]); ok(r.rows[0].ok && (await c.query("select count(*)::int n from club_members where club_id=$1", [PRIV])).rows[0].n === 0, "owner deletes club, members cascade");
  // 加入上限 20
  const ids = [];
  for (let i = 0; i < 21; i++) { await c.query("insert into clubs(name,is_public,join_code) values ($1,true,$2)", ["c" + i, "J" + i]); ids.push((await c.query("select id from clubs where join_code=$1", ["J" + i])).rows[0].id); }
  let last; for (const id of ids) last = await as(c, D, "select join_club($1)", [id]);
  ok(/join limit/.test(last.err || ""), "max 20 joined clubs");
  console.log("FAILS", fails); await c.end(); await pg.stop();
})().catch(e => { console.error(e); process.exit(1); });
