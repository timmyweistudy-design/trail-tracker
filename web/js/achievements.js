// 成就：徽章清單與解鎖（固定 id）、夥伴頁的成就入口、全螢幕「成就步道」五段攀登場景、分享圖卡。
// 從 pet.js 拆出來（2026-10-01）；緊接在 pet.js 之後載入，只有函式與常數，執行時才用到 app.js 的 $、ic、toast 等。
// 成就樹階層（基本→困難）
const ACH_TIERS = ["啟程", "入山", "登高", "縱走", "攻頂", "傳說"];
// 強化3：各階層專屬紋章（用現有 ic 線條圖示，不會空框）
const ACH_TIER_IC = ["footprints", "leaf", "mountain", "compass", "trophy", "crown"];
// 強化1：成就分六類，各給色與圖示（步道路徑上的節點依類上色）
const ACH_CAT = {
  dist: { i: "route", col: "#3f9d5c" }, climb: { i: "mountain", col: "#c26a35" },
  trips: { i: "footprints", col: "#4a7ec8" }, streak: { i: "flame", col: "#d8613e" },
  explore: { i: "compass", col: "#2f9aa4" }, challenge: { i: "target", col: "#8a5cc0" },
  time: { i: "sun", col: "#cf9a2e" },
};
const ACH_CATNAME = { dist: "里程", climb: "爬升", trips: "次數", streak: "連續", explore: "探索", challenge: "挑戰", time: "時刻" };
const ACH_CAT_OF = {
  "初心者": "trips", "週末山友": "trips", "早起鳥": "time", "夜行者": "time",
  "常客": "trips", "50K": "dist", "爬升新手": "climb", "週週不斷": "streak",
  "老山友": "trips", "百K俱樂部": "dist", "爬升大師": "climb", "連續一週": "streak", "健行馬拉松": "challenge", "走遍三縣": "explore",
  "山痴": "trips", "300K": "dist", "玉山高度": "climb", "半馬腳力": "challenge", "挑戰征服": "challenge", "四週堅持": "streak",
  "縱橫五百": "dist", "聖母峰高度": "climb", "走遍十縣": "explore", "步道收藏家": "explore", "月月不休": "streak",
  "千里健行": "dist", "萬米爬升": "climb", "環島達人": "explore", "超馬腳力": "challenge", "全馬腳力": "challenge", "兩百次山旅": "trips",
  // B 批新增
  "破曉行者": "time", "十萬步": "trips", "假日山友": "time", "兩百K": "dist",
  "走遍五縣": "explore", "拔升五百": "climb", "四季行者": "time",
  "凌晨出擊": "time", "離島山旅": "explore", "四年一會": "time",
};
// 成就固定 ID：以前解鎖清單、解鎖日期、分類都用「中文名稱」當 key，只要改一個成就的名字，
// 已解鎖的就會變回沒解鎖。現在一律存 id；舊資料（含舊備份還原）在讀取時把名稱換成 id。
const ACH_ID = {"初心者": "first", "週末山友": "trips3", "早起鳥": "early7", "夜行者": "night", "破曉行者": "dawn", "常客": "trips10", "50K": "km50", "爬升新手": "asc1000", "週週不斷": "weeks2", "十萬步": "steps100k", "假日山友": "weekend5", "老山友": "trips30", "百K俱樂部": "km100", "爬升大師": "asc3000", "連續一週": "days7", "健行馬拉松": "single10", "走遍三縣": "county3", "兩百K": "km200", "走遍五縣": "county5", "山痴": "trips100", "300K": "km300", "玉山高度": "asc3952", "半馬腳力": "single21", "挑戰征服": "hard5", "四週堅持": "weeks4", "拔升五百": "climb500", "四季行者": "seasons4", "凌晨出擊": "night3", "離島山旅": "island", "縱橫五百": "km500", "聖母峰高度": "asc8848", "走遍十縣": "county10", "步道收藏家": "done20", "月月不休": "days30", "千里健行": "km1000", "萬米爬升": "asc10000", "環島達人": "county20", "超馬腳力": "single42", "全馬腳力": "single42", "兩百次山旅": "trips200", "四年一會": "leap"};
function achIdOf(x) { return ACH_ID[x] || x; }
function _achReadSet(key) { try { return new Set((JSON.parse(localStorage.getItem(key)) || []).map(achIdOf)); } catch { return new Set(); } }
function _achReadDates() { let d = {}; try { d = JSON.parse(localStorage.getItem("tt_badges_date")) || {}; } catch { /* */ } const o = {}; for (const k in d) o[achIdOf(k)] = d[k]; return o; }
// 成就徽章：成就樹，強調長期累積（拿掉一鍵可解的收藏類）
// petBadges 快取：資料未變就重用（一次開頁會被叫多次）；簽章涵蓋紀錄/終身/解鎖/完成數
let _pbCache = null, _pbKey = "";
function _pbSig() {
  const L = (typeof Store !== "undefined" && Store.life) ? Store.life() : {};
  const recN = (typeof Store !== "undefined" && Store.getRecords) ? Store.getRecords().length : 0;
  // 步道完成紀錄直接比原字串（以前每次都 JSON 解析一遍，只為了數有幾條完成）
  return `${recN}|${L.km || 0}|${L.trips || 0}|${L.asc || 0}|${L.steps || 0}|${localStorage.getItem("tt_log") || ""}|${localStorage.getItem("tt_badges_got") || ""}|${localStorage.getItem("tt_ach_maxkm") || 0}|${localStorage.getItem("tt_ach_maxasc") || 0}|${localStorage.getItem("tt_ach_island") || 0}`;
}
function _petBadgesCached() { return (_pbCache && _pbKey === _pbSig()) ? _pbCache : null; }
function petBadges() {
  const cached = _petBadgesCached(); if (cached) return cached;
  const recs = realRecords();
  // 累積型指標取「終身統計」（只增不減、不受紀錄上限影響）＋現存紀錄較大者，進度數字才不會失真
  const L = (typeof Store !== "undefined" && Store.life) ? Store.life() : {};
  const n = Math.max(recs.length, L.trips || 0);
  const km = Math.max(recs.reduce((s, r) => s + (r.distanceKm || 0), 0), L.km || 0);
  const asc = Math.max(recs.reduce((s, r) => s + (r.ascent || 0), 0), L.asc || 0);
  // 單次最大里程也持久化（最大的那趟被容量保護砍掉也不倒退）
  let maxOne = recs.reduce((m, r) => Math.max(m, r.distanceKm || 0), 0);
  const savedMax = +(localStorage.getItem("tt_ach_maxkm") || 0);
  if (maxOne > savedMax) { try { localStorage.setItem("tt_ach_maxkm", String(maxOne)); } catch (e) { /* */ } } else maxOne = savedMax;
  const hrs = recs.map(r => new Date(r.date).getHours());
  const early = hrs.some(h => h < 7), night = hrs.some(h => h >= 19);
  // 步道完成紀錄只解析一次（以前 TRAILS.filter 裡每條都呼叫 trailLog → 2939 次 JSON.parse）
  let LOG = {}; try { LOG = JSON.parse(localStorage.getItem("tt_log")) || {}; } catch { /* */ }
  const done = Object.values(LOG).filter(v => v && v.done).length;
  const wk = weeksStreak(), dstreak = (typeof daysStreak === "function") ? daysStreak() : 0;
  // 縣市探索＋難度征服：只算「真實走過/手動完成」的步道（done），非一鍵收藏
  const doneTrails = (typeof TRAILS !== "undefined" && Array.isArray(TRAILS)) ? TRAILS.filter(t => LOG[t.id] && LOG[t.id].done) : [];
  const counties = new Set(doneTrails.map(t => t.region).filter(Boolean)).size;
  const hardDone = doneTrails.filter(t => (t.difficulty || 0) >= 4).length;
  // B 批新增訊號
  let maxAsc = recs.reduce((m, r) => Math.max(m, r.ascent || 0), 0);
  const savedAsc = +(localStorage.getItem("tt_ach_maxasc") || 0);
  if (maxAsc > savedAsc) { try { localStorage.setItem("tt_ach_maxasc", String(maxAsc)); } catch (e) { /* */ } } else maxAsc = savedAsc;
  const dawn = hrs.some(h => h < 6);                       // 清晨 6 點前
  const leap = recs.some(r => { const d = new Date(r.date); return d.getMonth() === 1 && d.getDate() === 29; });   // 閏日 2/29（傳說隱藏彩蛋）
  const weekendN = recs.filter(r => { const d = new Date(r.date).getDay(); return d === 0 || d === 6; }).length;
  const seasonOf = m => [11, 0, 1].includes(m) ? 0 : m <= 4 ? 1 : m <= 7 ? 2 : 3;   // 冬/春/夏/秋
  const seasons = new Set(recs.map(r => seasonOf(new Date(r.date).getMonth()))).size;
  const steps = Math.max(recs.reduce((s, r) => s + (r.steps || 0), 0), L.steps || 0);
  const dark3 = hrs.some(h => h >= 2 && h < 4);            // 凌晨 2–4 點（隱藏彩蛋）
  // 離島：座標落在澎湖/金門/馬祖/蘭嶼/綠島/小琉球，或完成的步道屬離島縣（永久記住，記錄被裁掉也不倒退）
  let island = localStorage.getItem("tt_ach_island") === "1";
  if (!island) {
    const scanned = localStorage.getItem("tt_ach_island_scan") || "";   // 已掃到哪一筆（紀錄日期）；之後只掃更新的
    const fresh = recs.filter(r => (r.date || "") > scanned);
    if (fresh.length) try { localStorage.setItem("tt_ach_island_scan", fresh.reduce((m, r) => (r.date > m ? r.date : m), scanned)); } catch (e) { /* */ }
    island = doneTrails.some(t => ["澎湖縣", "金門縣", "連江縣"].includes(t.region)) || fresh.some(r => (r.track || []).some(p => {
      const lo = p.lon, la = p.lat; if (typeof lo !== "number" || typeof la !== "number") return false;
      return lo < 119.75 ||                                                   // 金門/澎湖
        (lo >= 119.8 && lo <= 120.6 && la >= 25.9 && la <= 26.4) ||           // 馬祖(連江)
        (lo >= 121.4 && lo <= 121.62 && la >= 21.9 && la <= 22.1) ||          // 蘭嶼
        (lo >= 121.4 && lo <= 121.55 && la >= 22.5 && la <= 22.75) ||         // 綠島
        (lo >= 120.3 && lo <= 120.42 && la >= 22.3 && la <= 22.4);            // 小琉球
    }));
    if (island) try { localStorage.setItem("tt_ach_island", "1"); } catch (e) { /* */ }
  }
  // t: 階層(1–6)；p: [目前值, 門檻, 單位] 供進度提示；布林型（早起/夜行）不設 p；hidden: 隱藏彩蛋
  const list = [
    // 啟程
    { e: "👣", n: "初心者", got: n >= 1, d: "完成第一次記錄", p: [n, 1, "次"], t: 1 },
    { e: "🥾", n: "週末山友", got: n >= 3, d: "累積 3 次出行", p: [n, 3, "次"], t: 1 },
    { e: "🌅", n: "早起鳥", got: early, d: "清晨 7 點前出發", t: 1 },
    { e: "🌙", n: "夜行者", got: night, d: "晚間 7 點後出發", t: 1 },
    { e: "🌄", n: "破曉行者", got: dawn, d: "清晨 6 點前出發", t: 1 },
    // 入山
    { e: "🎒", n: "常客", got: n >= 10, d: "累積 10 次出行", p: [n, 10, "次"], t: 2 },
    { e: "📏", n: "50K", got: km >= 50, d: "總里程 50 km", p: [km, 50, "km"], t: 2 },
    { e: "⛰️", n: "爬升新手", got: asc >= 1000, d: "總爬升 1000 m", p: [asc, 1000, "m"], t: 2 },
    { e: "🔥", n: "週週不斷", got: wk >= 2, d: "連續 2 週都有走", p: [wk, 2, "週"], t: 2 },
    { e: "👟", n: "十萬步", got: steps >= 100000, d: "累積 10 萬步", p: [steps, 100000, "步"], t: 2 },
    { e: "🗿", n: "假日山友", got: weekendN >= 5, d: "週末出行 5 次", p: [weekendN, 5, "次"], t: 2 },
    // 登高
    { e: "🏕️", n: "老山友", got: n >= 30, d: "累積 30 次出行", p: [n, 30, "次"], t: 3 },
    { e: "💯", n: "百K俱樂部", got: km >= 100, d: "總里程 100 km", p: [km, 100, "km"], t: 3 },
    { e: "🦅", n: "爬升大師", got: asc >= 3000, d: "總爬升 3000 m", p: [asc, 3000, "m"], t: 3 },
    { e: "📅", n: "連續一週", got: dstreak >= 7, d: "連續 7 天健行", p: [dstreak, 7, "天"], t: 3 },
    { e: "🏃", n: "健行馬拉松", got: maxOne >= 10, d: "單次步行 ≥ 10 km", p: [maxOne, 10, "km"], t: 3 },
    { e: "🧭", n: "走遍三縣", got: counties >= 3, d: "完成 3 個縣市的步道", p: [counties, 3, "縣"], t: 3 },
    { e: "🎽", n: "兩百K", got: km >= 200, d: "總里程 200 km", p: [km, 200, "km"], t: 3 },
    { e: "🌐", n: "走遍五縣", got: counties >= 5, d: "完成 5 個縣市", p: [counties, 5, "縣"], t: 3 },
    // 縱走
    { e: "🧗", n: "山痴", got: n >= 100, d: "累積 100 次出行", p: [n, 100, "次"], t: 4 },
    { e: "🚀", n: "300K", got: km >= 300, d: "總里程 300 km", p: [km, 300, "km"], t: 4 },
    { e: "🗻", n: "玉山高度", got: asc >= 3952, d: "總爬升 3952 m（一座玉山）", p: [asc, 3952, "m"], t: 4 },
    { e: "🥇", n: "半馬腳力", got: maxOne >= 21, d: "單次步行 ≥ 21 km", p: [maxOne, 21, "km"], t: 4 },
    { e: "⚔️", n: "挑戰征服", got: hardDone >= 5, d: "完成 5 條挑戰級以上步道", p: [hardDone, 5, "條"], t: 4 },
    { e: "🗓️", n: "四週堅持", got: wk >= 4, d: "連續 4 週都有走", p: [wk, 4, "週"], t: 4 },
    { e: "🪜", n: "拔升五百", got: maxAsc >= 500, d: "單次爬升 ≥ 500 m", p: [maxAsc, 500, "m"], t: 4 },
    { e: "🍂", n: "四季行者", got: seasons >= 4, d: "春夏秋冬都走過", p: [seasons, 4, "季"], t: 4 },
    { e: "🌌", n: "凌晨出擊", got: dark3, d: "凌晨 2–4 點出發", t: 4, hidden: true },
    { e: "🏝️", n: "離島山旅", got: island, d: "在離島記錄一次健行", t: 4, hidden: true },
    // 攻頂
    { e: "🏆", n: "縱橫五百", got: km >= 500, d: "總里程 500 km", p: [km, 500, "km"], t: 5 },
    // 聖母峰 2020 年中尼聯合測量 8,848.86 m → 8,849
    { e: "🏔️", n: "聖母峰高度", got: asc >= 8849, d: "總爬升 8849 m（一座聖母峰）", p: [asc, 8849, "m"], t: 5 },
    { e: "🌏", n: "走遍十縣", got: counties >= 10, d: "完成 10 個縣市", p: [counties, 10, "縣"], t: 5 },
    { e: "🎯", n: "步道收藏家", got: done >= 20, d: "完成 20 條步道", p: [done, 20, "條"], t: 5 },
    { e: "❄️", n: "月月不休", got: dstreak >= 30, d: "連續 30 天健行", p: [dstreak, 30, "天"], t: 5 },
    // 傳說
    { e: "👑", n: "千里健行", got: km >= 1000, d: "總里程 1000 km", p: [km, 1000, "km"], t: 6 },
    { e: "🌋", n: "萬米爬升", got: asc >= 10000, d: "總爬升 10000 m", p: [asc, 10000, "m"], t: 6 },
    { e: "🗺️", n: "環島達人", got: counties >= 20, d: "完成 20 個縣市", p: [counties, 20, "縣"], t: 6 },
    // 42.195 km 是一場全程馬拉松；「超馬」是超過全馬的距離（以前叫「超馬腳力」是錯的，id 不變、已解鎖的不受影響）
    { e: "🦿", n: "全馬腳力", got: maxOne >= 42.195, d: "單次步行 ≥ 42.195 km（一場全馬的距離）", p: [maxOne, 42.195, "km"], t: 6 },
    { e: "⭐", n: "兩百次山旅", got: n >= 200, d: "累積 200 次出行", p: [n, 200, "次"], t: 6 },
    { e: "🍀", n: "四年一會", got: leap, d: "在閏日 2/29 記錄一次", t: 6, hidden: true },
  ];
  // 成就一旦解鎖就永久保留：舊紀錄被容量保護裁掉（最多存 100 筆）時，重算會低於門檻，
  // 所以把解鎖過的名字存進 tt_badges_got，顯示時取聯集。
  const raw = localStorage.getItem("tt_badges_got") || "[]";
  const got = _achReadSet("tt_badges_got");
  let changed = /[\u4e00-\u9fff]/.test(raw);   // 舊格式（中文名稱）→ 順手存回 id 格式
  for (const b of list) {
    b.id = ACH_ID[b.n] || b.n;
    if (b.got && !got.has(b.id)) { got.add(b.id); changed = true; }
    if (got.has(b.id)) b.got = true;
    b.c = ACH_CAT_OF[b.n] || "trips";   // 強化1：標分類
  }
  if (changed) try { localStorage.setItem("tt_badges_got", JSON.stringify([...got])); } catch { /* ignore */ }
  _pbCache = list; _pbKey = _pbSig();
  return list;
}
// 解鎖偵測：記錄完成後呼叫，跨門檻就即時 toast 慶祝＋記下解鎖日期（首跑不洗版）
function achCheckUnlocks() {
  _pbCache = null;                       // 強制重算最新達成狀態
  const list = petBadges();
  const gotNames = list.filter(b => b.got).map(b => b.id);
  let seen = null;
  try { seen = JSON.parse(localStorage.getItem("tt_badges_seen")); if (Array.isArray(seen)) seen = seen.map(achIdOf); } catch (e) { /* */ }
  const dates = _achReadDates();
  const now = new Date().toISOString();
  if (!Array.isArray(seen)) {            // 首次：靜默初始化，不洗版
    // 以前全部記成「今天解鎖」；改成用紀錄回推跨過門檻那天，推不出來的就不寫（顯示「已達成」）
    const est = _achEstDates(list);
    for (const nm of gotNames) if (!dates[nm] && est[nm]) dates[nm] = est[nm];
    try { localStorage.setItem("tt_badges_seen", JSON.stringify(gotNames)); localStorage.setItem("tt_badges_date", JSON.stringify(dates)); } catch (e) { /* */ }
    return;
  }
  const seenSet = new Set(seen);
  const fresh = list.filter(b => b.got && !seenSet.has(b.id));
  for (const b of fresh) if (!dates[b.id]) dates[b.id] = now;
  try { localStorage.setItem("tt_badges_seen", JSON.stringify(gotNames)); localStorage.setItem("tt_badges_date", JSON.stringify(dates)); } catch (e) { /* */ }
  if (!fresh.length) return;
  // #19 解鎖獎勵：依階層送果實給寵物
  const reward = fresh.reduce((s, b) => s + (ACH_REWARD[b.t] || 0), 0);
  if (reward > 0 && typeof addBerryBonus === "function") addBerryBonus(reward);
  fresh.slice(0, 3).forEach((b, i) => setTimeout(() => { try { toast(`🏆 ${ttT("解鎖成就")}${ttColon()}${ttT(b.n)} +${ACH_REWARD[b.t] || 0}`, { icon: typeof BERRY_SVG !== "undefined" ? BERRY_SVG : "" }); } catch (e) { /* */ } }, 700 + i * 1700));
  if (fresh.length > 3) setTimeout(() => { try { toast(`🏆 ${ttT("又解鎖")} ${fresh.length - 3} ${ttT("項成就")}　+${reward}`, { icon: typeof BERRY_SVG !== "undefined" ? BERRY_SVG : "" }); } catch (e) { /* */ } }, 700 + 3 * 1700);
  if (typeof refreshAchTree === "function") refreshAchTree();
}
// 回推解鎖日：依時間順序走過每筆紀錄，第一次滿足條件的那筆就是解鎖日（縣市、連續、步道完成這類推不出來的不寫）
const ACH_EST = {
  "初心者": ["n", 1], "週末山友": ["n", 3], "常客": ["n", 10], "老山友": ["n", 30], "山痴": ["n", 100], "兩百次山旅": ["n", 200],
  "50K": ["km", 50], "百K俱樂部": ["km", 100], "兩百K": ["km", 200], "300K": ["km", 300], "縱橫五百": ["km", 500], "千里健行": ["km", 1000],
  "爬升新手": ["asc", 1000], "爬升大師": ["asc", 3000], "玉山高度": ["asc", 3952], "聖母峰高度": ["asc", 8849], "萬米爬升": ["asc", 10000],
  "十萬步": ["steps", 100000], "假日山友": ["wk", 5], "四季行者": ["seasons", 4],
  "健行馬拉松": ["one", 10], "半馬腳力": ["one", 21], "全馬腳力": ["one", 42.195], "拔升五百": ["oneAsc", 500],
  "早起鳥": ["early", 1], "夜行者": ["night", 1], "破曉行者": ["dawn", 1], "凌晨出擊": ["dark3", 1], "四年一會": ["leap", 1],
};
function _achEstDates(list) {
  const out = {};
  try {
    const recs = realRecords().filter(r => r && r.date && !isNaN(new Date(r.date))).sort((a, b) => (a.date < b.date ? -1 : 1));
    const a = { n: 0, km: 0, asc: 0, steps: 0, wk: 0, seasons: 0, one: 0, oneAsc: 0, early: 0, night: 0, dawn: 0, dark3: 0, leap: 0 }, seas = new Set();
    const todo = list.filter(b => b.got && ACH_EST[b.n]);
    for (const r of recs) {
      const d = new Date(r.date), h = d.getHours(), m = d.getMonth(), wd = d.getDay();
      a.n++; a.km += r.distanceKm || 0; a.asc += r.ascent || 0; a.steps += r.steps || 0;
      if (wd === 0 || wd === 6) a.wk++;
      seas.add([11, 0, 1].includes(m) ? 0 : m <= 4 ? 1 : m <= 7 ? 2 : 3); a.seasons = seas.size;
      a.one = Math.max(a.one, r.distanceKm || 0); a.oneAsc = Math.max(a.oneAsc, r.ascent || 0);
      if (h < 7) a.early = 1; if (h >= 19) a.night = 1; if (h < 6) a.dawn = 1; if (h >= 2 && h < 4) a.dark3 = 1;
      if (m === 1 && d.getDate() === 29) a.leap = 1;
      for (const b of todo) { if (out[b.id]) continue; const [k, thr] = ACH_EST[b.n]; if (a[k] >= thr) out[b.id] = new Date(r.date).toISOString(); }
    }
  } catch (e) { /* 推不出來就不寫 */ }
  return out;
}
// #19 各階層解鎖果實獎勵（index=階層 1–6；依難度高低給，整體從少）
const ACH_REWARD = [0, 2, 3, 4, 6, 9, 15];
// #21 成就分數＋#20 山友稱號（依已達成數升級）
const ACH_RANK = ["山腳新手", "入山山友", "登高好手", "縱走達人", "攻頂勇者", "傳說山神"];
function achScore() {
  const list = petBadges(), gotList = list.filter(b => b.got);
  const got = gotList.length, total = list.length;
  const score = gotList.reduce((s, b) => s + b.t * 10, 0);
  // 稱號只看「主線成就」達成比例：隱藏彩蛋不列入門檻，主線全解就升到傳說山神（彩蛋是額外驚喜、非必要）
  const mainList = list.filter(b => !b.hidden);
  const mainGot = mainList.filter(b => b.got).length, mainTotal = mainList.length;
  const idx = Math.min(ACH_RANK.length - 1, Math.floor(mainGot / Math.max(1, mainTotal) * ACH_RANK.length));
  return { got, total, score, rank: ACH_RANK[idx], rankIdx: idx };
}
function achUnlockDate(name) {
  try { const d = _achReadDates()[achIdOf(name)]; if (d) { const t = new Date(d); return `${t.getFullYear()}/${String(t.getMonth() + 1).padStart(2, "0")}/${String(t.getDate()).padStart(2, "0")}`; } } catch (e) { /* */ }
  return "";
}
// 隱藏彩蛋：未達成前只露「？？？」，達成後正常揭曉
function _achHidden(b) { return !!b.hidden && !b.got; }
function _achName(b) { return _achHidden(b) ? "？？？" : ttT(b.n); }
function _achEmo(b) { return _achHidden(b) ? "❓" : b.e; }
// ── 徽章本體（2026-10-04）：以前用 emoji，很多裝置（還有截圖用的瀏覽器）會變成空框 ──
// 外框金屬依階層（啟程銅 → 入山紅銅 → 登高銀 → 縱走金 → 攻頂白金 → 傳說玉），外形也越高階越華麗
// （圓 → 齒輪邊 → 放射星）；中間是分類色的圓盤＋該徽章自己的線條圖示；達成多兩條緞帶，沒達成是灰的＋進度圈＋鎖。
// 純 SVG、自帶顏色（不靠 CSS），分享圖卡的 canvas 也能直接畫。
const ACH_ICON = { "初心者": "footprints", "週末山友": "backpack", "早起鳥": "sun", "夜行者": "moon", "破曉行者": "sunset", "常客": "repeat", "50K": "ruler",
  "爬升新手": "mountain", "週週不斷": "flame", "十萬步": "steps", "假日山友": "calendar", "老山友": "tree", "百K俱樂部": "route", "爬升大師": "bird",
  "連續一週": "fire", "健行馬拉松": "flag", "走遍三縣": "compass", "兩百K": "map", "走遍五縣": "globe", "山痴": "heart", "300K": "star",
  "玉山高度": "mountain", "半馬腳力": "medal", "挑戰征服": "target", "四週堅持": "shield", "拔升五百": "up", "四季行者": "leaf", "凌晨出擊": "sparkle",
  "離島山旅": "wave", "縱橫五百": "trophy", "聖母峰高度": "snow", "走遍十縣": "pin", "步道收藏家": "bookmark", "月月不休": "clock",
  "千里健行": "wind", "萬米爬升": "cloud", "環島達人": "lake", "超馬腳力": "flag", "全馬腳力": "medal", "兩百次山旅": "crown", "四年一會": "sprout" };
