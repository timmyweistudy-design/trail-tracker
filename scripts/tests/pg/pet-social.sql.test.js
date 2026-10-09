// 夥伴社群欄位（phase38 頭飾＋擺設、phase39 當下狀態、phase40 配件）：可重複執行、格式限制擋得住、本人可以更新
const { boot, as, ROOT } = require("./harness");
const fs = require("fs");
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const { pg, c } = await boot();
  const A = "00000000-0000-0000-0000-00000000000a";
  await c.query("insert into auth.users values ($1)", [A]);
  await c.query("insert into profiles values ($1,'amei','阿梅',null)", [A]);
  for (const f of ["schema-phase38-pet-scene.sql", "schema-phase39-pet-state.sql", "schema-phase40-pet-acc.sql"])
    for (let i = 0; i < 2; i++) { try { await c.query(fs.readFileSync(ROOT + f, "utf8")); ok(true, `${f} runs ${i + 1}`); } catch (e) { ok(false, `${f}: ${e.message}`); process.exit(1); } }
  const up = (set, v) => as(c, A, `update profiles set ${set} = $2 where id = $1`, [A, v]);
  let r = await up("pet_acc", "scarf"); ok(!r.err, "own pet_acc = scarf " + (r.err || ""));
  r = await up("pet_acc", null); ok(!r.err, "pet_acc can be cleared");
  r = await up("pet_acc", "x".repeat(17)); ok(/profiles_pet_acc_fmt/.test(r.err || ""), "pet_acc too long rejected");
  r = await up("pet_acc", "<img onerror=1>"); ok(/profiles_pet_acc_fmt/.test(r.err || ""), "pet_acc with markup rejected");
  r = await up("pet_state", JSON.stringify({ last: "2026-10-09T01:00:00Z", wx: "rain", wxAt: "2026-10-09T01", at: "2026-10-09T02:13:00.000Z" })); ok(!r.err, "pet_state with sync time fits the size limit " + (r.err || ""));
  r = await up("pet_state", JSON.stringify({ junk: "x".repeat(500) })); ok(/profiles_pet_state_size/.test(r.err || ""), "oversized pet_state rejected");
  const row = (await c.query("select pet_acc, pet_state->>'at' synced from profiles where id=$1", [A])).rows[0];
  ok(row.pet_acc === null && row.synced === "2026-10-09T02:13:00.000Z", "stored " + JSON.stringify(row));
  console.log("FAILS", fails); await c.end(); await pg.stop();
})().catch(e => { console.error(e); process.exit(1); });
