#!/usr/bin/env node
// 一次跑完所有自動化測試：npm run test:all（全部）／npm run test:sql（只跑資料庫）
//   1. scripts/check.js（語法、翻譯、備份鍵、SW 版本…）
//   2. 主要流程測試：scripts/{e2e,qa-crawl,audit-ui,audit-center,social-e2e,record-e2e}.js
//   3. 功能測試：scripts/tests/*.test.js（瀏覽器，用假 Supabase）
//   4. 資料庫測試：scripts/tests/pg/*.sql.test.js（本機起一個真的 Postgres 跑 supabase/*.sql）
// 參數：--quick 只跑 1＋3；--only=名稱 只跑檔名含這個字的；--sql 只跑 4
// WSL 上 Playwright 缺的系統函式庫放在 ~/pw-libs（沒有就照系統的跑）
const { spawnSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");
const ROOT = path.resolve(__dirname, "../..");
const args = process.argv.slice(2);
const quick = args.includes("--quick"), sqlOnly = args.includes("--sql");
const only = (args.find(a => a.startsWith("--only=")) || "").slice(7);
const env = { ...process.env };
const pw = path.join(os.homedir(), "pw-libs/root/usr/lib/x86_64-linux-gnu");
if (fs.existsSync(pw)) env.LD_LIBRARY_PATH = [pw, env.LD_LIBRARY_PATH].filter(Boolean).join(":");

const jobs = [];
if (!sqlOnly) {
  jobs.push({ name: "check", file: "scripts/check.js", kind: "check" });
  if (!quick) for (const f of ["e2e", "qa-crawl", "audit-ui", "audit-center", "social-e2e", "record-e2e"]) jobs.push({ name: f, file: `scripts/${f}.js`, kind: "suite" });
  for (const f of fs.readdirSync(__dirname).filter(f => f.endsWith(".test.js")).sort()) jobs.push({ name: f.replace(".test.js", ""), file: `scripts/tests/${f}`, kind: "fn" });
}
let pgOk = true; try { require.resolve("embedded-postgres", { paths: [ROOT] }); require.resolve("pg", { paths: [ROOT] }); } catch (e) { pgOk = false; }
if (pgOk) for (const f of fs.readdirSync(path.join(__dirname, "pg")).filter(f => f.endsWith(".sql.test.js")).sort()) jobs.push({ name: "sql:" + f.replace(".sql.test.js", ""), file: `scripts/tests/pg/${f}`, kind: "fn" });
else if (sqlOnly || !quick) console.log("（略過資料庫測試：沒裝 embedded-postgres／pg，跑 npm install 就有）");

const list = jobs.filter(j => !only || j.name.includes(only));
const results = [];
for (const j of list) {
  const t0 = Date.now();
  process.stdout.write(`▶ ${j.name} … `);
  const r = spawnSync(process.execPath, [j.file], { cwd: ROOT, env, encoding: "utf8", timeout: 20 * 60000, maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || "") + (r.stderr || "");
  let ok, note = "";
  if (j.kind === "fn") {
    const m = out.match(/FAILS (\d+)/), e = out.match(/ERRS (\[.*\])/);
    ok = r.status === 0 && m && +m[1] === 0 && (!e || e[1] === "[]");
    note = m ? `${m[1]} 項失敗` : "沒跑完";
    if (!ok) note += "\n" + out.split("\n").filter(l => /^FAIL|ERRS \[.+\]|Error/.test(l)).slice(0, 12).join("\n");
  } else {
    ok = r.status === 0 && !/✗|FAIL/.test(out);
    if (!ok) note = out.split("\n").filter(l => /✗|FAIL|Error|•/.test(l)).slice(0, 12).join("\n") || out.slice(-1500);
  }
  const s = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(ok ? `✓ (${s}s)` : `✗ (${s}s) ${note}`);
  results.push({ ...j, ok });
}
const bad = results.filter(r => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} 通過` + (bad.length ? `；沒過：${bad.map(b => b.name).join("、")}` : ""));
process.exit(bad.length ? 1 : 0);
