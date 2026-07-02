#!/usr/bin/env node
// 自動偵測 bug：npm run check（commit 前跑）。
// 除了語法檢查，還包含幾條「踩過的坑」規則，避免同類錯誤再發生：
//   A. 語法：所有 web/js/**.js 過 node --check
//   B. 行內按鈕：JS 模板裡列容器（disc-row/team-row/fp/…）內的 .btn，
//      style.css 必須有對應的 width:auto 覆蓋，否則按鈕吃全域 width:100% 會突出（bug #2/#6/#7）
//   C. 本地日期：web/js 禁用 toISOString().slice(0,10) 當「今天」——那是 UTC，
//      台灣早上 8 點前會差一天（bug #12）。請用 app.js 的 todayStr()/localDay()
//   D. 備份完整性：程式裡 setItem 的 tt_* 鍵，必須列在 storage.js 的 BACKUP_KEYS
//      或本檔 BACKUP_EXEMPT（裝置性/可重算的鍵）中，否則雲端備份會漏（bug #14）
//   E. HTML id：app.js 用 $("#xxx") 取的 id 必須存在於 index.html 或 JS 動態模板中（抓打錯字）
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const WEB = path.join(ROOT, "web");
let errors = [];
const err = m => errors.push(m);

function jsFiles(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) out.push(...jsFiles(p));
    else if (f.name.endsWith(".js")) out.push(p);
  }
  return out;
}
const files = jsFiles(path.join(WEB, "js"));
const read = p => fs.readFileSync(p, "utf8");
const rel = p => path.relative(ROOT, p);

// A. 語法
for (const f of files.concat([path.join(WEB, "sw.js")])) {
  try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); }
  catch (e) { err(`[語法] ${rel(f)}\n${String(e.stderr || e.message).trim()}`); }
}

// B. 行內按鈕寬度覆蓋
const css = read(path.join(WEB, "css", "style.css"));
const ROW_CONTAINERS = ["disc-row", "team-row", "fp", "set-block-row", "notif-acts", "im-btns", "backup-row", "rec-controls"];
for (const f of files) {
  const s = read(f);
  for (const box of ROW_CONTAINERS) {
    // 模板中 <div class="box ..."> ... class="btn 出現在同一模板字串 → 需要覆蓋規則
    const reBox = new RegExp(`class="${box}[" ][^]*?class="btn[ "]`);
    if (reBox.test(s)) {
      // width:auto 或 flex:1（flex-basis 接管寬度）都算已覆蓋
      const covered = new RegExp(`\\.${box}[^{}]*\\.btn[^{}]*\\{[^}]*(width:\\s*auto|flex:\\s*1)`).test(css) ||
        new RegExp(`\\.${box} \\.btn[^{}]*,[^{}]*\\{[^}]*(width:\\s*auto|flex:\\s*1)`).test(css) ||
        new RegExp(`,[^{}]*\\.${box} \\.btn[^{}]*\\{[^}]*(width:\\s*auto|flex:\\s*1)`).test(css);
      if (!covered) err(`[排版] ${rel(f)}：容器 .${box} 內有 .btn，但 style.css 缺少「.${box} .btn { width: auto / flex: 1 }」覆蓋，按鈕會吃全域 width:100% 而突出`);
    }
  }
}

// C. UTC 日期當「今天」
for (const f of files) {
  const s = read(f);
  const lines = s.split("\n");
  lines.forEach((l, i) => {
    if (/toISOString\(\)\.slice\(0,\s*10\)/.test(l) && !/localDay|備份|exportedAt/.test(l))
      err(`[日期] ${rel(f)}:${i + 1} 用 toISOString().slice(0,10) 當日期——這是 UTC，會比台灣時間早 8 小時；請改用 todayStr()/localDay()`);
  });
}

