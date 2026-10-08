#!/usr/bin/env node
// 一次跑完所有自動化測試：npm run test:all（全部，並行）／npm run test:sql（只跑資料庫）／npm run test:changed（只跑跟改動有關的）
//   1. scripts/check.js（語法、翻譯、備份鍵、SW 版本…）
//   2. 主要流程測試：scripts/{e2e,qa-crawl,audit-ui,audit-center,social-e2e,record-e2e}.js
//   3. 功能測試：scripts/tests/*.test.js（瀏覽器，用假 Supabase）
//   4. 資料庫測試：scripts/tests/pg/*.sql.test.js（本機起一個真的 Postgres 跑 supabase/*.sql）
// 參數：--quick 只跑 1＋3；--only=名稱 只跑檔名含這個字的；--sql 只跑 4；--changed 只跑跟改動有關的（git 還沒推上去的＋工作區）
//       --jobs=N 同時跑幾組（預設依 CPU，最多 8）；--serial 一組一組跑（舊做法）；--no-retry 失敗不重跑
// 2026-10-04 並行化：以前一組接一組排隊跑 27 分鐘（20 核心大部分閒著）。現在：
//   - 每組分配不重複的 port（TT_PORT，各測試讀它；單獨跑時用各自原本的 port）
//   - 最久的先開跑（上次的耗時記在 scripts/tests/out/durations.json）
//   - 失敗的那組等大家跑完後單獨重跑一次：過了算「不穩定」（列出來、不擋），兩次都失敗才算失敗
//   - 資料庫測試（共用本機 Postgres）最後依序跑
// WSL 上 Playwright 缺的系統函式庫放在 ~/pw-libs（沒有就照系統的跑）
const { spawn, execSync } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");
const ROOT = path.resolve(__dirname, "../..");
const args = process.argv.slice(2);
const quick = args.includes("--quick"), sqlOnly = args.includes("--sql"), serial = args.includes("--serial"), noRetry = args.includes("--no-retry"), changed = args.includes("--changed");
const only = (args.find(a => a.startsWith("--only=")) || "").slice(7);
const JOBS = serial ? 1 : Math.max(1, +((args.find(a => a.startsWith("--jobs=")) || "").slice(7)) || Math.min(8, Math.max(2, os.cpus().length - 4)));
const env = { ...process.env };
const pw = path.join(os.homedir(), "pw-libs/root/usr/lib/x86_64-linux-gnu");
if (fs.existsSync(pw)) env.LD_LIBRARY_PATH = [pw, env.LD_LIBRARY_PATH].filter(Boolean).join(":");
const DUR = path.join(__dirname, "out", "durations.json");
let dur = {}; try { dur = JSON.parse(fs.readFileSync(DUR, "utf8")); } catch (e) { /* 第一次跑 */ }

const jobs = [];
if (!sqlOnly) {
  jobs.push({ name: "check", file: "scripts/check.js", kind: "check" });
  if (!quick) for (const f of ["e2e", "qa-crawl", "audit-ui", "audit-center", "social-e2e", "record-e2e"]) jobs.push({ name: f, file: `scripts/${f}.js`, kind: "suite" });
  const SOLO = new Set(["pet-perf-budget"]);   // 量效能的：並行時大家搶 CPU，fps 會掉（2026-10-08 實測 60→41），最後單獨跑（借用資料庫測試「最後依序跑」那一段）
  const SHARD = { "pet-stage": 3 };   // 單跑很久的測試拆成幾組平行跑（測試檔讀 PS_SHARD；2026-10-07：pet-stage 單跑 8～10 分鐘）
  for (const f of fs.readdirSync(__dirname).filter(f => f.endsWith(".test.js")).sort()) { const nm = f.replace(".test.js", ""), k = SHARD[nm] || 1;
    for (let i = 0; i < k; i++) jobs.push({ name: k > 1 ? `${nm}#${i + 1}` : nm, file: `scripts/tests/${f}`, kind: "fn", env: k > 1 ? { PS_SHARD: `${i}/${k}` } : null, pg: SOLO.has(nm) }); }
}
let pgOk = true; try { require.resolve("embedded-postgres", { paths: [ROOT] }); require.resolve("pg", { paths: [ROOT] }); } catch (e) { pgOk = false; }
if (pgOk) for (const f of fs.readdirSync(path.join(__dirname, "pg")).filter(f => f.endsWith(".sql.test.js")).sort()) jobs.push({ name: "sql:" + f.replace(".sql.test.js", ""), file: `scripts/tests/pg/${f}`, kind: "fn", pg: true });
else if (sqlOnly || !quick) console.log("（略過資料庫測試：沒裝 embedded-postgres／pg，跑 npm install 就有）");