// 外框配色＝稱號的顏色（使用者要求 2026-10-04）：山腳新手灰褐、入山山友綠、登高好手青、縱走達人紫、攻頂勇者橘、傳說山神金
// （跟 .ach-rankchip.rank-0～5 同一組色；每階一亮一暗，畫成金屬漸層）
const ACH_METAL = [["#bdb8aa", "#6f6a5b"], ["#86c98f", "#2f7438"], ["#78c6d1", "#236e7a"], ["#a79df0", "#4b40a8"], ["#f2b075", "#a95c1f"], ["#ffe07a", "#e0941a"]];
let _achMU = 0;
function _achRim(t) {   // 外形：1–2 圓、3–4 齒輪邊、5 放射星、6 八角星＋圓
  const poly = (n, r0, r1, rot) => "M" + Array.from({ length: n * 2 }, (_, k) => { const r = k % 2 ? r1 : r0, a = (k / (n * 2)) * Math.PI * 2 + (rot || 0); return (24 + Math.cos(a) * r).toFixed(1) + " " + (24 + Math.sin(a) * r).toFixed(1); }).join(" L") + "Z";
  if (t <= 2) return `M4 24a20 20 0 1 0 40 0a20 20 0 1 0 -40 0Z`;
  if (t <= 4) return poly(14, 21.5, 19.2, 0);
  if (t === 5) return poly(16, 22.5, 18, -Math.PI / 2);
  return poly(8, 23, 17.5, -Math.PI / 2);
}
function achMedal(b, o) {
  o = o || {};
  const t = Math.max(1, Math.min(6, b.t || 1)), got = !!b.got, hid = _achHidden(b), cat = _achCat(b), id = "am" + (++_achMU);
  const [hi, lo] = got ? ACH_METAL[t - 1] : ["#e4e2dc", "#9a978f"];
  const disk = got ? cat.col : "#b9b6ae", pct = _achPct(b);
  const icon = hid ? `<text x="24" y="29.5" text-anchor="middle" font-size="15" font-weight="800" fill="#fff" font-family="sans-serif">?</text>`
    : `<g transform="translate(14 14) scale(.8333)" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${(typeof ICON !== "undefined" && ICON[ACH_ICON[b.n] || cat.i]) || ""}</g>`;
  const ribbon = got ? `<path d="M15 34 L10 46 L15.5 43.5 L18 47 L22 36Z" fill="${cat.col}"/><path d="M33 34 L38 46 L32.5 43.5 L30 47 L26 36Z" fill="${cat.col}"/><path d="M15 34 L10 46 L15.5 43.5Z M33 34 L38 46 L32.5 43.5Z" fill="#000" opacity=".18"/>` : "";
  const r = 22.6, C = 2 * Math.PI * r;
  const ring = !got && !hid && pct > 0 ? `<circle cx="24" cy="24" r="${r}" fill="none" stroke="#fff" stroke-width="3" opacity=".75"/><circle cx="24" cy="24" r="${r}" fill="none" stroke="${cat.col}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${(C * pct / 100).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 24 24)"/>` : "";
  const lock = !got && !o.noLock ? `<g transform="translate(33 33)"><circle r="7" fill="#fffdf6" stroke="#9a978f" stroke-width="1.2"/><rect x="-3.2" y="-1" width="6.4" height="5" rx="1" fill="#8a877f"/><path d="M-1.9 -1v-1.6a1.9 1.9 0 0 1 3.8 0V-1" fill="none" stroke="#8a877f" stroke-width="1.3"/></g>` : "";
  return `<svg class="ach-medal${got ? " got" : " locked"} tier-${t}" viewBox="0 0 48 48" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset=".55" stop-color="${got ? lo : "#c4c1b9"}"/><stop offset="1" stop-color="${hi}"/></linearGradient>
    <radialGradient id="${id}d" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${got ? "#fff" : "#e8e6e0"}" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></radialGradient></defs>
    ${ribbon}${ring}<path d="${_achRim(t)}" fill="url(#${id})" stroke="${lo}" stroke-width="1.2" stroke-linejoin="round"/>
    <circle cx="24" cy="24" r="14.2" fill="${disk}" stroke="${lo}" stroke-width="1"/><circle cx="24" cy="24" r="14.2" fill="url(#${id}d)"/>
    ${t === 6 && got ? `<circle cx="24" cy="24" r="15.6" fill="none" stroke="#f7d877" stroke-width="1.1"/>` : ""}
    ${icon}${got ? `<path d="M15 17 a11 11 0 0 1 12 -6" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".55"/>` : ""}${lock}</svg>`;
}
function _achDesc(b) { return _achHidden(b) ? ttT("神秘成就，達成後揭曉") : ttT(b.d); }
// 還沒完成過步道的縣市裡，挑一條林業署的輕鬆步道（給「走遍 N 縣」一個具體下一步）
function achCountySuggest() {
  let LOG = {}; try { LOG = JSON.parse(localStorage.getItem("tt_log")) || {}; } catch { /* */ }
  const doneReg = new Set(TRAILS.filter(t => LOG[t.id] && LOG[t.id].done).map(t => t.region));
  const cands = TRAILS.filter(t => t.source === "forestry" && t.region && !doneReg.has(t.region) && (t.difficulty || 0) <= 2 && !(typeof isClosed === "function" && isClosed(t)));
  if (!cands.length) return null;
  const d = new Date(); return cands[(d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate()) % cands.length];   // 每天換一條，不會一直跳
}
// 成就資料＋步道 HTML（共用給夥伴頁精簡入口與全螢幕成就步道）
// 還沒達成、有進度的成就，依完成度由高到低（夥伴頁「即將解鎖」、成就頁「你在這」、記錄頁臨門提醒共用）
function achNextUp(list) {
  return (list || petBadges()).filter(b => !b.got && b.p && b.p[1] > 0)
    .map(b => ({ b, ratio: Math.min(1, b.p[0] / b.p[1]) }))
    .sort((a, b) => b.ratio - a.ratio);
}
function buildAchTree() {
  const list = petBadges(), got = list.filter(b => b.got).length;
  const nextUp = achNextUp(list).slice(0, 3);
  const nextHtml = nextUp.length ? `<div class="ach-next-h">${ttT("即將解鎖")}</div><div class="ach-next">${nextUp.map(({ b, ratio }) => {
    const [cur, goal, unit] = b.p, cat = _achCat(b);
    const sug = unit === "縣" ? achCountySuggest() : null;
    return `<div class="anx" style="--c:${cat.col}"><span class="anx-e ach-mdl">${achMedal(b, { noLock: true })}</span><div class="anx-body"><div class="anx-top"><b>${ttT(b.n)}</b><span class="anx-remain">${_achFmt(cur, unit)} / ${goal} ${ttT(unit)}</span></div><div class="anx-bar"><i style="width:${(ratio * 100).toFixed(0)}%"></i></div>${sug ? `<button class="anx-sug" data-anx-trail="${sug.id}">${ic("compass")} ${ttT("試試")} ${escHtml(sug.name)}<span>${escHtml(sug.region)}</span></button>` : ""}</div></div>`;
  }).join("")}</div>` : "";
  return { got, total: list.length, nextHtml };
}
// 夥伴頁的成就入口（精簡）：進度條＋「查看成就步道」按鈕開全螢幕頁；下方保留「即將解鎖」
function renderBadges() {
  const box = $("#petBadges"); if (!box) return;
  const { got, total, nextHtml } = buildAchTree();
  const pct = Math.round(got / total * 100), sc = achScore(), list = petBadges();
  const tiers = ACH_TIERS.map((nm, i) => { const bs = list.filter(b => b.t === i + 1); const g = bs.filter(b => b.got).length; return `<span class="ae-tier${g === bs.length ? " full" : g ? " part" : ""}" title="${ttT(nm)} ${g}/${bs.length}">${ic(ACH_TIER_IC[i])}</span>`; }).join("");
  box.innerHTML = `<div class="section-title">${ic("medal")}${ttT("成就步道")} <span class="badge-count">${got} / ${total}</span></div>
    <button class="ach-entry" id="achOpen" aria-label="${ttT("查看成就步道")}">
      <div class="ae-top"><span class="ach-rankchip rank-${sc.rankIdx}">${ic(ACH_TIER_IC[sc.rankIdx])} ${ttT(sc.rank)}</span><span class="ae-score">${ttT("成就分數")} <b>${sc.score}</b></span><span class="ach-entry-go">${ic("chevron")}</span></div>
      <div class="ach-entry-bar"><i style="width:${pct}%"></i></div>
      <div class="ae-tiers">${tiers}</div>
    </button>
    ${nextHtml}`;
  const bt = $("#achOpen"); if (bt) bt.addEventListener("click", openAchTree);
  box.querySelectorAll("[data-anx-trail]").forEach(b => b.addEventListener("click", () => openDetail(b.dataset.anxTrail)));
}
// —— 成就山景輔助 ——
function _achCat(b) { return ACH_CAT[b.c] || ACH_CAT.trips; }
function _achPct(b) { return b.got ? 100 : (b.p && b.p[1] ? Math.min(100, Math.round(b.p[0] / b.p[1] * 100)) : 0); }
function _achFmt(v, u) { return u === "km" ? v.toFixed(1) : String(Math.round(v)); }
const _ACH_CHK = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`;
const _ACH_LOCK = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;
const _ACH_BIRD = `<svg viewBox="0 0 26 12" class="ach-bird-svg" aria-hidden="true"><path d="M1 8 Q6 1.5 13 7 Q20 1.5 25 8" fill="none" stroke="#5a6b7a" stroke-width="2" stroke-linecap="round"/></svg>`;
// 場景動態：飛鳥＋蝴蝶（HTML 疊層，CSS 動畫）
function _achFauna(scene) {
  let s = `<span class="ach-bird v1">${_ACH_BIRD}</span><span class="ach-bird v2">${_ACH_BIRD}</span>`;
  if (scene === 2 || scene === 4) s += `<span class="ach-bird v3">${_ACH_BIRD}</span>`;
  return `<div class="ach-fauna" aria-hidden="true">${s}</div>`;
}
// 日夜（依真實時間）：天空漸層＋日/月沿天弧升降（東升西落）＋是否夜晚
function _achSky() {
  const d = new Date(), t = d.getHours() + d.getMinutes() / 60;
  const day = t >= 6 && t < 18;
  const f = day ? (t - 6) / 12 : ((t < 6 ? t + 24 : t) - 18) / 12;   // 0=剛升起(東) 1=將落下(西)
  const ox = +(9 + f * 82).toFixed(1);                                // 東(左)→西(右)
  const oy = +(30 + (1 - Math.sin(f * Math.PI)) * 74).toFixed(1);     // 正午最高、地平線最低（px）
  let sky, orb, oc;
  if (day) {
    orb = "sun";
    if (t < 7.3) { sky = "linear-gradient(180deg,#f4c78e 0%,#f2d9bd 42%,#e9e3d2 100%)"; oc = "#ffcf6b"; }       // 破曉
    else if (t > 16.7) { sky = "linear-gradient(180deg,#e78a58 0%,#f0b489 40%,#e6d6bd 100%)"; oc = "#ff9a52"; } // 黃昏
    else { sky = "linear-gradient(180deg,#8dc0e8 0%,#bcd7e6 46%,#e2eadd 100%)"; oc = "#ffe488"; }               // 白天
    return { sky, orb, ox, oy, oc, night: false };
  }
  return { sky: "linear-gradient(180deg,#1a2740 0%,#26334c 46%,#33415c 100%)", orb: "moon", ox, oy, oc: "#eaeef6", night: true };
}
// —— 成就攀登：一個階層一頁（啟程→入山→登高→縱走→攻頂→傳說），一頁頁往上爬 ——
// 以前把全部成就平均切成 5 頁，頁名跟階層對不上（「啟程」頁混進入山成就、沒有縱走頁）
const ACH_NPG = ACH_TIERS.length, PAGE_W = 360, PAGE_H = 660, PAGE_PAD = 48;
// 每頁用哪種山景（0 森林 1 深林 2 稜線 3 雪線 4 雲上）；縱走跟登高同屬稜線，換一組散佈、稜線壓低一點
const ACH_SCENE = [0, 1, 2, 2, 3, 4];
// 頁內之字步道：u=0 底→u=1 頂（頂頁攻峰所以較短）
function _achUX(u, band) { return 180 + Math.sin(u * Math.PI * 3) * 88 * (1 - 0.14 * band); }
function _achUY(u, topY) { return PAGE_H - PAGE_PAD - u * (PAGE_H - PAGE_PAD - topY); }
function _achPgTopY(p) { return p === 4 ? 190 : PAGE_PAD; }
function _achPgTrail(p, night) {
  const band = p / 4, topY = _achPgTopY(p);
  let d = "";
  for (let i = 0; i <= 60; i++) { const u = i / 60; d += (i ? "L" : "M") + _achUX(u, band).toFixed(1) + " " + _achUY(u, topY).toFixed(1) + " "; }
  if (p === 4) {   // 雲上：發光的雲徑（騰雲駕霧）
    const glow = night ? "#8ea3c4" : "#fff6d8", core = night ? "#e6ecf6" : "#fffdf3";
    return `<path d="${d}" fill="none" stroke="${glow}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" opacity=".5"/><path d="${d}" fill="none" stroke="${core}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity=".92"/><path d="${d}" fill="none" stroke="${night ? "#c7d2e4" : "#f2d98f"}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="1 13" opacity=".8"/>`;
  }
  const casing = night ? "#463724" : "#795d36", pc = night ? "#8a7350" : "#d8b878", dash = night ? "#b7a074" : "#fff3d6";
  return `<path d="${d}" fill="none" stroke="${casing}" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${pc}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${dash}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="1 12" opacity=".85"/>`;
}
// —— 場景裝飾元件庫（可縮放、日夜配色；種子亂數散佈鋪滿每頁）——
function _sr(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function _achNearTrail(x, y, band, topY, pad) {
  const denom = PAGE_H - PAGE_PAD - topY, u = (PAGE_H - PAGE_PAD - y) / denom;
  if (u < -0.02 || u > 1.02) return false;
  return Math.abs(x - _achUX(u, band)) < (pad || 40);
}
// 樹外層 .ach-sway 只負責微風搖擺（CSS rotate），內層才定位/縮放，避免 CSS transform 蓋掉 SVG translate
function _swayWrap(inner, x, dur) { const dl = ((Math.round(x) * 7) % 20) / 4; return `<g class="ach-sway" style="animation-duration:${dur}s;animation-delay:-${dl}s">${inner}</g>`; }
// 2026-10-04 美化：有 ArtKit（夥伴舞台那套美工）就畫受光的杉木／闊葉樹／樹叢／草；種子固定（同一頁每次長一樣）
const _AK = () => typeof ArtKit !== "undefined";
const _akR = (x, y) => _sr(Math.round(x * 31 + y * 17));
function _pine(x, y, s, night) {
  if (_AK()) return _swayWrap(`<g transform="translate(${x} ${y}) scale(${s})">${ArtKit.cedar(0, 1, 50, night ? "#2b4a2c" : "#3d7a40")}</g>`, x, 4.6);
  const c = night ? ["#22381f", "#2b4a2a", "#356038"] : ["#2c5a30", "#3c7338", "#4c8a46"], tk = night ? "#33281a" : "#5f452a";
  return _swayWrap(`<g transform="translate(${x} ${y}) scale(${s})"><rect x="-2" y="-13" width="4" height="14" fill="${tk}"/><path d="M0 -47 L-13 -21 L13 -21Z" fill="${c[0]}"/><path d="M0 -37 L-15 -9 L15 -9Z" fill="${c[1]}"/><path d="M0 -27 L-17 3 L17 3Z" fill="${c[2]}"/></g>`, x, 4.6);
}
function _leafTree(x, y, s, night) {
  if (_AK()) return _swayWrap(`<g transform="translate(${x} ${y}) scale(${(s * .62).toFixed(3)})">${ArtKit.broadleaf(0, 0, 1, night ? "#2f5232" : "#559a4e", _akR(x, y))}</g>`, x, 5.2);
  const c = night ? ["#2a4a2c", "#325a34", "#3c6a3c"] : ["#3f7d40", "#57974f", "#6aad5c"], tk = night ? "#33281a" : "#6b4d2e";
  return _swayWrap(`<g transform="translate(${x} ${y}) scale(${s})"><rect x="-2.5" y="-17" width="5" height="18" fill="${tk}"/><circle cx="-10" cy="-25" r="11" fill="${c[0]}"/><circle cx="11" cy="-26" r="11" fill="${c[2]}"/><circle cx="0" cy="-33" r="14" fill="${c[1]}"/><circle cx="0" cy="-24" r="12" fill="${c[2]}"/></g>`, x, 5.4);
}
function _bush(x, y, s, night) {
  if (_AK()) return `<g transform="translate(${x} ${y}) scale(${s})">${ArtKit.crown(0, -8, 26, 16, night ? "#2f5032" : "#4f8f48", _akR(x, y))}</g>`;
  const c = night ? ["#2c4a2e", "#345a34"] : ["#4a8546", "#5c9a52"];
  return `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="-7" cy="-4" rx="10" ry="8" fill="${c[0]}"/><ellipse cx="7" cy="-4" rx="10" ry="8" fill="${c[1]}"/><ellipse cx="0" cy="-9" rx="11" ry="9" fill="${c[0]}"/></g>`;
}
function _grass(x, y, s, night) {
  if (_AK()) return `<g transform="translate(${x} ${y}) scale(${(s * .8).toFixed(3)})">${ArtKit.grass(0, 0, 1, night ? "#3a5a38" : "#5f9e4e", _akR(x, y))}</g>`;
  const c = night ? "#3a5a38" : "#5c9a4e";
  return `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"><path d="M0 0 Q-4 -9 -7 -13"/><path d="M0 0 Q0 -11 1 -16"/><path d="M0 0 Q4 -9 7 -13"/></g>`;
}
function _flower(x, y, s, col) {
  return `<g transform="translate(${x} ${y}) scale(${s})"><line x1="0" y1="0" x2="0" y2="-9" stroke="#4d8a4a" stroke-width="1.5"/><circle cx="0" cy="-11" r="3.2" fill="${col}"/><circle cx="0" cy="-11" r="1.2" fill="#fff"/></g>`;
}
function _rock(x, y, s, night) {
  const r = night ? "#45454e" : "#9a8f7a", rl = night ? "#57575f" : "#b6ac95";
  return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-16 0 Q-19 -12 -7 -15 Q6 -19 15 -8 Q21 -1 14 0 Z" fill="${r}"/><path d="M-7 -15 Q6 -19 15 -8 Q3 -13 -7 -15Z" fill="${rl}"/></g>`;
}
function _snowP(x, y, s, night) {
  return `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="0" rx="20" ry="7" fill="${night ? "#b9c4d2" : "#f3f6ef"}" opacity=".93"/><ellipse cx="-4" cy="-2" rx="11" ry="4" fill="#fff" opacity=".5"/></g>`;
}
function _cairn(x, y, s, night) {
  const r = night ? "#4a4a52" : "#8f8676", rl = night ? "#5c5c65" : "#a9a08d";
  return `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="-2" rx="10" ry="5" fill="${r}"/><ellipse cx="1" cy="-9" rx="8" ry="4.4" fill="${rl}"/><ellipse cx="-1" cy="-15" rx="6" ry="3.6" fill="${r}"/><ellipse cx="0" cy="-20" rx="3.6" ry="2.6" fill="${rl}"/></g>`;
}
function _bird(x, y, s) {
  return `<path d="M${x} ${y} q4.5 -5 9 0 q4.5 -5 9 0" transform="scale(1)" fill="none" stroke="#5a6b7a" stroke-width="${1.6 * s}" stroke-linecap="round" opacity=".7"/>`;
}
function _range(y, amp, col, seed) {
  // 受光稜線（平滑、左上一道亮邊、往下融進霧），以前是一段段折線
  if (_AK()) return ArtKit.mountain(ArtKit.ridgePts(_sr(seed), -14, 374, y, amp, 4), y + 64, col, { lit: .22, fade: ArtKit.tint(col, .3) });
  const rnd = _sr(seed); let d = `M-10 ${(y + 60).toFixed(1)} L-10 ${y.toFixed(1)}`;
  for (let x = 0; x <= 360; x += 30) d += ` L${x} ${(y - rnd() * amp).toFixed(1)}`;
  return `<path d="${d} L372 ${y.toFixed(1)} L372 ${(y + 60).toFixed(1)} Z" fill="${col}"/>`;
}
function _cloud(x, y, s, col, op) {
  return `<g opacity="${op}"><ellipse cx="${x}" cy="${y}" rx="${(30 * s).toFixed(1)}" ry="${(12 * s).toFixed(1)}" fill="${col}"/><ellipse cx="${(x - 15 * s).toFixed(1)}" cy="${(y + 4 * s).toFixed(1)}" rx="${(19 * s).toFixed(1)}" ry="${(9 * s).toFixed(1)}" fill="${col}"/><ellipse cx="${(x + 17 * s).toFixed(1)}" cy="${(y + 4 * s).toFixed(1)}" rx="${(17 * s).toFixed(1)}" ry="${(8 * s).toFixed(1)}" fill="${col}"/></g>`;
}
// 山面散佈：依海拔選植被/岩石/雪，避開步道走廊，近處大遠處小（畫家排序）
function _achScatter(p, ry, night, seed) {
  const band = p / 4, topY = _achPgTopY(p), rnd = _sr((seed == null ? p : seed) * 131 + 7);
  const N = [58, 62, 50, 42][p], arr = [];
  for (let i = 0; i < N; i++) { const x = 4 + rnd() * 352, y = ry + (PAGE_H - ry) * (0.03 + rnd() * 0.95); arr.push({ x, y, r1: rnd(), r2: rnd() }); }
  arr.sort((a, b) => a.y - b.y);
  const fCol = ["#e8607a", "#f2c14e", "#e88fb0", "#7fb2f0", "#f0f0f0"];
  let s = "";
  for (const it of arr) {
    const depth = Math.max(0, Math.min(1, (it.y - ry) / (PAGE_H - ry))), sc = 0.42 + depth * 1.05;
    const big = it.r1 > 0.42;
    if (big && _achNearTrail(it.x, it.y, band, topY, 42)) continue;   // 大件避開步道
    if (p <= 1) {
      if (it.r1 < 0.44) s += _pine(it.x, it.y, sc, night);
      else if (it.r1 < 0.68) s += _leafTree(it.x, it.y, sc * 0.92, night);
      else if (it.r1 < 0.84) s += _bush(it.x, it.y, sc, night);
      else if (it.r1 < 0.93) s += _grass(it.x, it.y, sc, night);
      else s += _flower(it.x, it.y, sc, fCol[(it.r2 * 4) | 0]);
    } else if (p === 2) {
      if (it.r1 < 0.4) s += _rock(it.x, it.y, sc, night);
      else if (it.r1 < 0.6) s += _bush(it.x, it.y, sc * 0.8, night);
      else if (it.r1 < 0.8) s += _grass(it.x, it.y, sc, night);
      else if (depth > 0.62 && it.r1 < 0.9) s += _pine(it.x, it.y, sc * 0.8, night);
      else s += _flower(it.x, it.y, sc * 0.8, fCol[(it.r2 * 4) | 0]);
    } else {   // p===3 攻頂：雪線，白雪為主＋裸岩＋疊石
      if (it.r1 < 0.54) s += _snowP(it.x, it.y, sc * 1.15, night);
      else if (it.r1 < 0.76) s += _rock(it.x, it.y, sc, night);
      else if (it.r1 < 0.9) s += _cairn(it.x, it.y, sc * 0.82, night);
      else s += _snowP(it.x, it.y, sc * 0.7, night);
    }
  }
  return s;
}
// 各頁地表配色：森林綠 → 更深綠 → 登高橄欖岩 → 攻頂雪白
const ACH_GRD = {
  d: [["#5a8544", "#6f9455", "#8f8d5a"], ["#4f7d3e", "#5f8a4a", "#7c8a54"], ["#7c8a44", "#8a8850", "#9c8f66"], ["#dfe7ec", "#c6cfd8", "#a3aeba"]],
  n: [["#2c4531", "#37503a", "#45503f"], ["#26402e", "#304a34", "#3e4a3a"], ["#3a4030", "#40483a", "#4a4a3e"], ["#4c5560", "#434b56", "#363e48"]],
};
// 單頁山景：低海拔森林 → 深林 → 登高橄欖岩稜 → 攻頂雪線 → 雲上騰雲駕霧
// alt：同一種山景的第二頁（縱走）；cloudU：雲上頁每個成就的位置（在它底下墊一朵雲）
// 地標找空位：cands＝候選錨點 [x, y]（錨點在底部中央），box＝[左右半寬, 高]；跟任何徽章（約 28 半徑）重疊就換下一個，都不行就不畫
function _achSpot(cands, box, occ) {
  for (const [x, y] of cands) {
    const L = x - box[0], R = x + box[0], T = y - box[1], B = y;
    if (!(occ || []).some(n => n.x + 28 > L && n.x - 28 < R && n.y + 30 > T && n.y - 30 < B)) return [x, y];
  }
  return null;
}
const _lm = (name, spot, fn) => spot ? `<g class="ach-lm" data-lm="${name}">${fn(spot[0], spot[1])}</g>` : "";
function _achPgSVG(p, night, alt, cloudU, occ) {
  const g = p < 4 ? ACH_GRD[night ? "n" : "d"][p] : ACH_GRD[night ? "n" : "d"][3];
  const snow = night ? "#c2ccd8" : "#f3f6ef", contour = p === 3 ? (night ? "#2c333d" : "#8fa0ae") : (night ? "#000" : "#3f5a34");
  const gid = `apg${p}${alt ? "b" : ""}`, k = alt ? 7 : 0;
  const defs = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${g[0]}"/><stop offset=".55" stop-color="${g[1]}"/><stop offset="1" stop-color="${g[2]}"/></linearGradient></defs>`;
  let far2 = "", bg = "", surf = "", peak = "", cloudsea = "", fg = "";
  if (p < 4) {
    const ry = ([-0.06, -0.04, 0.2, 0.4][p] + (alt ? 0.08 : 0)) * PAGE_H;
    // 天空側（露天時）：多層遠山＋雲＋飛鳥（登高＝藍霧綠嶺、攻頂＝雪白冷峰）
    if (p === 2) {
      far2 += _range(ry - 46, 40, night ? "#3a4b60" : "#c3d4de", 40 + k);
      far2 += _range(ry - 22, 58, night ? "#33455a" : "#aec5d3", 55 + k);
      far2 += _range(ry - 2, 42, night ? "#33503a" : "#8caf6a", 91 + k);
      far2 += _cloud(72, ry - 74, 1.1, night ? "#39495d" : "#eef4fa", .9) + _cloud(298, ry - 50, .9, night ? "#39495d" : "#f6f9fc", .86);
      far2 += _bird(140, ry - 100, 1) + _bird(164, ry - 92, .85) + _bird(188, ry - 102, .95);
    } else if (p === 3) {
      far2 += _range(ry - 54, 52, night ? "#54606e" : "#e4ebf0", 63);   // 雪峰遠稜
      far2 += _range(ry - 26, 66, night ? "#48545f" : "#cdd8df", 77);
      far2 += _range(ry - 2, 40, night ? "#3c4750" : "#b6c3cc", 88);
      far2 += _cloud(80, ry - 30, 1.3, night ? "#4a5563" : "#fbfdff", .82) + _cloud(300, ry - 12, 1.0, night ? "#4a5563" : "#f4f8fc", .8) + _cloud(190, ry - 66, .9, night ? "#42505f" : "#ffffff", .7);
    }
    if (p === 2 || p === 3) far2 += `<rect x="-2" y="${(ry - 18).toFixed(1)}" width="364" height="40" fill="${night ? "#3a4657" : "#dbe6ee"}" opacity=".28"/>`;   // 稜線空氣遠近霧
    if (p === 1) {
      far2 += `<path d="M-10 ${(ry + 46).toFixed(1)} L90 ${(ry - 10).toFixed(1)} L200 ${(ry + 30).toFixed(1)} L320 ${(ry - 6).toFixed(1)} L372 ${(ry + 40).toFixed(1)} Z" fill="${night ? "#2a4530" : "#5f8a4c"}" opacity=".6"/>`;
    }
    // 山體＋等高線
    let d = `M-10 ${PAGE_H + 10} L-10 ${ry.toFixed(1)} `;
    for (let x = 0; x <= 360; x += 24) { const jy = ry + Math.sin(x * 0.07 + p) * 11 + Math.sin(x * 0.021) * 8; d += `L${x} ${jy.toFixed(1)} `; }
    d += `L372 ${ry.toFixed(1)} L372 ${PAGE_H + 10} Z`;
    bg = `<path d="${d}" fill="url(#${gid})"/>`;
    for (let k = 1; k <= 3; k++) { const yy = ry + (PAGE_H - ry) * (k / 4); bg += `<path d="M0 ${yy.toFixed(1)} q90 ${18 - k * 4} 180 0 t180 0" fill="none" stroke="${contour}" stroke-width="2" opacity=".12"/>`; }
    if (p === 3) bg += `<path d="M-10 ${(ry + 10).toFixed(1)} q90 26 180 4 t190 -2 L372 ${PAGE_H} L-10 ${PAGE_H} Z" fill="${night ? "#d7dee6" : "#fbfdff"}" opacity=".35"/>`;   // 雪毯
    // 山面豐富散佈
    surf = _achScatter(p, ry, night, p + (alt ? 11 : 0));
    // 每頁英雄小物
    const occ0 = p === 0 ? (occ || []).concat([{ x: 70, y: 575 }, { x: 110, y: 575 }]) : (occ || []);   // 「登山口」字樣在拱門左邊
    if (p === 0) { const ss = _achSpot([[306, 604], [320, 520], [40, 470]], [32, 56], occ0);
      const occS = ss ? occ0.concat([{ x: ss[0], y: ss[1] - 30 }]) : occ0;   // 解說牌也避開指標牌
      surf = _achDapples(night) + _achArch(night) + surf + _lm("sign", ss, (x, y) => _achSignpost(x, y, 1.1, night)) +
      _lm("board", _achSpot([[52, 452], [310, 440], [48, 330], [312, 300]], [26, 46], occS), (x, y) => _achBoard(x, y, 1, night)); }   // 山腳木造登山口＋指標牌＋解說牌
    if (p === 1) surf = _lm("giant", _achSpot([[296, 396], [64, 420], [300, 220], [60, 220]], [52, 160], occ), (x, y) => _achGiantTree(x, y, 1, night)) + surf +
      _lm("bamboo", _achSpot([[34, 600], [330, 590], [30, 300]], [24, 100], occ), (x, y) => _achBamboo(x, y, .9, night)) + _achFern(330, 606, 1.3, night) + _achFern(76, 300, .9, night);   // 神木、竹叢、蕨
    if (p === 2 && !alt) surf = _achBambooGrass(night, ry, .5, 48) + surf + _lm("trig", _achSpot([[70, 214], [300, 250], [64, 420], [310, 430]], [22, 40], occ), (x, y) => _achTrig(x, y, 1.4, night)) +
      _lm("juniper", _achSpot([[300, 520], [40, 560], [306, 330], [44, 330]], [30, 66], occ), (x, y) => _achJuniper(x - 18, y, .9, night));   // 箭竹草原、三角點、玉山圓柏
    if (p === 2 && alt) { const hs = _achSpot([[292, 380], [70, 380], [292, 540], [70, 540], [290, 250], [70, 250]], [48, 62], occ);
      const occH = hs ? (occ || []).concat([-34, 0, 34].map(d => ({ x: hs[0] + d, y: hs[1] - 30 }))) : occ;   // 圓柏不要長在山屋屋頂上
      surf = _achBambooGrass(night, ry, .5, 48) + surf + _lm("hut", hs, (x, y) => _achHut(x, y, 1, night)) +
      _lm("juniper", _achSpot([[26, 560], [320, 600], [30, 440], [320, 300]], [30, 66], occH), (x, y) => _achJuniper(x - 18, y, .8, night)); }   // 縱走：稜線山屋
    if (p === 3) surf += _achFlagpole(90, ry + 60, night) + _achFlagpole(286, ry + 120, night) + _lm("stele", _achSpot([[78, ry + 70], [300, ry + 50], [70, ry + 220], [300, ry + 240]], [24, 70], occ), (x, y) => _achStele(x, y, 1.2, night)) +
      _lm("juniper", _achSpot([[300, 560], [44, 580], [310, 470]], [30, 66], occ), (x, y) => _achJuniper(x - 18, y, .85, night, true));  // 攻頂旗杆＋主峰碑＋冰雪圓柏
    // 前景框：底部草叢/岩緣/雪堆加深縱深
    fg = _achFg(p, night);
  } else {
    // 雲上傳說：整片雲海騰雲駕霧，無尖峰——只有雲
    const cc = night ? ["#c4cfdc", "#cdd6e2", "#b6c3d3", "#aab8ca"] : ["#eef4fa", "#fbfdff", "#e3edf6", "#d6e4f1"];
    const band = 1, topY = _achPgTopY(4);
    // 高空薄雲＋飛鳥
    far2 += _cloud(70, 196, 1.2, cc[0], .66) + _cloud(300, 150, 1.0, cc[1], .6) + _cloud(184, 108, .8, cc[0], .46);
    far2 += _bird(150, 176, 1) + _bird(176, 168, .85) + _bird(120, 150, .8);
    cloudsea += _achSunGlow(night) + _achPeakTips(night, occ);
    // 每個成就下方一朵浮雲（像踩在雲上）
    (cloudU || []).forEach(u => { cloudsea += _cloud(_achUX(u, band), _achUY(u, topY) + 16, 1.0, cc[1], .95); });
    // 由最高節點接上「傳說」的雲階（不留斷口）
    cloudsea += _cloud(178, 150, .82, cc[1], .92) + _cloud(180, 112, .6, cc[0], .82);
    // 底部厚雲海（多層堆疊）
    [[PAGE_H - 30, 210, cc[3], 1], [PAGE_H - 78, 195, cc[2], 1], [PAGE_H - 126, 175, cc[1], .98], [PAGE_H - 172, 150, cc[0], .9], [PAGE_H - 214, 120, cc[1], .8]].forEach(([y, rx, c, op], i) => {
      cloudsea += `<g opacity="${op}"><ellipse cx="${i % 2 ? 108 : 252}" cy="${y}" rx="${rx}" ry="46" fill="${c}"/><ellipse cx="${i % 2 ? 270 : 92}" cy="${(y + 10)}" rx="${(rx * 0.8).toFixed(0)}" ry="40" fill="${c}"/><ellipse cx="180" cy="${(y + 18)}" rx="205" ry="42" fill="${c}"/></g>`;
    });
  }
  // 頁頂薄霧：軟化上下頁的接縫，並添騰霧氛圍
  let mist = "";
  if (p >= 1) {
    const mc = p >= 3 ? (night ? "#9fb0c4" : "#eef4fa") : (night ? "#33475a" : "#dfeadf"), h = p >= 3 ? 118 : 82, op = p >= 3 ? .5 : .3;
    mist = `<defs><linearGradient id="mist${p}${alt ? "b" : ""}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mc}" stop-opacity="${op}"/><stop offset="1" stop-color="${mc}" stop-opacity="0"/></linearGradient></defs><rect x="-2" y="0" width="364" height="${h}" fill="url(#mist${p}${alt ? "b" : ""})"/>`;
  }
  return `<svg class="ach-page-mtn" viewBox="0 0 ${PAGE_W} ${PAGE_H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${defs}${far2}${bg}${surf}${peak}${cloudsea}${mist}${fg}${_achPgTrail(p, night)}</svg>`;
}
// ── 2026-10-04 每一頁一個台灣步道的地標（擺在步道另一側，不擋徽章）──
// 啟程＝登山口指標牌＋解說牌＋林間光斑；入山＝神木＋竹叢＋蕨；登高＝三角點（方柱、頂面十字）＋箭竹草原＋玉山圓柏；
// 縱走＝稜線山屋（晚上窗戶亮燈）；攻頂＝主峰碑＋冰雪圓柏；傳說＝雲海上冒出的群峰＋日出的金邊
function _achSignpost(x, y, s, night) {
  const w = night ? "#5a4326" : "#8a6636", b = night ? "#7a5c34" : "#c9955a", t = night ? "#3a2c18" : "#5e4024";
  return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-2.6" y="-48" width="5.2" height="48" rx="1.4" fill="${w}"/>
    <path d="M-1 -44 h24 l6 5 l-6 5 h-24Z" fill="${b}" stroke="${t}" stroke-width="1.2"/><path d="M1 -31 h-24 l-6 5 l6 5 h24Z" fill="${b}" stroke="${t}" stroke-width="1.2"/>
    <path d="M3 -39 h16 M-5 -26 h-16" stroke="${t}" stroke-width="1.6" stroke-linecap="round"/><ellipse cx="0" cy="0" rx="9" ry="2.6" fill="#000" opacity=".18"/></g>`;
}
function _achBoard(x, y, s, night) {
  const w = night ? "#5a4326" : "#7a5a32", f = night ? "#3f5a46" : "#e9e1c8", g = night ? "#2f4a3a" : "#7fa66a";
  return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-17" y="-20" width="3.4" height="20" fill="${w}"/><rect x="13.6" y="-20" width="3.4" height="20" fill="${w}"/>
    <path d="M-22 -40 h44 v20 h-44Z" fill="${w}"/><rect x="-19" y="-37.5" width="38" height="15" rx="1" fill="${f}"/><path d="M-16 -26 l7 -7 l5 4 l6 -6 l7 9Z" fill="${g}"/><path d="M-24 -41 h48 l-3 -5 h-42Z" fill="${night ? "#4a3620" : "#5e4024"}"/></g>`;
}
function _achDapples(night) {
  if (night) return "";
  const r = _sr(77); let s = ""; for (let k = 0; k < 9; k++) s += `<ellipse cx="${(20 + r() * 320).toFixed(0)}" cy="${(380 + r() * 260).toFixed(0)}" rx="${(10 + r() * 16).toFixed(0)}" ry="${(3 + r() * 4).toFixed(0)}" fill="#fff6c8" opacity=".22"/>`;
  return s;
}
function _achGiantTree(x, y, s, night) {
  if (!_AK()) return "";
  const tk = night ? "#3b2c1c" : "#6b4a2e", tl = night ? "#4a3824" : "#8a6440", lf = night ? "#284a2e" : "#3f7d44";
  return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-14 0 Q-10 -40 -9 -86 L9 -86 Q10 -40 16 0 Q4 -6 -14 0Z" fill="${tk}"/><path d="M-9 -86 Q-8 -40 -12 0 L-6 0 Q-4 -44 -3 -86Z" fill="${tl}" opacity=".7"/>
    <path d="M-12 -2 q-12 2 -18 6 M14 -2 q12 2 18 6" stroke="${tk}" stroke-width="5" stroke-linecap="round" fill="none"/>
    ${ArtKit.crown(-20, -96, 56, 40, lf, _sr(5))}${ArtKit.crown(24, -104, 60, 44, lf, _sr(6))}${ArtKit.crown(0, -126, 70, 48, lf, _sr(7))}
    <path d="M-6 -60 q4 6 0 12" stroke="#7fb06a" stroke-width="2" fill="none" opacity=".7"/></g>`;
}
function _achBamboo(x, y, s, night) {
  const c = night ? ["#2f4f30", "#3c6236"] : ["#5a9a48", "#7ab85e"], r = _sr(Math.round(x));
  let o = ""; for (let k = 0; k < 6; k++) { const bx = (k - 2.5) * 6 + r() * 3, h = 70 + r() * 30, lean = (r() - .5) * 10, col = c[k % 2];
    o += `<path d="M${bx} 0 Q${bx + lean * .4} ${-h * .5} ${bx + lean} ${-h}" stroke="${col}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`;
    for (let j = 1; j < 4; j++) { const yy = -h * j / 4, xx = bx + lean * j / 4; o += `<path d="M${xx} ${yy} q${(k % 2 ? 1 : -1) * 9} -4 ${(k % 2 ? 1 : -1) * 15} 2 q${(k % 2 ? -1 : 1) * 7} -1 ${(k % 2 ? -1 : 1) * 15} -2Z" fill="${col}" opacity=".9"/>`; } }
  return `<g transform="translate(${x} ${y}) scale(${s})">${o}</g>`;
}
function _achFern(x, y, s, night) {
  const c = night ? "#2f5232" : "#4f9a4a"; let o = "";
  [-40, -15, 15, 40].forEach((a, i) => { o += `<g transform="rotate(${a})"><path d="M0 0 Q2 -10 0 -20" stroke="${c}" stroke-width="1.6" fill="none"/>${[4, 8, 12, 16].map(t => `<path d="M0 ${-t} l-5 -2 M0 ${-t} l5 -2" stroke="${c}" stroke-width="1.4"/>`).join("")}</g>`; });
  return `<g transform="translate(${x} ${y}) scale(${s})" stroke-linecap="round">${o}</g>`;
}
function _achTrig(x, y, s, night) {   // 三角點：方柱基石，頂面十字（台灣山頭最常見的地標）
  const st = night ? "#8a8a90" : "#d8d4c8", sd = night ? "#6a6a70" : "#aaa496";
  return `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="2" rx="22" ry="6" fill="${night ? "#3e4038" : "#8f8a6a"}" opacity=".6"/>
    <path d="M-8 0 L-8 -22 L8 -22 L8 0Z" fill="${st}"/><path d="M8 0 L8 -22 L13 -25 L13 -3Z" fill="${sd}"/><path d="M-8 -22 L-3 -25 L13 -25 L8 -22Z" fill="${night ? "#a0a0a6" : "#ece8dc"}"/>
    <path d="M1 -24.4 h7 M4.5 -25.6 v2.4" stroke="#7a3a2a" stroke-width="1.1"/><path d="M-5 -14 h10 M-5 -9 h7" stroke="${sd}" stroke-width="1.2"/></g>`;
}
function _achBambooGrass(night, ry, band, topY) {   // 箭竹草原：一片低矮的金綠草浪
  if (!_AK()) return "";
  const r = _sr(201); let o = ""; const col = night ? "#4a5a34" : "#a3b04e";
  for (let k = 0; k < 40; k++) { const x = 6 + r() * 348, y = ry + 30 + r() * (PAGE_H - ry - 40); if (_achNearTrail(x, y, band, topY, 30)) continue; const sc = .5 + (y - ry) / (PAGE_H - ry) * .8; o += ArtKit.grass(x, y, sc, col, r); }
  return o;
}
function _achJuniper(x, y, s, night, snow) {
  if (!_AK()) return "";
  return `<g transform="translate(${x} ${y}) scale(${s})">${ArtKit.juniper(0, 0, 1, night ? "#4a3a2c" : "#7a5a40", night ? "#2f4a3a" : "#4a7e5a", _sr(Math.round(x)))}${snow ? `<path d="M30 -53 q16 -6 32 0 q-16 3 -32 0Z M6 -40 q14 -5 28 0 q-14 3 -28 0Z" fill="#fbfdff" opacity=".95"/>` : ""}</g>`;
}
function _achHut(x, y, s, night) {   // 稜線山屋：石砌牆、紅色鐵皮屋頂、煙囪；晚上窗戶亮
  const wall = night ? "#6a6a6e" : "#c9c2b2", wd = night ? "#55555a" : "#a59d8c", roof = night ? "#6a2e28" : "#c0503c", win = night ? "#ffd27a" : "#5f7a8c";
  return `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="2" rx="46" ry="7" fill="#000" opacity=".15"/>
    <path d="M-38 0 V-26 H38 V0Z" fill="${wall}"/><path d="M18 0 V-26 H38 V0Z" fill="${wd}"/>
    <path d="M-38 -26 h3 M-28 -18 h8 M-12 -10 h8 M4 -20 h8 M22 -12 h8" stroke="${wd}" stroke-width="1.4"/>
    <path d="M-44 -24 L-30 -46 H34 L46 -24Z" fill="${roof}"/><path d="M-30 -46 H34 L40 -36 H-36Z" fill="#fff" opacity=".12"/>
    <rect x="22" y="-58" width="7" height="14" fill="${wd}"/>${night ? "" : `<path d="M25 -60 q-4 -6 1 -10 q5 -4 1 -10" stroke="#e8eef2" stroke-width="2.4" fill="none" opacity=".7" stroke-linecap="round"/>`}
    <rect x="-28" y="-20" width="11" height="9" rx="1" fill="${win}"/><rect x="-6" y="-20" width="11" height="9" rx="1" fill="${win}"/><rect x="24" y="-17" width="9" height="17" rx="1" fill="${night ? "#3a2c1c" : "#6b4a2e"}"/>
    ${night ? `<ellipse cx="-12" cy="-6" rx="30" ry="10" fill="#ffd27a" opacity=".12"/>` : ""}</g>`;
}
function _achStele(x, y, s, night) {   // 主峰碑：立起的石碑＋底座（不刻字：字會跟著語言變）
  const st = night ? "#7c7c84" : "#cfc8b8", sd = night ? "#606068" : "#a39b88", base = night ? "#55555c" : "#9a927e";
  return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-22 0 L-18 -8 H18 L22 0Z" fill="${base}"/>
    <path d="M-11 -8 V-52 Q0 -60 11 -52 V-8Z" fill="${st}"/><path d="M5 -8 V-56 Q9 -55 11 -52 V-8Z" fill="${sd}"/>
    <path d="M-5 -46 v30 M0 -48 v32" stroke="${sd}" stroke-width="1.6" stroke-linecap="round"/><path d="M-13 -52 Q0 -64 13 -52 Q0 -58 -13 -52Z" fill="#fbfdff" opacity=".9"/></g>`;
}
function _achPeakTips(night, occ) {   // 雲海上冒出來的山頭（左、右兩側，不擋步道）＋日出金邊
  const c = night ? "#4a5468" : "#7d8ca6", lit = night ? "#6b7690" : "#f2c48a";
  const peak = (x, y, w, h) => `<path d="M${x - w} ${y} L${x - w * .25} ${y - h * .8} L${x} ${y - h} L${x + w * .4} ${y - h * .7} L${x + w} ${y}Z" fill="${c}"/><path d="M${x - w * .25} ${y - h * .8} L${x} ${y - h} L${x + w * .1} ${y - h * .55} L${x - w * .4} ${y - h * .5}Z" fill="${lit}" opacity=".85"/>`;
  // 山頭也避開徽章：每座山先找空位（找不到就不畫那一座）
  const P = [[[56, 470], [40, 540], [70, 400]], [[312, 446], [320, 540], [300, 380]], [[250, 486], [130, 520], [230, 560]]].map((c, k) => { const w = [46, 54, 30][k], h = [64, 82, 36][k], sp = _achSpot(c, [w, h], occ); return sp ? `<g class="ach-lm" data-lm="peaks">${peak(sp[0], sp[1], w, h)}</g>` : ""; }).join("");
  return `<g opacity=".95">${P}</g>`;
}
function _achSunGlow(night) {   // 日出時雲海上的一道金光
  return (night ? "" : `<rect x="-2" y="380" width="364" height="110" fill="url(#achSunGlow)"/><defs><linearGradient id="achSunGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd59a" stop-opacity="0"/><stop offset=".6" stop-color="#ffd59a" stop-opacity=".35"/><stop offset="1" stop-color="#ffd59a" stop-opacity="0"/></linearGradient></defs>`);
}
// 山腳登山口木拱門（框住「啟程」）
function _achArch(night) {
  const w = night ? "#5a4326" : "#8a6636", wl = night ? "#6b5230" : "#a67c44";
  const bx = _achUX(0, 0), by = PAGE_H - PAGE_PAD;
  return `<g transform="translate(${bx.toFixed(1)} ${by.toFixed(1)})"><rect x="-40" y="-58" width="9" height="58" rx="2" fill="${w}"/><rect x="31" y="-58" width="9" height="58" rx="2" fill="${w}"/><path d="M-44 -58 Q0 -76 44 -58 L44 -50 Q0 -68 -44 -50 Z" fill="${wl}"/><rect x="-16" y="-52" width="32" height="13" rx="2" fill="${wl}"/></g>`;
}
// 攻頂路標旗杆
function _achFlagpole(x, y, night) {
  return `<g transform="translate(${x} ${y})"><rect x="-1.5" y="-40" width="3" height="40" fill="${night ? "#8a7350" : "#6b4d2e"}"/><path class="ach-flag" d="M1 -40 L22 -34 L1 -27 Z" fill="${night ? "#c98a4a" : "#e2a24c"}"/></g>`;
}
// 前景框：底部近景（森林草叢／攻頂雪堆／雲上雲湧），加深縱深且避開中央步道口
function _achFg(p, night) {
  const y = PAGE_H - 6;
  if (p === 4) {   // 雲上：前景翻湧的雲，把步道底包進雲裡（騰雲駕霧）
    const c = night ? "#cdd6e2" : "#fbfdff";
    return `<g opacity=".98"><ellipse cx="80" cy="${PAGE_H - 12}" rx="180" ry="52" fill="${c}"/><ellipse cx="292" cy="${PAGE_H - 4}" rx="176" ry="48" fill="${c}"/><ellipse cx="186" cy="${PAGE_H + 8}" rx="230" ry="48" fill="${c}"/></g>`;
  }
  if (p === 3) {   // 攻頂：前景雪堆
    const c = night ? "#c2ccd8" : "#f3f6ef";
    return `<path d="M-10 ${PAGE_H} L-10 ${y - 14} Q30 ${y - 30} 70 ${y - 10} L78 ${PAGE_H} Z" fill="${c}"/><path d="M372 ${PAGE_H} L372 ${y - 18} Q330 ${y - 34} 292 ${y - 8} L284 ${PAGE_H} Z" fill="${c}"/>`;
  }
  const c = night ? "#26401f" : "#3f7a34";
  let s = "";
  [12, 30, 50, 300, 322, 344].forEach((x, i) => { s += _grass(x, y, 1.5 + (i % 2) * 0.5, night); });
  return `<path d="M-10 ${PAGE_H} L-10 ${y - 10} Q30 ${y - 22} 66 ${y - 8} L70 ${PAGE_H} Z" fill="${c}"/><path d="M372 ${PAGE_H} L372 ${y - 12} Q332 ${y - 24} 296 ${y - 8} L292 ${PAGE_H} Z" fill="${c}"/>${s}`;
}
const _ACH_UP = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>`;
const _ACH_LISTIC = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h12M8 12h12M8 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>`;
const _ACH_CLIMBIC = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20l6-11 4 6 3-4 5 9z"/></svg>`;
// #17/#18 清單檢視：依類別分組/篩選，可快速掃找特定成就
function renderAchList(ov) {
  const box = ov.querySelector("#achList"); if (!box) return;
  const list = petBadges();
  const filter = box.dataset.filter || "all";
  const cats = ["all", "dist", "climb", "trips", "streak", "explore", "challenge", "time"];
  const chips = cats.map(c => `<button class="ach-fchip${c === filter ? " on" : ""}" data-c="${c}">${c === "all" ? ttT("全部") : `${ic(ACH_CAT[c].i)} ${ttT(ACH_CATNAME[c])}`}</button>`).join("");
  const shown = list.map((b, i) => ({ b, i })).filter(o => filter === "all" || o.b.c === filter);
  const rowArr = shown.map(({ b, i }) => {
    const cat = _achCat(b), pct = _achPct(b), date = b.got ? achUnlockDate(b.n) : "", hid = _achHidden(b);
    const right = b.got ? (date || ttT("已達成")) : (hid ? "？" : (b.p ? `${_achFmt(Math.min(b.p[0], b.p[1]), b.p[2])}/${b.p[1]}` : ttT("尚未達成")));
    return `<button class="ach-lrow ${b.got ? "got" : "locked"}" data-i="${i}" style="--c:${cat.col}">
      <span class="ach-lemo ach-mdl">${achMedal(b)}</span>
      <span class="ach-lbody"><span class="ach-lname">${_achName(b)}${b.got ? ` <span class="ach-lchk">${_ACH_CHK}</span>` : ""}</span><span class="ach-ldesc">${_achDesc(b)}</span>${b.p && !hid && !b.got ? `<span class="ach-lbar"><i style="width:${pct}%"></i></span>` : ""}</span>
      <span class="ach-lright">${right}</span></button>`;
  }), rows = rowArr.join("");
  // 「全部」依階層分段：段頭用那一階的獎章金屬色＋紋章＋達成數（跟步道上一頁一階對得起來）
  let body = rows;
  if (filter === "all" && shown.length) {
    const rowOf = {}; shown.forEach(({ b }, k) => { (rowOf[b.t] = rowOf[b.t] || []).push(rowArr[k]); });
    body = Object.keys(rowOf).sort((a, b) => a - b).map(t => { const m = ACH_METAL[t - 1] || ACH_METAL[0], inT = list.filter(b => b.t === +t);
      return `<div class="ach-lsec ach-tierc rank-${t - 1}"><span class="ach-lsec-ic">${ic(ACH_TIER_IC[t - 1])}</span><b>${ttT(ACH_TIERS[t - 1])}</b><i>${inT.filter(b => b.got).length} / ${inT.length}</i></div>${rowOf[t].join("")}`; }).join("");
  }
  box.innerHTML = `<div class="ach-fchips">${chips}</div><div class="ach-lrows">${body || `<div class="ach-lempty">${ttT("這個類別還沒有成就")}</div>`}</div>`;
  // 分類列比螢幕寬：右邊還有沒露出來的就加淡出提示；選中的那顆捲進畫面
  const fc = box.querySelector(".ach-fchips");
  const fade = () => fc.classList.toggle("more", fc.scrollLeft + fc.clientWidth < fc.scrollWidth - 4);
  fc.scrollLeft = +box.dataset.fsl || 0;
  const on = fc.querySelector(".ach-fchip.on");
  if (on && (on.offsetLeft + on.offsetWidth > fc.scrollLeft + fc.clientWidth || on.offsetLeft < fc.scrollLeft)) fc.scrollLeft = on.offsetLeft - 14;
  fc.addEventListener("scroll", () => { box.dataset.fsl = fc.scrollLeft; fade(); }, { passive: true });
  fade();
  box.querySelector(".ach-fchips").addEventListener("click", e => { const c = e.target.closest(".ach-fchip"); if (c) { box.dataset.filter = c.dataset.c; renderAchList(ov); } });
  box.querySelector(".ach-lrows").addEventListener("click", e => { const r = e.target.closest(".ach-lrow"); if (r) { const b = list[+r.dataset.i]; if (b) showAchDetail(b); } });
}
// canvas 文字換行（外文翻譯常比中文長，以前直接超出圖卡被切掉）；中日韓逐字、其他語言按字詞斷
function _wrapText(x, text, cx, y, maxW, lineH, maxLines) {
  const cjk = /[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/.test(text);
  const parts = cjk ? [...text] : text.split(/(\s+)/);
  const lines = []; let cur = "";
  for (const w of parts) { const t = cur + w; if (x.measureText(t).width > maxW && cur.trim()) { lines.push(cur.trim()); cur = w.trimStart(); } else cur = t; }
  if (cur.trim()) lines.push(cur.trim());
  const out = lines.slice(0, maxLines || 3);
  if (lines.length > out.length) out[out.length - 1] = out[out.length - 1].replace(/.{1}$/, "…");
  out.forEach((l, i) => x.fillText(l, cx, y + i * lineH));
  return out.length;
}
// #3 單一成就分享圖卡（canvas，不需外部套件）
async function shareAchievement(b) {
  try {
    const W = 540, H = 680, c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d"), cat = _achCat(b);
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#20402c"); g.addColorStop(1, "#12251a");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = "rgba(224,177,90,.10)"; x.lineWidth = 1.5;
    for (let yy = 90; yy < H; yy += 48) { x.beginPath(); for (let xx = 0; xx <= W; xx += 12) x.lineTo(xx, yy + Math.sin((xx / W) * 6.28) * 10); x.stroke(); }
    x.textAlign = "center";
    const ccx = W / 2, ccy = 208;
    // 徽章本體（SVG）畫成圖：以前畫 emoji，部分裝置是空框
    const md = await new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(achMedal(b, { noLock: true }).replace("<svg ", '<svg width="240" height="240" ')); });
    if (md) x.drawImage(md, ccx - 120, ccy - 120, 240, 240);
    x.fillStyle = "#f3efe4"; x.font = "700 42px 'TaipeiSans', sans-serif"; _wrapText(x, ttT(b.n), W / 2, 358, W - 60, 46, 1);
    x.fillStyle = cat.col; x.font = "700 21px 'TaipeiSans', sans-serif"; x.fillText(ttT(ACH_CATNAME[b.c] || ""), W / 2, 392);
    x.fillStyle = "rgba(243,239,228,.85)"; x.font = "400 19px sans-serif"; _wrapText(x, ttT(b.d), W / 2, 430, W - 70, 24, 2);
    const date = b.got ? achUnlockDate(b.n) : "";
    x.fillStyle = "#e0b15a"; x.font = "600 18px 'TaipeiSans', sans-serif";
    x.fillText(b.got ? (date ? ttT("解鎖於") + " " + date : ttT("已達成")) : (b.p ? `${_achFmt(b.p[0], b.p[2])} / ${b.p[1]} ${ttT(b.p[2])}` : ttT("尚未達成")), W / 2, 484);
    const sc = achScore();
    x.fillStyle = "rgba(255,255,255,.08)"; roundRect(x, W / 2 - 155, 528, 310, 62, 14); x.fill();
    x.fillStyle = "#fff"; x.font = "700 24px 'TaipeiSans', sans-serif"; x.fillText(`${sc.got}/${sc.total} ${ttT("成就")} · ${ttT(sc.rank)}`, W / 2, 567);
    x.fillStyle = "#e0b15a"; x.font = "700 19px 'TaipeiSans', sans-serif"; x.fillText(ttT("循徑拾光 · Gather the Trail"), W / 2, H - 30);
    c.toBlob(async (blob) => {
      if (!blob) { toast(ttT("產生圖片失敗")); return; }
      // 共用存圖：先叫系統分享單（取消就算了，不會再跳下載）；叫不出來時網頁下載、App 裡改成長按存圖的預覽
      if (await saveBlob(blob, "gather-the-trail-achievement.png", ttT("解鎖成就")) === "saved") toast(ttT("已存成圖片"));
    }, "image/png");
  } catch (e) { toast(ttT("產生圖片失敗")); }
}
// 成就詳情彈卡（點節點顯示）
function showAchDetail(b) {
  const ov = document.querySelector('[data-ov="achtree"]'); if (!ov) return;
  const box = ov.querySelector(".ach3d-detail"); if (!box) return;
  const cat = _achCat(b), pct = _achPct(b), hid = _achHidden(b);
  const catName = hid ? "神秘" : (ACH_CATNAME[b.c] || "");
  const date = b.got ? achUnlockDate(b.n) : "";
  box.innerHTML = `<button class="ach3d-dx" aria-label="${ttT("關閉")}">✕</button>
    <div class="ach3d-d-top"><div class="ach3d-d-dot" style="--c:${hid ? "var(--ink-faint)" : cat.col};--pct:${hid ? 0 : pct}"><div class="ach-dot-in ach-mdl">${achMedal(b)}</div></div>
      <div><div class="ach3d-d-name">${_achName(b)}${b.got ? ` <span class="ach3d-d-badge">${_ACH_CHK}</span>` : ""}</div><div class="ach3d-d-cat" style="color:${hid ? "var(--ink-faint)" : cat.col}">${hid ? "" : ic(cat.i) + " "}${ttT(catName)}${date ? ` · ${ttT("解鎖於")} ${date}` : ""}</div></div></div>
    <div class="ach3d-d-chips"><span class="ach3d-d-tier ach-tierc rank-${b.t - 1}">${ic(ACH_TIER_IC[b.t - 1])} ${ttT(ACH_TIERS[b.t - 1])}</span>${ACH_REWARD[b.t] ? `<span class="ach3d-d-rew${b.got ? " got" : ""}">+${ACH_REWARD[b.t]} ${typeof BERRY_SVG !== "undefined" ? BERRY_SVG : ""}</span>` : ""}</div>
    <div class="ach3d-d-desc">${_achDesc(b)}</div>
    ${b.p && !hid && !b.got ? `<div class="ach3d-d-prog"><div class="ach3d-d-bar" style="--c:${cat.col}"><i style="width:${pct}%"></i></div><span>${_achFmt(Math.min(b.p[0], b.p[1]), b.p[2])} / ${b.p[1]} ${ttT(b.p[2])}</span></div>` : `<div class="ach3d-d-prog"><span>${b.got ? ttT("已達成") : ttT("尚未達成")}</span></div>`}
    ${hid ? "" : `<button class="ach3d-d-share" id="achShareBtn">${ic("share")} ${ttT("分享")}</button>`}`;
  box.classList.add("show");
  box.querySelector(".ach3d-dx").addEventListener("click", () => box.classList.remove("show"));
  const sb = box.querySelector("#achShareBtn"); if (sb) sb.addEventListener("click", () => shareAchievement(b));
}
// 全螢幕成就頁：五段攀登（一頁一段海拔，山腳啟程→雲上傳說；日夜天空、點成就看詳情）
function openAchTree() {
  if (document.querySelector('[data-ov="achtree"]')) return;
  const { got, total } = buildAchTree();
  const pct = Math.round(got / total * 100);
  const sc = achScore();
  const ov = document.createElement("div"); ov.className = "ach-modal ach3d-modal ach-climb-modal"; ov.dataset.ov = "achtree";
  ov.innerHTML = `<div class="ach-modal-inner">
      <div class="ach-modal-head"><button class="sheet-close" id="achClose" aria-label="${ttT("關閉")}">✕</button><div class="ach-modal-h">${ic("medal")} ${ttT("成就步道")}</div>
        <button class="ach-viewtog" id="achViewTog" aria-label="${ttT("切換檢視")}">${_ACH_LISTIC}</button>
        <div class="ach-modal-prog"><span class="amp-n">${got}<small> / ${total}</small></span><div class="amp-bar"><i style="width:${pct}%"></i></div></div>
        <div class="ach-rankrow"><span class="ach-rankchip rank-${sc.rankIdx}">${ic(ACH_TIER_IC[sc.rankIdx])} ${ttT(sc.rank)}</span><span class="ach-scorechip">${ttT("成就分數")} <b>${sc.score}</b></span></div></div>
      <div class="ach-modal-body">
        <div class="ach-climb-sky"></div>
        <div class="ach-pager" id="ach3d"></div>
        <div class="ach-pgdots"></div>
        <div class="ach-pgnav"></div>
        <div class="ach-listview" id="achList"></div>
        <div class="ach3d-detail"></div>
      </div>
    </div>`;
  document.body.appendChild(ov);
  let _a11y = null;
  const close = () => { if (_a11y) _a11y(); ov.remove(); };
  if (typeof ttModalA11y === "function") _a11y = ttModalA11y(ov, close, { focus: "#achClose" });
  ov.querySelector("#achClose").addEventListener("click", close);
  // #17/#18 檢視切換：情境爬山 ⟷ 清單（可依類別篩選）
  let listMode = false;
  const tog = ov.querySelector("#achViewTog");
  tog.addEventListener("click", () => {
    listMode = !listMode;
    ov.classList.toggle("list-mode", listMode);
    tog.innerHTML = listMode ? _ACH_CLIMBIC : _ACH_LISTIC;
    const det = ov.querySelector(".ach3d-detail.show"); if (det) det.classList.remove("show");   // 換檢視時收掉詳情卡（以前會留著蓋在清單上）
    if (listMode) renderAchList(ov);
  });
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  _achInitClimb(ov);
}
// 成就攀登控制器：一個階層一頁（頁 0 啟程 → 頁 5 傳說）；上下切換、開場從山腳往上看
// 每個 overlay 只呼叫一次（資料變了由 refreshAchTree 整個重開），所以事件不會重複綁
function _achFillPage(el, p, list, sky, hereNm) {
  el.dataset.built = "1";
  const s = ACH_SCENE[p], alt = ACH_SCENE.indexOf(s) !== p;
  const band = s / 4, topY = _achPgTopY(s);
  const pageBadges = list.filter(b => b.t === p + 1);
  const mainB = pageBadges.filter(b => !b.hidden), hiddenB = pageBadges.filter(b => b.hidden);
  const cnt = Math.max(1, mainB.length);
  const px = x => (x / PAGE_W * 100).toFixed(2) + "%", py = y => (y / PAGE_H * 100).toFixed(2) + "%";
  const mainU = mainB.map((b, j) => 0.06 + (j + 0.5) / cnt * 0.88);
  const mainNodes = mainB.map((b, j) => ({ b, x: _achUX(mainU[j], band), y: _achUY(mainU[j], topY), spur: false }));
  // 隱藏成就：從主幹道另闢支線；用避讓演算法選離所有節點最遠的落點，任何一條都不擋到其他成就
  let spurs = "";
  // 支線配色：預設同山徑的褐色；傳說頁(雲徑)改用雲白／金，讓傳說隱藏成就的岔路和主幹道顏色一致
  const spurCol = (s === 4)
    ? { body: sky.night ? "#aebdd6" : "#fbecc0", dash: sky.night ? "#dfe6f2" : "#fffdf3", dot: sky.night ? "#c7d2e4" : "#f2d98f" }
    : { body: sky.night ? "#54462d" : "#a98a54", dash: sky.night ? "#b7a074" : "#fff3d6", dot: sky.night ? "#7a6748" : "#9a7a44" };
  const occupied = mainNodes.map(n => ({ x: n.x, y: n.y }));
  const hiddenNodes = hiddenB.map((b, hi) => {
    const ua = Math.max(0.2, Math.min(0.8, 0.34 + hi * 0.3));
    const ax = _achUX(ua, band), ay = _achUY(ua, topY);
    let best = null;
    for (const side of [1, -1]) for (const dy of [-38, -56, -18]) {
      const hx = Math.max(40, Math.min(320, ax + side * 84)), hy = ay + dy;
      const md = occupied.reduce((m, o) => Math.min(m, Math.hypot(hx - o.x, hy - o.y)), 1e9);
      if (!best || md > best.md) best = { hx, hy, side, md };
    }
    const { hx, hy, side } = best;
    const mx = (ax + hx) / 2 + side * 4, my = (ay + hy) / 2 - 14;
    const dp = `M ${ax.toFixed(1)} ${ay.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${hx.toFixed(1)} ${hy.toFixed(1)}`;
    spurs += `<path d="${dp}" fill="none" stroke="${spurCol.body}" stroke-width="7" stroke-linecap="round" opacity=".55"/><path d="${dp}" fill="none" stroke="${spurCol.dash}" stroke-width="2.2" stroke-dasharray="1 7" stroke-linecap="round" opacity=".85"/><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="4.5" fill="${spurCol.dot}"/>`;
    occupied.push({ x: hx, y: hy });
    return { b, x: hx, y: hy, spur: true };
  });
  const nodes = mainNodes.concat(hiddenNodes);
  const here = nodes.find(n => n.b.n === hereNm), gotN = pageBadges.filter(b => b.got).length;
  // 起點字放在拱門左邊（正下方會被底部導覽列蓋住）；你在這的標籤靠太近就先收起
  const nearStart = here && p === 0 && Math.abs(here.y - _achUY(0, topY)) < 110 && here.x < 200;
  // 起點寫「登山口」、雲頂只放皇冠：頁名已經在上方標籤，不再重複寫三次
  const headL = p === 0 && !nearStart ? `<div class="ach-head" style="left:${px(_achUX(0, band) - 84)};top:${py(_achUY(0, topY) - 44)}">${ic("footprints")}<b>${ttT("登山口")}</b></div>` : "";
  const peakL = s === 4 ? `<div class="ach-peak" style="left:50%;top:${py(150 - 66)}">${ic("crown")}</div>` : "";
  const hikerL = here ? `<div class="ach-hiker" style="left:${px(here.x)};top:${py(here.y - 40)}"><span class="ach-hiker-b">${ttT("你在這")}</span><span class="ach-hiker-pin">${ic("footprints")}</span></div>` : "";
  el.innerHTML = `${_achPgSVG(s, sky.night, alt, s === 4 ? mainU : null, nodes)}
      <svg class="ach-spurs" viewBox="0 0 ${PAGE_W} ${PAGE_H}" preserveAspectRatio="none" aria-hidden="true">${spurs}</svg>
      ${_achFauna(s)}
      <div class="ach-pgtag">${ic(ACH_TIER_IC[p])} ${ttT(ACH_TIERS[p])}<i>${gotN}/${pageBadges.length}</i></div>
      ${peakL}${headL}${hikerL}
      <div class="ach-climb-marks"></div>`;
  const mc = el.querySelector(".ach-climb-marks");
  nodes.forEach((n, i) => {
    const cat = _achCat(n.b), b = document.createElement("button");
    b.className = `ach3d-mk ${n.b.got ? "got" : "locked"}${n.b.n === hereNm ? " here" : ""}${n.spur ? " spur" : ""}`;
    b.style.left = px(n.x); b.style.top = py(n.y);
    b.style.setProperty("--i", i);   // 由下(0)往上依序浮現
    b.style.setProperty("--c", cat.col); b.style.setProperty("--pct", _achPct(n.b));
    b.setAttribute("aria-label", `${_achName(n.b)} · ${n.b.got ? ttT("已達成") : ttT("尚未達成")}`);   // 無障礙
    b.innerHTML = `<span class="ach-dot ach-mdl">${achMedal(n.b)}</span>`;   // 徽章本體自帶緞帶（達成）／鎖＋進度圈（未達成）ji＋鎖頭暗示
    b.addEventListener("click", e => { e.stopPropagation(); showAchDetail(n.b); });
    mc.appendChild(b);
  });
}
function _achInitClimb(ov) {
  if (!ov) return;
  const root = ov.querySelector("#ach3d"), skyEl = ov.querySelector(".ach-climb-sky");
  if (!root) return;
  const list = petBadges(), sky = _achSky();
  const nextUp = achNextUp(list);
  const allGot = list.every(b => b.got);
  const hereNm = nextUp[0] ? nextUp[0].b.n : (allGot ? list[list.length - 1].n : (list.find(b => !b.got) || {}).n);
  // 天空背景（日夜）
  if (skyEl) {
    const stars = sky.night ? Array.from({ length: 26 }, (_, i) => `<span class="ach3d-star" style="left:${(i * 37 % 96) + 2}%;top:${(i * 19 % 62)}%;--dl:${(i % 5) * 0.4}s"></span>`).join("") : "";
    skyEl.className = "ach-climb-sky" + (sky.night ? " night" : "");
    skyEl.style.background = sky.sky;
    skyEl.innerHTML = `<div class="ach-climb-orb ${sky.orb}" style="left:${sky.ox}%;top:${sky.oy + 8}px;background:${sky.oc}"></div>
      <div class="ach3d-stars">${stars}</div>
      <div class="ach3d-cloud" style="top:14%;--d:46s;--s:.9"></div>
      <div class="ach3d-cloud" style="top:28%;--d:62s;--s:.66;animation-delay:-22s"></div>`;
  }
  const hereB = list.find(b => b.n === hereNm);
  const herePage = hereB ? Math.max(0, Math.min(ACH_NPG - 1, hereB.t - 1)) : 0;
  const dotsEl = ov.querySelector(".ach-pgdots"), navEl = ov.querySelector(".ach-pgnav");
  // 右側海拔圓點（下＝啟程、上＝傳說；標出你目前進度那頁）
  dotsEl.innerHTML = Array.from({ length: ACH_NPG }, (_, i) => `<button class="ach-pgdot${i === herePage ? " ishere" : ""}" data-pg="${i}" aria-label="${ttT(ACH_TIERS[i])}"></button>`).reverse().join("");
  // 填一頁的內容（山景＋節點）：只在快要看到時才畫（一頁約 50 個植物岩石 SVG，一次畫六頁低階手機會卡）
  function fillPage(el, p) { return _achFillPage(el, p, list, sky, hereNm); }   // 畫一頁（優化輪 4 A2：搬到外面）
  // 膠捲軌道：六頁的外框先排好（上＝傳說、下＝啟程），內容只畫目前這頁和上下各一頁；拖動只做 transform → 60fps
  root.innerHTML = `<div class="ach-track" id="achTrack"></div><button class="ach-jump" id="achJump" hidden>${ic("footprints")} ${ttT("你在這")}</button>`;
  const track = root.querySelector("#achTrack"), jump = root.querySelector("#achJump"), pages = [];
  track.style.setProperty("--n", ACH_NPG);
  for (let p = ACH_NPG - 1; p >= 0; p--) { const el = document.createElement("div"); el.className = "ach-page"; el.dataset.p = p; track.appendChild(el); pages[p] = el; }
  const ensure = c => { for (const p of [c - 1, c, c + 1]) if (pages[p] && !pages[p].dataset.built) fillPage(pages[p], p); };
  let cur = 0, dragging = false, startY = 0, drag = 0, moved = 0, cheered = false;
  function place(anim) { track.classList.toggle("anim", !!anim); track.style.setProperty("--d", ACH_NPG - 1 - cur); track.style.setProperty("--drag", drag + "px"); }
  function hideDetail() { const d = ov.querySelector(".ach3d-detail.show"); if (d) d.classList.remove("show"); }
  function chrome() {
    dotsEl.querySelectorAll(".ach-pgdot").forEach(d => d.classList.toggle("on", +d.dataset.pg === cur));
    navEl.innerHTML = `<button class="ach-pgbtn" data-go="down" ${cur === 0 ? "disabled" : ""} aria-label="${ttT("回下方")}"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
      <span class="ach-pgnav-t">${cur + 1} / ${ACH_NPG}</span>
      <button class="ach-pgbtn up" data-go="up" ${cur === ACH_NPG - 1 ? "disabled" : ""} aria-label="${ttT("繼續往上")}">${ttT("繼續往上")} ${_ACH_UP}</button>`;
    jump.hidden = (cur === herePage);
    ov.dataset.pg = String(cur);
    if (cur === ACH_NPG - 1 && allGot && !cheered) { cheered = true; _achCelebrate(root, sky.night); }
  }
  function go(t) { t = Math.max(0, Math.min(ACH_NPG - 1, t)); drag = 0; if (t === cur) { place(true); return; } cur = t; ensure(cur); hideDetail(); place(true); chrome(); }
  // 拖動跟手（下拉＝往上爬，露出上方更高的一段；上滑＝下山）
  root.addEventListener("pointerdown", e => { if (e.target.closest(".ach-jump")) return; dragging = true; startY = e.clientY; drag = 0; moved = 0; track.classList.remove("anim"); });
  root.addEventListener("pointermove", e => {
    if (!dragging) return; drag = e.clientY - startY; moved = Math.max(moved, Math.abs(drag));
    if ((cur === ACH_NPG - 1 && drag > 0) || (cur === 0 && drag < 0)) drag *= 0.3;   // 兩端橡皮筋阻尼
    if (moved > 6) hideDetail();
    track.style.setProperty("--drag", drag + "px");
  });
  function endDrag() {
    if (!dragging) return; dragging = false;
    const th = Math.min(96, (root.clientHeight || 600) * 0.2);
    go(drag > th ? cur + 1 : drag < -th ? cur - 1 : cur);
  }
  root.addEventListener("pointerup", endDrag);
  root.addEventListener("pointercancel", endDrag);
  // 滾輪／鍵盤（往上＝爬升）
  let wheelAt = 0;
  root.addEventListener("wheel", e => { if (e.timeStamp - wheelAt < 480 || Math.abs(e.deltaY) < 12) return; wheelAt = e.timeStamp; go(e.deltaY < 0 ? cur + 1 : cur - 1); }, { passive: true });
  ov.addEventListener("keydown", e => { if (ov.classList.contains("list-mode")) return; if (e.key === "ArrowUp") { e.preventDefault(); go(cur + 1); } else if (e.key === "ArrowDown") { e.preventDefault(); go(cur - 1); } });
  dotsEl.addEventListener("click", e => { const d = e.target.closest(".ach-pgdot"); if (d) go(+d.dataset.pg); });
  navEl.addEventListener("click", e => { const b = e.target.closest(".ach-pgbtn"); if (b) go(b.dataset.go === "up" ? cur + 1 : cur - 1); });
  jump.addEventListener("click", () => go(herePage));
  // 定位山腳＋播開場動畫（從山腳往上看）
  ensure(0); place(false); chrome();
  const page0El = pages[0];
  if (page0El) { page0El.classList.add("intro"); setTimeout(() => page0El.classList.remove("intro"), 1100); }
}
// 全數達成登頂：撒彩帶慶祝
function _achCelebrate(root, night) {
  if (!root || root.querySelector(".ach-cheer")) return;
  const cols = ["#e8607a", "#f2c14e", "#4a7ec8", "#3f9d5c", "#8a5cc0", "#ffffff"];
  const wrap = document.createElement("div"); wrap.className = "ach-cheer";
  let s = "";
  for (let i = 0; i < 28; i++) s += `<span style="left:${(i * 53 % 100)}%;background:${cols[i % cols.length]};animation-delay:${(i % 7) * 0.09}s;transform:rotate(${i * 40}deg)"></span>`;
  wrap.innerHTML = s;
  root.appendChild(wrap);
  setTimeout(() => wrap.remove(), 2200);
}
// DEBUG 解鎖/重置成就後，若成就頁開著也一起重建
// 整個重開（以前在原 overlay 上再跑一次初始化，拖動/滾輪/按鈕會重複綁 → 按一次跳兩頁）
function refreshAchTree() {
  const ov = document.querySelector('[data-ov="achtree"]'); if (!ov) return;
  const listMode = ov.classList.contains("list-mode");
  const c = ov.querySelector("#achClose"); if (c) c.click(); else ov.remove();
  openAchTree();
  if (listMode) { const t = document.querySelector('[data-ov="achtree"] #achViewTog'); if (t) t.click(); }
}