// D. 備份完整性：setItem 的 tt_* 鍵要嘛在 BACKUP_KEYS、要嘛在豁免清單
const BACKUP_EXEMPT = new Set([
  "tt_records", "tt_profile", "tt_favs", "tt_log",        // exportAll 另外處理
  "tt_offline_mb", "tt_offline_free",                     // 離線額度：綁裝置，不跨機還原
  "tt_premium", "tt_premium_since",                       // 訂閱狀態：由 Supabase 決定
  "tt_active_rec",                                        // 記錄中暫存
  "tt_team", "tt_team_name", "tt_team_live",              // 目前小隊/同行開關：裝置選擇
  "tt_reported", "tt_saved", "tt_draft", "tt_prof_idx",   // 社群端另存雲端/暫存
  "tt_debug_km",                                          // 測試用
]);
const storageSrc = read(path.join(WEB, "js", "storage.js"));
const bkMatch = storageSrc.match(/BACKUP_KEYS\s*=\s*\[([^\]]*)\]/);
const backupKeys = new Set(bkMatch ? [...bkMatch[1].matchAll(/"([^"]+)"/g)].map(m => m[1]) : []);
const seenKeys = new Set();
for (const f of files) {
  for (const m of read(f).matchAll(/localStorage\.setItem\(\s*["'](tt_[a-z0-9_]+)["']/g)) seenKeys.add(m[1]);
}
for (const k of [...seenKeys].sort()) {
  if (k.startsWith("tt_feed_seen")) continue;   // 動態鍵：已讀游標
  if (!backupKeys.has(k) && !BACKUP_EXEMPT.has(k))
    err(`[備份] localStorage 鍵「${k}」沒有加入 storage.js 的 BACKUP_KEYS，雲端備份會漏掉它（若是裝置性鍵請加進 scripts/check.js 的 BACKUP_EXEMPT 並說明）`);
}

// E. app.js 的 $("#id") 要存在（index.html 靜態 id 或任何 JS 模板動態 id）
const html = read(path.join(WEB, "index.html"));
const knownIds = new Set([...html.matchAll(/id="([\w-]+)"/g)].map(m => m[1]));
for (const f of files) for (const m of read(f).matchAll(/id="([\w-]+)"/g)) knownIds.add(m[1]);
for (const f of files) for (const m of read(f).matchAll(/id=\\"([\w-]+)\\"/g)) knownIds.add(m[1]);
const appSrc = read(path.join(WEB, "js", "app.js"));
appSrc.split("\n").forEach((l, i) => {
  for (const m of l.matchAll(/\$\("#([\w-]+)"\)/g)) {
    if (!knownIds.has(m[1])) err(`[HTML] web/js/app.js:${i + 1} 取用 #${m[1]}，但 index.html 與 JS 模板都沒有這個 id（可能打錯字）`);
  }
});

// F. web/ 有改動但 sw.js 快取版本沒 bump → 使用者拿不到新版（PWA 用舊快取）
try {
  const changed = execFileSync("git", ["diff", "--name-only", "HEAD"], { cwd: ROOT, stdio: "pipe" }).toString().trim().split("\n").filter(Boolean);
  const webChanged = changed.some(f => f.startsWith("web/") && f !== "web/sw.js");
  if (webChanged) {
    const cur = (read(path.join(WEB, "sw.js")).match(/CACHE = "([^"]+)"/) || [])[1];
    const old = (execFileSync("git", ["show", "HEAD:web/sw.js"], { cwd: ROOT, stdio: "pipe" }).toString().match(/CACHE = "([^"]+)"/) || [])[1];
    if (cur && old && cur === old) err(`[版本] web/ 有改動但 web/sw.js 的 CACHE 版本仍是 ${cur}——沒 bump 版本使用者拿不到更新`);
  }
} catch (e) { /* 非 git 環境或首次 commit → 略過 */ }

// G. 跑核心邏輯單元測試
try { execFileSync(process.execPath, [path.join(__dirname, "tests", "test-fixes.js")], { stdio: "pipe" }); }
catch (e) { err(`[測試] 單元測試失敗：\n${String(e.stdout || e.message).trim().split("\n").filter(l => l.startsWith("✗")).join("\n")}`); }

if (errors.length) {
  console.error(`✗ 檢查未通過（${errors.length} 個問題）：\n`);
  for (const e of errors) console.error("• " + e + "\n");
  process.exit(1);
}
console.log(`✓ 檢查通過：${files.length + 1} 個 JS 檔語法、單元測試、按鈕寬度/日期/備份鍵/HTML id/SW 版本規則皆符合`);