// ── --changed：改了哪些檔 → 跑哪些測試（對不到的 web/ 檔案就跑主要流程；check 一律跑）──
const MAP = [
  [/web\/js\/(pet-art|pet-stage|stage-art|art-kit|pet)\.js$/, ["pet-stage", "pet-motion", "pet", "pet-visit", "year-story", "pet-clock", "pet-handoff", "pet-settle", "pet-perf-budget", "pet-small", "pet-r4"]],
  [/web\/js\/pet-walk\.js$/, ["pet-stage", "pet-motion", "pet-handoff", "pet-perf-budget"]],
  [/web\/js\/(pet-journey|postcard-art)\.js$/, ["pet-stage", "pet"]],
  [/web\/js\/storage\.js$/, ["backup-merge", "pet-settle", "me", "e2e"]],
  [/web\/js\/achievements\.js$/, ["achievements", "pet"]],
  [/web\/js\/social\//, ["social", "social-e2e", "pet-visit", "clubs", "pro-admin", "pet-settle"]],
  [/web\/js\/(record|recorder|record-v2|native-live|review)[^/]*\.js$/, ["record-v2", "record-e2e", "native-live", "e2e"]],
  [/web\/js\/(detail|ecology|trail)[^/]*\.js$/, ["detail-v2", "guardian-crowd", "e2e"]],
  [/web\/js\/(splash|warmup)\.js$/, ["splash"]],
  [/web\/js\/(me|analytics|year-story)\.js$/, ["me", "year-story", "wave2", "pet-r4"]],
  [/web\/js\/(search|nl-search)[^/]*\.js$/, ["nl-search", "e2e"]],
  [/web\/js\/(app|app-boot|debug)\.js$|web\/index\.html$/, ["debug-tour", "e2e", "qa-crawl", "pet-clock"]],
  [/web\/js\/i18n/, ["wave1-display", "wave1"]],
  [/web\/css\//, ["audit-ui", "audit-center", "motion", "pet-small"]],
  [/supabase\/.*\.sql$/, ["sql:"]],
];
function pickChanged() {
  let files = [];
  const git = c => { try { return execSync(c, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").filter(Boolean); } catch (e) { return []; } };
  files = [...new Set([...git("git diff --name-only @{u}"), ...git("git diff --name-only HEAD"), ...git("git ls-files --others --exclude-standard")])];
  const want = new Set(["check"]);
  for (const f of files) {
    const t = f.match(/^scripts\/(?:tests\/)?(?:pg\/)?([^/]+?)(?:\.sql)?(?:\.test)?\.js$/);
    if (t) { want.add(f.includes("/pg/") ? "sql:" + t[1] : t[1]); continue; }
    const hit = MAP.filter(([re]) => re.test(f));
    if (hit.length) hit.forEach(([, ns]) => ns.forEach(n => want.add(n)));
    else if (/^web\//.test(f)) ["e2e", "qa-crawl"].forEach(n => want.add(n));
  }
  console.log(`只跑跟改動有關的（${files.length} 個檔案）：${[...want].join("、")}`);
  return j => [...want].some(n => n.endsWith(":") ? j.name.startsWith(n) : j.name === n || j.name.startsWith(n + "#"));
}
const keep = changed ? pickChanged() : () => true;
const list = jobs.filter(j => (!only || j.name.includes(only)) && keep(j));

function judge(j, code, out) {
  if (j.kind === "fn") {
    const m = out.match(/FAILS (\d+)/), e = out.match(/ERRS (\[.*\])/);
    const ok = code === 0 && m && +m[1] === 0 && (!e || e[1] === "[]");
    let note = m ? `${m[1]} 項失敗` : "沒跑完";
    if (!ok) note += "\n" + out.split("\n").filter(l => /^FAIL|ERRS \[.+\]|Error/.test(l)).slice(0, 12).join("\n");
    return { ok, note };
  }
  const ok = code === 0 && !/✗|FAIL/.test(out);
  return { ok, note: ok ? "" : (out.split("\n").filter(l => /✗|FAIL|Error|•/.test(l)).slice(0, 12).join("\n") || out.slice(-1500)) };
}
let portSeq = 0;
function run(j) {
  return new Promise(res => {
    const t0 = Date.now(), port = 9100 + (portSeq++ % 200);
    const ch = spawn(process.execPath, [j.file], { cwd: ROOT, env: { ...env, ...(j.env || {}), TT_PORT: String(port) } });
    let out = "";
    ch.stdout.on("data", d => { out += d; }); ch.stderr.on("data", d => { out += d; });
    const kill = setTimeout(() => ch.kill("SIGKILL"), 20 * 60000);
    ch.on("close", code => { clearTimeout(kill); res({ ...judge(j, code, out), s: (Date.now() - t0) / 1000 }); });
  });
}
const line = (j, r, tag) => console.log(`${r.ok ? "✓" : "✗"} ${j.name}${tag || ""} (${r.s.toFixed(0)}s)${r.ok ? "" : " " + r.note}`);

(async () => {
  const T0 = Date.now(), results = new Map();
  const pool = list.filter(j => !j.pg).sort((a, b) => (dur[b.name] || 60) - (dur[a.name] || 60));   // 最久的先開跑
  console.log(`▶ ${pool.length} 組並行（同時 ${JOBS} 組）${list.some(j => j.pg) ? "，資料庫測試與效能預算最後依序跑" : ""}`);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(JOBS, pool.length) }, async () => {
    while (next < pool.length) { const j = pool[next++]; const r = await run(j); results.set(j.name, r); dur[j.name] = Math.round(r.s); line(j, r); }
  }));
  for (const j of list.filter(j => j.pg)) { const r = await run(j); results.set(j.name, r); dur[j.name] = Math.round(r.s); line(j, r); }
  // 失敗的單獨重跑一次（這時沒有別的測試在搶 CPU）
  const flaky = [];
  if (!noRetry) for (const j of list.filter(j => !results.get(j.name).ok)) {
    const r = await run(j); line(j, r, "（重跑）");
    if (r.ok) { flaky.push(j.name); results.set(j.name, { ...r, ok: true }); }
  }
  try { fs.mkdirSync(path.dirname(DUR), { recursive: true }); fs.writeFileSync(DUR, JSON.stringify(dur, null, 1)); } catch (e) { /* */ }
  const bad = list.filter(j => !results.get(j.name).ok);
  const mm = s => { s = Math.round(s); return `${Math.floor(s / 60)} 分 ${s % 60} 秒`; };
  console.log(`\n${list.length - bad.length}/${list.length} 通過（${mm((Date.now() - T0) / 1000)}）` +
    (flaky.length ? `；不穩定（第一次失敗、單獨重跑通過）：${flaky.join("、")}` : "") + (bad.length ? `；沒過：${bad.map(b => b.name).join("、")}` : ""));
  process.exit(bad.length ? 1 : 0);
})();
