// 山林夥伴（寵物）＋每日任務＋成就＋足跡熱力圖。
// 由 app.js 拆出；在 app.js 之前載入，函式皆於分頁切換/事件時才執行。
// 山林夥伴：靠累積里程進化的虛擬寵物
const PET_STAGES = [
  { km: 0, e: "🥚", n: "神秘之卵", d: "靜靜等待破殼的那一刻……多走幾步喚醒牠。" },
  { km: 3, e: "🐛", n: "草叢幼蟲", d: "剛孵化的小生命，在步道邊探出了頭。" },
  { km: 12, e: "🦋", n: "翩翩彩蝶", d: "蛻變成蝶，隨你翻山越嶺。" },
  { km: 30, e: "🦊", n: "靈巧山狐", d: "穿梭林間的夥伴，腳程越來越好。" },
  { km: 70, e: "🐅", n: "山林猛虎", d: "氣勢威猛，群山都是牠的領地。" },
  { km: 130, e: "🐲", n: "初醒幼龍", d: "傳說的力量正在覺醒……" },
  { km: 220, e: "🐉", n: "騰雲神龍", d: "已達最終型態！與你一同騰雲駕霧。" },
];
// 果實：遊戲裡的貨幣，專屬 SVG（emoji 在不同手機長得不一樣，也常變成空框）
const BERRY_SVG_BASE = `<svg class="berry" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5c3.6 0 6 2.2 6 5.6 0 3.8-3 6.9-6 6.9s-6-3.1-6-6.9c0-3.4 2.4-5.6 6-5.6Z" fill="#e0445c"/><path d="M9 12.5h.01M12 11.5h.01M15 12.5h.01M10.5 15.5h.01M13.5 15.5h.01M12 18h.01" stroke="#ffd9a0" stroke-width="1.6" stroke-linecap="round"/><path d="M12 8.5c-.6-2-2.2-3.2-4.2-3.3 1 1.5 2.4 2.7 4.2 3.3Zm0 0c.6-2 2.2-3.2 4.2-3.3-1 1.5-2.4 2.7-4.2 3.3Zm0 0V4.5" fill="#4f9a55" stroke="#4f9a55" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
// 果實圖示跟著季節換（2026-10-09 使用者：「果實改樣子，全部圖示都要改」）：餵食鈕、果實數、價格、任務獎勵、送果實、掉下來的果實都讀 BERRY_SVG，
// 所以把它變成「每次讀都回傳當季那顆」（春櫻桃、夏芒果、秋柿子、冬橘子；季節不明時用原本的莓果）
Object.defineProperty(window, "BERRY_SVG", { get: () => petFruitSvg(), configurable: true });
// 戳夥伴的台詞：依心情＋時段挑，不要老是那六句輪著講
const PET_TAPS = {
  happy: ["剛剛那趟好過癮！", "腳還熱熱的，再走一段？", "今天的風景我都記住了", "你走路的樣子好帥", "我又長大一點點了"],
  content: ["要再去走走嗎？", "下一座山在等我們～", "我準備好出發了！", "今天也一起爬山吧！", "背包我幫你看著"],
  longing: ["有點想念樹林的味道…", "好久沒聽到溪水聲了", "我們上次去的地方還好嗎？", "偷偷在看步道清單喔"],
  sleepy: ["呼…（翻身）", "再五分鐘…", "夢到在山頂看日出", "等你帶我出門，我就醒了"],
};
const PET_TAPS_TIME = [[5, 9, "早安！清晨的山最安靜"], [11, 13, "午餐吃飽了嗎？"], [17, 19, "黃昏的光好好看"], [21, 24, "這麼晚了，早點休息喔"], [0, 5, "都半夜了還不睡？"]];
// 每隻自己的個性台詞（2026-10-07 寵物新一輪 #21）：混進心情那一組一起抽
const PET_TAPS_SP = [
  ["（咚咚）裡面好像在回應你", "暖暖的，再抱一下", "快了，就快出來了", "（殼上的花紋亮了一下）"],
  ["我一步可以量 3 公分喔", "葉子是世界上最好吃的東西", "等我長大要變成什麼呢？", "慢慢走也會到的"],
  ["風一吹我就想飛", "花蜜今天特別甜", "翅膀上的花紋是我的名片", "你看，我飛得很穩吧"],
  ["我聞到前面有松鼠", "尾巴蓬蓬的，要摸嗎？", "我的耳朵什麼都聽得到", "跟著我，我知道捷徑"],
  ["我會保護你的", "肚子餓的時候吼一聲最有用", "爬坡交給我", "條紋每天都要整理"],
  ["我噴出火了嗎？沒有？", "等我翅膀長大就載你飛", "鱗片又硬一點了", "我是很勇敢的小龍"],
  ["雲是我的家，山是我的院子", "龍珠今天很亮", "要不要我幫你把雲吹開？", "千山萬水，有你同行"],
];
function petTapLine(k) {
  const h = ttClock.date().getHours(), tm = PET_TAPS_TIME.find(([a, b]) => h >= a && h < b);
  const pool = (PET_TAPS[k] || PET_TAPS.content).concat(tm ? [tm[2]] : [], PET_TAPS_SP[petStageIndex(totalKm())] || []);
  return ttT(pool[Math.floor(Math.random() * pool.length)]);
}
// 棲息地背景（隨進化升級）
const PET_BG = [
  "linear-gradient(140deg,#403626,#2a2418)", "linear-gradient(140deg,#33502d,#1d3019)",
  "linear-gradient(140deg,#356b4a,#1f4730)", "linear-gradient(140deg,#2a5a3a,#16301f)",
  "linear-gradient(140deg,#5a4a2a,#2c2a1a)", "linear-gradient(140deg,#3a3a6b,#1f2547)",
  "linear-gradient(140deg,#2b5a3a,#234a6b 55%,#16301f)",
];
// 排除模擬；過快(交通工具)的移動段在記錄端就已不計入里程
const isFootRec = r => !r.sim && !r.vehicle;   // 模擬、車速自動斷掉的整趟都不計里程
function realRecords() { return Store.getRecords().filter(isFootRec); }
// 總數（我的、進階分析共用同一套）：逐欄取「終身統計」與「現存紀錄合計」較大者——舊紀錄被容量保護砍掉也不縮水，兩頁數字也一致
function ttTotals() {
  const recs = realRecords(), lf = (Store.life && Store.life()) || {}, sum = f => recs.reduce((s, r) => s + (f(r) || 0), 0);
  return { trips: Math.max(recs.length, lf.trips || 0), km: Math.max(sum(r => r.distanceKm), lf.km || 0), asc: Math.max(sum(r => r.ascent), lf.asc || 0),
    kcal: Math.max(sum(r => r.kcal), lf.kcal || 0), steps: Math.max(sum(r => r.steps), lf.steps || 0), ms: Math.max(sum(r => r.elapsedMs), lf.ms || 0) };
}
function debugKm() { return +(localStorage.getItem("tt_debug_km") || 0); }   // 測試用里程偏移
// 總里程取「終身統計」與「現存紀錄合計」較大者：舊紀錄被容量保護砍掉，寵物/果實也不倒退
function realTotalKm() { return Math.max(realRecords().reduce((s, r) => s + (r.distanceKm || 0), 0), (Store.life && Store.life().km) || 0) + debugKm(); }
function petBase() { return +(localStorage.getItem("tt_pet_base") || 0); }
function feedBonusKm() { return +(localStorage.getItem("tt_pet_feedkm") || 0); }
function totalKm() { return Math.max(0, realTotalKm() - petBase()) + feedBonusKm(); }   // 成長里程＝走路 + 照顧獎勵
// 🍓 果實：走路時「隨機撿拾」（每 10m 有 5% 機率撿到一顆），餵食消耗
// 舊版是每 km 固定 1 顆；改成撿拾累計。首次遷移：把既有里程換算的果實搬進來，使用者不會損失。
function berriesEarned() {
  let p = localStorage.getItem("tt_pet_berry_picked");
  if (p == null) { p = String(Math.floor(realTotalKm())); localStorage.setItem("tt_pet_berry_picked", p); }
  return +p || 0;
}
function addBerryPicked(n) { localStorage.setItem("tt_pet_berry_picked", String(berriesEarned() + n)); }
function berryBonus() { return +(localStorage.getItem("tt_pet_berry_bonus") || 0); }   // 每日任務、好友致贈等額外果實
function addBerryBonus(n) { localStorage.setItem("tt_pet_berry_bonus", String(berryBonus() + n)); }
function berriesBalance() { return Math.max(0, berriesEarned() + berryBonus() - (+(localStorage.getItem("tt_pet_berry_spent") || 0))); }
// ❤️ 親密度 0–100（久未互動緩降，永不影響等級）
// 親密（2026-10-09 修正案 R7-2，使用者同意的節奏）：心的門檻 10／30／50／70／90 點（第一顆心只要 10 點，新手第一天摸頭＋抱抱＋餵一次就看得到）；
// 兩天沒互動才開始掉、每天 −1，而且不會掉到這一顆心以下（不懲罰：只是不再往上）。以前是「點數 ÷ 20」才算一顆心、隔天就每天 −2——
// 摸頭 +1、抱抱 +2 的時候數字和進度條都不動，看起來一直是 0/5
const AFF_T = [10, 30, 50, 70, 90];
const affFloor = a => AFF_T.filter(t => a >= t).pop() || 0;
function affinity() {
  const raw = Math.max(0, Math.min(100, +(localStorage.getItem("tt_pet_aff") || 0)));
  const t = localStorage.getItem("tt_pet_aff_t");
  const idle = t ? Math.max(0, daysSince(t) - 2) : 0;
  return Math.round(Math.max(affFloor(raw), raw - idle));
}
// 五顆心，每顆填多少（0～1）：第 k 顆心從上一個門檻填到這一個門檻
function affFills(a) { return AFF_T.map((t, k) => { const lo = k ? AFF_T[k - 1] : 0; return Math.max(0, Math.min(1, (a - lo) / (t - lo))); }); }
function affHeartsHtml(a) { return `<span class="aff-hearts" aria-hidden="true">${affFills(a).map(f => `<i style="--f:${f.toFixed(2)}"></i>`).join("")}</span>`; }
function affNextLine(a) { const nx = AFF_T.find(t => a < t); return nx ? ttT("現在 {a} 點，再 {b} 點就有第 {c} 顆心").replace("{a}", a).replace("{b}", nx - a).replace("{c}", AFF_T.indexOf(nx) + 1) : ttT("親密滿了，牠最喜歡你"); }
function petHearts(a) { a = a == null ? affinity() : a; return AFF_T.filter(t => a >= t).length; }
function bumpAffinity(amt) {
  const cur = affinity();
  localStorage.setItem("tt_pet_aff", String(Math.max(0, Math.min(100, cur + amt))));
  localStorage.setItem("tt_pet_aff_t", ttClock.date().toISOString());
}
// ── 陪伴（2026-10-07 寵物新一輪 #5 #8 #9 #10，參考 Finch／寶可夢 GO 夥伴／Pikmin Bloom）──
// 親密的來源一條一條寫清楚（每種各有上限，不懲罰）；摸頭也算一點點（每天最多 3 次）
// 小把戲（2026-10-09 第三版 R13，原14 縮小版）：每一階一個，連續 3 天摸頭就學會（寫日記），之後點兩下牠會表演；不加新數值
const PET_TRICKS = ["滾一圈", "抬頭打招呼", "繞一圈飛", "轉圈圈", "踏踏腳", "噴小雲", "噴小雲"];
function petTricks() { try { const o = JSON.parse(localStorage.getItem("tt_pet_tricks") || "{}"); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; } }
function petTrickKnown(i) { return !!petTricks()[i == null ? petStageIndex(totalKm()) : i]; }
function petTrickPat() {   // 每次摸頭（不管今天摸了幾次）：記「連續幾天有摸」，滿 3 天學會這一階的把戲、重新數
  const k = todayStr(), i = petStageIndex(totalKm()); if (petTrickKnown(i)) return false;
  let st = {}; try { st = JSON.parse(localStorage.getItem("tt_pet_trick_pat") || "{}") || {}; } catch (e) { /* */ }
  if (st.d === k) return false;
  const y = new Date(ttClock.now() - 864e5), yk = localDay(y.toISOString());
  st = { d: k, n: st.d === yk ? (+st.n || 0) + 1 : 1 };
  if (st.n >= 3) {
    const o = petTricks(); o[i] = ttClock.date().toISOString(); localStorage.setItem("tt_pet_tricks", JSON.stringify(o)); st = { d: k, n: 0 };
    localStorage.setItem("tt_pet_trick_pat", JSON.stringify(st)); petDiaryAdd("trick:" + i, i);
    setTimeout(() => { petSay(ttT("學會新把戲了：{t}！點兩下牠看看").replace("{t}", ttT(PET_TRICKS[i])), 3600); petBurst("✨", 3); }, 900);
    return true;
  }
  localStorage.setItem("tt_pet_trick_pat", JSON.stringify(st)); return false;
}
function petPatAff() {
  petTrickPat();
  const k = todayStr(), cur = (localStorage.getItem("tt_pet_pat_day") || "").split(":"), n = cur[0] === k ? +cur[1] || 0 : 0;
  if (n >= 3) return false; localStorage.setItem("tt_pet_pat_day", `${k}:${n + 1}`); bumpAffinity(1); return true;
}
function petAffRows() {
  const k = todayStr(), hikes = realRecords().filter(r => localDay(r.date) === k).length, pat = (localStorage.getItem("tt_pet_pat_day") || "").split(":"), pats = pat[0] === k ? +pat[1] || 0 : 0;
  const cd = feedCooldownMs(), hug = localStorage.getItem("tt_pet_hug_day") === k, quest = localStorage.getItem("tt_quest_claim") === k;
  return [
    ["走一趟", "+8", hikes ? `${ttT("今天")} ${hikes} ${ttT("趟")}` : ttT("今天還沒走")],
    ["餵食（8 小時一次）", "+15", cd > 0 ? `${ttT("約")} ${Math.ceil(cd / 3600e3)} ${ttT("小時後可以再餵")}` : ttT("現在可以餵")],
    ["每日任務全部完成", "+5", quest ? ttT("今天領過了") : ttT("今天還沒領")],
    ["每天第一次抱抱", "+2", hug ? ttT("今天抱過了") : ttT("今天還沒抱")],
    ["摸摸頭（每天 3 次）", "+1", `${ttT("今天")} ${pats}/3`],
  ];
}
// 你不在的時候牠做了什麼：隔 3 小時以上再打開，泡泡說一句（每隻自己的一組）
const PET_AWAY = [
  ["剛剛好像在裡面翻了個身", "蛋殼暖暖的，晒了一下午太陽", "聽到外面有鳥叫，動了一下"],
  ["剛剛爬到葉子背面躲太陽", "啃了半片葉子，好飽", "量了一下樹枝，有 37 步那麼長"],
  ["去花叢那邊晃了一圈", "停在石頭上晒翅膀", "跟另一隻蝴蝶追了一下"],
  ["在草叢裡挖到一顆松果", "追了一下自己的尾巴", "在樹下睡了個午覺"],
  ["在溪邊喝了好多水", "爬上大石頭看了很久的風景", "把爪子磨得亮亮的"],
  ["練習噴火，只噴出一團煙", "在泥巴裡打滾了一下", "試著飛，跳了三下"],
  ["去雲裡繞了一圈", "幫山腳下的田下了點雨", "數了一下龍珠上的光點"],
];
function petAwayLine(i) {
  const now = ttClock.now(); let t = 0; try { t = +localStorage.getItem("tt_pet_seen") || 0; localStorage.setItem("tt_pet_seen", String(now)); } catch (e) { /* 私密瀏覽 */ }
  if (!t || now - t < 3 * 3600e3) return null; const L = PET_AWAY[i] || PET_AWAY[3]; return L[Math.floor(Math.random() * L.length)];
}
// 健行完的感想：最新一趟還沒「聊過」就說一句，用真實資料（爬升、距離、第一次去的縣市）
function petRecapLine() {
  const R = realRecords().filter(r => !r.vehicle && (r.distanceKm || 0) >= .3); if (!R.length) return null;
  const r = R[0]; if (localStorage.getItem("tt_pet_recap") === r.id) return null; localStorage.setItem("tt_pet_recap", r.id);
  if (ttClock.now() - new Date(r.date).getTime() > 3 * 864e5) return null;   // 太久以前的就不提了
  const T = typeof TRAILS !== "undefined" && r.trailId ? TRAILS.find(t => t.id === r.trailId) : null, cty = T && T.region;
  const cj = typeof ttCJK === "function" ? ttCJK() : true, sp = cj ? "" : " ", cm = cj ? "，" : ", ", ex = cj ? "！" : "! ";
  if (cty && !R.slice(1).some(x => { const u = x.trailId && TRAILS.find(t => t.id === x.trailId); return u && u.region === cty; })) return `${ttT("第一次去")}${sp}${ttT(cty)}${ex}${ttT("好多沒看過的東西")}`;
  if ((r.ascent || 0) >= 600) return `${ttT("上一趟爬了")} ${Math.round(r.ascent)} m${cm}${ttT("腳有點痠，但好開心")}`;
  if ((r.distanceKm || 0) >= 10) return `${ttT("上一趟走了")} ${r.distanceKm.toFixed(1)} km${cm}${ttT("我們好厲害")}`;
  const h = new Date(r.date).getHours();
  return h < 8 ? ttT("上一趟出門好早，空氣好好聞") : h >= 16 ? ttT("上一趟回來天都快黑了，有你在就不怕") : ttT("上一趟走得好舒服，下次再一起去");
}
// 親密滿（5 顆心）：每隔兩天，牠會自己出門晃一圈、帶一個小東西回來（收在手冊；全部收齊之後改帶果實）
const PET_GIFTS = {
  pine: ["松果", '<ellipse cx="12" cy="13" rx="6" ry="8" fill="#9a6a3a"/><path d="M7 10h10M6.5 13.5h11M7.5 17h9M12 5v16" stroke="#6b4422" stroke-width="1.4"/><path d="M12 5V2" stroke="#4f7a3a" stroke-width="2" stroke-linecap="round"/>'],
  feather: ["羽毛", '<path d="M18 3C9 5 6 12 6 19l2-1c1-6 4-10 10-15Z" fill="#d9e4f2" stroke="#7d93ad" stroke-width="1.3"/><path d="M6 19 4 22" stroke="#7d93ad" stroke-width="1.6" stroke-linecap="round"/>'],
  maple: ["楓葉", '<path d="M12 2l2 4 4-1-1 4 4 2-4 2 1 3-4-1-1 5h-2l-1-5-4 1 1-3-4-2 4-2-1-4 4 1Z" fill="#e0603a" stroke="#a83a1f" stroke-width="1.1" stroke-linejoin="round"/>'],
  stone: ["溪邊的小石頭", '<ellipse cx="12" cy="14" rx="8" ry="6" fill="#8fa3b0" stroke="#5d7180" stroke-width="1.3"/><path d="M6 13c3 2 9 2 12 0" stroke="#e8eef2" stroke-width="1.6" fill="none" stroke-linecap="round"/>'],
  acorn: ["橡實", '<path d="M6 10c0-3 3-5 6-5s6 2 6 5Z" fill="#7a5230"/><path d="M7 10c0 6 2 10 5 10s5-4 5-10Z" fill="#c98a4a" stroke="#8a5a2a" stroke-width="1.2"/><path d="M12 5V3" stroke="#5a3a1a" stroke-width="1.8" stroke-linecap="round"/>'],
  flower: ["一朵野花", '<g fill="#f2a6c2" stroke="#c96a8e" stroke-width="1">' + [0, 72, 144, 216, 288].map(a => `<ellipse cx="12" cy="7" rx="3" ry="4.4" transform="rotate(${a} 12 11)"/>`).join("") + '</g><circle cx="12" cy="11" r="2.6" fill="#ffd36a"/><path d="M12 15v7" stroke="#4f8a4a" stroke-width="1.6"/>'],
  crystal: ["小水晶", '<path d="M12 2l5 6-2 13H9L7 8Z" fill="#bfe6f0" stroke="#5aa3b8" stroke-width="1.3" stroke-linejoin="round"/><path d="M12 2v19M7 8h10" stroke="#5aa3b8" stroke-width="1"/>'],
  shell: ["蝸牛殼", '<circle cx="12" cy="13" r="7" fill="#e8c58a" stroke="#a37a3a" stroke-width="1.3"/><path d="M12 13a2.5 2.5 0 1 1 2.5 2.5A5 5 0 1 1 9 8" fill="none" stroke="#a37a3a" stroke-width="1.3"/>'],
  // 2026-10-09 R5 原18（先擴到 14 種，驗證取得、重複、圖鑑、備份後再加）：台灣山上常見的小東西
  fern: ["蕨葉", '<path d="M12 22C12 14 11 8 8 2" stroke="#4f7a3a" stroke-width="1.4" fill="none"/>' + [4, 7, 10, 13, 16].map((y, k) => `<path d="M${11 - k * .3} ${y + 2}c-3-1-5 0-6 2M${11.6 - k * .3} ${y + 2}c3-2 5-1 6 1" stroke="#6aa646" stroke-width="1.6" fill="none" stroke-linecap="round"/>`).join("")],
  bean: ["相思豆", '<ellipse cx="9" cy="13" rx="4" ry="5" fill="#d8322a" stroke="#8f1d18" stroke-width="1.2"/><path d="M6 10a2 2 0 0 1 2-2" stroke="#1e1a1a" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="16" cy="12" rx="3.4" ry="4.4" fill="#d8322a" stroke="#8f1d18" stroke-width="1.2"/>'],
  moss: ["苔蘚球", '<circle cx="12" cy="13" r="8" fill="#6f9a3e" stroke="#46692a" stroke-width="1.3"/><path d="M7 11l1 2M10 8l1 2M14 9l-1 2M16 13l-1 1M9 16l1-1M13 16l1 1" stroke="#a8cf6a" stroke-width="1.4" stroke-linecap="round"/>'],
  gumball: ["楓香果", '<circle cx="12" cy="13" r="6.5" fill="#8a5a2c" stroke="#5a3a1a" stroke-width="1.2"/>' + [0, 45, 90, 135, 180, 225, 270, 315].map(a => `<path d="M12 6.5v-2.6" stroke="#5a3a1a" stroke-width="1.6" stroke-linecap="round" transform="rotate(${a} 12 13)"/>`).join("") + '<path d="M12 6V2" stroke="#5a3a1a" stroke-width="1.2"/>'],
  cicada: ["蟬蛻", '<path d="M12 4c3 0 4 3 4 6l2 6-3 1-1 3h-4l-1-3-3-1 2-6c0-3 1-6 4-6Z" fill="#d6a25a" fill-opacity=".75" stroke="#9a6a2a" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 7v11M9 12h6" stroke="#9a6a2a" stroke-width="1"/>'],
  petal: ["山櫻花瓣", '<path d="M12 21c-5-3-7-8-5-13 2 1 3 3 5 3s3-2 5-3c2 5 0 10-5 13Z" fill="#f4a3bd" stroke="#c4607f" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 11v8" stroke="#c4607f" stroke-width=".9"/>'],
};
function petGiftsOwned() { try { return JSON.parse(localStorage.getItem("tt_pet_gifts") || "[]"); } catch (e) { return []; } }
// 好友之間送小東西（R12，js/social/petsocial.js）：送出成功才拿掉一件；收到的記下是誰送的
function petGiftRemove(id) {
  const own = petGiftsOwned(), k = own.findIndex(o => o.id === id); if (k < 0) return;
  own.splice(k, 1); localStorage.setItem("tt_pet_gifts", JSON.stringify(own));
  let gone = []; try { gone = JSON.parse(localStorage.getItem("tt_pet_gifts_gone") || "[]"); } catch (e) { /* */ }
  gone.push({ id, k: Date.now().toString(36), t: ttClock.date().toISOString() }); localStorage.setItem("tt_pet_gifts_gone", JSON.stringify(gone.slice(-100)));   /* 備份合併時用（storage.js importPet） */
}
function petGiftAdd(id, from) { const own = petGiftsOwned(); if (!PET_GIFTS[id] || own.some(o => o.id === id)) return false; own.push({ id, t: ttClock.date().toISOString(), from: String(from || "").slice(0, 40) }); localStorage.setItem("tt_pet_gifts", JSON.stringify(own)); return true; }
// 社群日記：give 送出／got 收到／visit 去對方家玩／visited 對方回訪；key 帶時間（同一天可以有好幾筆），名字放最後（名字裡可能有冒號）
function petDiarySocial(kind, item, who) { petDiaryAdd(`${kind}:${item || ""}:${Date.now().toString(36)}:${String(who || "").slice(0, 40)}`); }
function petDiarySocialText(k) {
  const m = /^(give|got|visit|visited):([a-z]*):[0-9a-z]+:(.*)$/.exec(k); if (!m) return "";
  const item = m[2] && PET_GIFTS[m[2]] ? ttT(PET_GIFTS[m[2]][0]) : "", who = m[3];
  if (m[1] === "give") return item ? ttT("送給 {who} 一個{item}").replace("{who}", who).replace("{item}", item) : "";
  if (m[1] === "got") return item ? ttT("收到 {who} 送的{item}").replace("{who}", who).replace("{item}", item) : "";
  if (m[1] === "visit") return ttT("去 {who} 家玩").replace("{who}", who);
  return ttT("{who} 回訪了我們家").replace("{who}", who);
}
function petGiftIcon(id, cls) { const g = PET_GIFTS[id]; return g ? `<svg class="${cls || "pg-ic"}" viewBox="0 0 24 24" aria-hidden="true">${giftSvg(g[1])}</svg>` : ""; }
function petGiftDue() { return petHearts() >= 5 && ttClock.now() - (+(localStorage.getItem("tt_pet_gift_t") || 0)) >= 2 * 864e5; }
function petGiftGive() {
  const own = petGiftsOwned(), left = Object.keys(PET_GIFTS).filter(k => !own.some(o => o.id === k));
  // 當季的比較容易撿到（2026-10-09 R5 原18）：春天花瓣野花、夏天蟬蛻、秋天楓葉楓香果橡實、冬天松果苔蘚——還沒撿到的才會出現（不會重複）
  const SEA = { spring: ["petal", "flower", "fern"], summer: ["cicada", "shell", "stone"], autumn: ["maple", "gumball", "acorn"], winter: ["pine", "moss", "bean"] }, pref = left.filter(k => (SEA[typeof PetStage !== "undefined" ? PetStage.season() : ""] || []).includes(k));
  const pool = pref.length && Math.random() < .6 ? pref : left, id = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  localStorage.setItem("tt_pet_gift_t", String(ttClock.now()));
  if (id) { own.push(Object.assign({ id, t: ttClock.date().toISOString() }, petDebugOn() ? { dbg: 1 } : {})); localStorage.setItem("tt_pet_gifts", JSON.stringify(own)); petDiaryAdd("gift:" + id); }
  else addBerryBonus(3);
  return id;
}
function petGiftShow(id) {
  if (document.body.dataset.view !== "pet") return;
  if (typeof PetStage !== "undefined" && PetStage.act) PetStage.act("hop");
  petBurst("❤️", 2); petBuzz([20, 40, 20]); petSound("gift");
  const name = id ? ttT(PET_GIFTS[id][0]) : `3 ${ttT("顆果實")}`;
  if (typeof ttChoice === "function") ttChoice({ html: `<div class="gift-show">${id ? petGiftIcon(id, "pg-big") : BERRY_SVG}<p>${escHtml(ttT("牠自己出門晃了一圈，帶回來："))}<b>${escHtml(name)}</b></p><p class="ah-n">${escHtml(id ? ttT("收在手冊裡了") : ttT("小東西都收齊了，這次帶果實回來"))}</p></div>` }, [{ label: ttT("謝謝你"), value: true, cls: "primary" }]).then(() => renderPet());
}
// 整張重畫、只更新數字兩條路都會走到：泡泡先說什麼、要不要帶禮物回來
function petCompanion(box, i, upd) {
  const sb = box.querySelector(".pet-bubble"), sl = typeof PetStage !== "undefined" && PetStage.isAsleep && PetStage.isAsleep();
  if (sb && !sb.classList.contains("say")) { const ln = sl ? ttT("呼…呼…（輕輕點一下叫醒牠）") : petStickyLine(i); if (ln) { if (upd) petSwapText(sb, escHtml(ln)); else sb.textContent = ln; } }   // upd：只更新數字那條路（泡泡剛排了換回心情那句，要接在它後面換）   // 深夜睡著（#4）／剛健行完的感想、你不在時牠做了什麼（#10 #5）
  // 心情換了（2026-10-07 寵物新一輪 #15）：先做一個過場小動作——開心跳一下、平靜伸懶腰、想念嘆氣、睏打哈欠
  { const mk = petMood().k; let last = null; try { last = localStorage.getItem("tt_pet_mood_last"); localStorage.setItem("tt_pet_mood_last", mk); } catch (e) { /* 私密瀏覽 */ }
    if (last && last !== mk && !sl && typeof PetStage !== "undefined" && PetStage.act && !PetStage.isFeeding()) setTimeout(() => PetStage.act({ happy: "hop", content: "stretch", longing: "sigh", sleepy: "yawn" }[mk] || "look"), 600); }
  if (!sl && petGiftDue() && !window.__petGiftT) { const id = petGiftGive(); window.__petGiftT = setTimeout(() => { window.__petGiftT = 0; petGiftShow(id); }, 2600); }   // 親密滿：帶禮物回來（#9）
}
// 紀念日與節日（2026-10-07 寵物新一輪 #22）：相遇滿 30／100 天、一年、兩年那天說一句、寫進日記；
// 農曆新年、端午、中秋（前後一天）舞台掛一盞燈籠、泡泡說祝福。農曆日期內建到 2035 年
// 2026-10-09 R5 原4：延到 2035（用 lunardate 換算、跟原本 2026～2030 對過一致）；不引入曆法函式庫——日期表比換算程式簡單、好查
const PET_FEST = { ny: ["2026-02-17", "2027-02-06", "2028-01-26", "2029-02-13", "2030-02-03", "2031-01-23", "2032-02-11", "2033-01-31", "2034-02-19", "2035-02-08"], db: ["2026-06-19", "2027-06-09", "2028-05-28", "2029-06-16", "2030-06-05", "2031-06-24", "2032-06-12", "2033-06-01", "2034-06-20", "2035-06-10"], ma: ["2026-09-25", "2027-09-15", "2028-10-03", "2029-09-22", "2030-09-12", "2031-10-01", "2032-09-19", "2033-09-08", "2034-09-27", "2035-09-16"] };
const PET_FEST_LINE = { ny: "新年快樂！今年也一起去好多地方", db: "端午節快樂！粽子分我一口好不好", ma: "中秋節快樂！今晚的月亮好圓" };
function petFestival(d) {
  if (window.__ps && window.__ps.fest) return window.__ps.fest;   // 測試面板強制
  const t = (d || ttClock.date()).getTime();
  for (const k in PET_FEST) if (PET_FEST[k].some(x => Math.abs(new Date(x + "T12:00:00").getTime() - t) <= 1.5 * 864e5)) return k;
  return null;
}
function petAnniversary() {
  const h = new Date(petHatch()), now = ttClock.date(); if (isNaN(h)) return null;
  const days = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(h.getFullYear(), h.getMonth(), h.getDate())) / 864e5);
  const yr = now.getMonth() === h.getMonth() && now.getDate() === h.getDate() ? now.getFullYear() - h.getFullYear() : 0;
  return yr >= 1 ? { k: "y" + yr, n: yr, y: true } : [30, 100, 365, 500].includes(days) ? { k: "d" + days, n: days } : null;
}
function petSpecialDay() {
  const a = petAnniversary(); if (a) { petDiaryAdd("ann:" + a.k); return ttT(a.y ? "今天是我們相遇 {n} 週年！" : "今天是我們相遇第 {n} 天！").replace("{n}", a.n); }
  const f = petFestival(); return f ? ttT(PET_FEST_LINE[f]) : null;
}
// 回憶（2026-10-09 R5 原9，縮小版）：一天最多一次，偶爾提起一個月以前走過的步道——不預測、不催你出門
function petMemoryLine() {
  const day = todayStr(); if (localStorage.getItem("tt_pet_mem_day") === day || Math.random() > .35) return null;
  const old = realRecords().filter(r => r && r.trailName && ttClock.now() - new Date(r.date).getTime() > 30 * 864e5); if (!old.length) return null;
  const r = old[Math.floor(Math.random() * old.length)]; localStorage.setItem("tt_pet_mem_day", day);
  return ttT("還記得{t}嗎？那天走了 {km} km").replace("{t}", r.trailName).replace("{km}", (+r.distanceKm || 0).toFixed(1));
}
// 打開夥伴頁時泡泡先說什麼：剛健行完的感想 > 你不在時牠做了什麼；說了就留 25 秒（期間天氣回來重畫也不換掉）
function petStickyLine(i) {
  const w = window.__petLine; if (w && w.until > Date.now()) return w.t;
  const away = petAwayLine(i), t = petSpecialDay() || petRecapLine() || (away ? ttT(away) : null) || petMemoryLine();
  if (t) window.__petLine = { t, until: Date.now() + 25000 };
  return t;
}
// 每日任務/目標一律用「本地日期」：toISOString 是 UTC，台灣早上 8 點前會被算成前一天，
// 造成任務進度看起來莫名被刷新。跨日以本地午夜為準。
function localDayOf(d) { const t = new Date(d); if (isNaN(t)) return ""; return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; }
function todayStr() { return localDayOf(ttClock.date()); }
function localDay(iso) { return localDayOf(iso); }
// 本地年月／年份（分析、年度回顧、匯出用）：以前直接切 ISO 字串＝UTC，月初 8 點前那趟會算到上個月
function localYM(iso) { return localDayOf(iso).slice(0, 7); }
function localYear(iso) { return localDayOf(iso).slice(0, 4); }
const FEED_COOLDOWN = 8 * 3600e3;   // 餵食冷卻 8 小時
function feedCooldownMs() { return Math.min(FEED_COOLDOWN, Math.max(0, FEED_COOLDOWN - (ttClock.now() - (+(localStorage.getItem("tt_pet_fed_t") || 0))))); }   // 上限 8 小時：時間快轉後撥回來、或手機時間被調過，餵食時間會落在「未來」，不能因此等更久
function canFeedNow() { return berriesBalance() >= 3 && feedCooldownMs() === 0; }   // 「現在能不能餵」（看 8h 冷卻，非每日）
// 季節果實（2026-10-09 第三版 R10，原15 縮小版）：舞台上掉下來的果實依季節換外觀（春櫻桃、夏芒果、秋柿子、冬橘子）；
// 大小、咬的位置、吃法完全不變（只換畫，不碰餵食動畫）。介面上的「果實」貨幣圖示照舊
// 配色變體（原21）：照健行風格解鎖——森林走滿 3 趟＝深林、海景／湖泊 3 趟＝海風、海拔 1500m 以上 3 趟＝高山；手冊裡選（tt_pet_tone，進備份）
// 配色解鎖進度：同一類步道走了幾趟（3 趟解鎖）；測試面板「配色全解鎖」設 window.__toneAll
function petToneProgress() {
  const recs = realRecords(), n = f => recs.filter(f).length, tg = r => { try { const t = r.trailId && TRAILS.find(x => x.id === r.trailId); return t && typeof tagsOf === "function" ? tagsOf(t) : []; } catch (e) { return []; } };
  return { deep: n(r => tg(r).includes("森林")), sea: n(r => tg(r).some(x => x === "海景" || x === "湖泊")), alpine: n(r => (r.altHigh || 0) >= 1500) };
}
function petToneUnlocked() {
  if (window.__toneAll) return { "": true, deep: true, sea: true, alpine: true };
  const p = petToneProgress(); return { "": true, deep: p.deep >= 3, sea: p.sea >= 3, alpine: p.alpine >= 3 };
}
// R15（2026-10-09）配色→相近物種：同一階、同樣的成長，只是長成那類步道的近親（名字、描述跟著換；PET_ART 畫對應的物種）
const PET_VARIANTS = {
  deep: [["苔紋之卵", "長著青苔的蛋，在森林的陰涼處慢慢醒來。"], ["枯葉蝶幼蟲", "深色絨毛配橘色棘刺，躲在落葉堆裡。"], ["寬尾鳳蝶", "台灣特有的鳳蝶，寬寬的尾突在林間滑翔。"], ["林間石虎", "耳後白斑、一身斑點，悄悄穿過樹林。"], ["霧林雲豹", "雲狀斑紋，傳說中的森林之王。"], ["林苔幼龍", "鹿角冒出嫩葉的小龍。"], ["森羅神龍", "守護整片森林的神龍。"]],
  sea: [["貝紋之卵", "帶著貝殼紋路，聽得見海浪聲。"], ["青斑蝶幼蟲", "黑白黃三色條紋，頭上一對長觸鬚。"], ["大白斑蝶", "白底黑斑，在海邊慢慢飄。"], ["溪岸水獺", "圓耳朵、扁尾巴，最愛玩水。"], ["浪紋海虎", "身上是浪花紋的海風之虎。"], ["潮汐幼龍", "鰭狀耳朵、珊瑚色小角的海龍寶寶。"], ["滄海神龍", "在浪頭上騰雲駕霧的神龍。"]],
  alpine: [["雪紋之卵", "覆著雪花紋的蛋，在高山上靜靜等待。"], ["燈蛾幼蟲", "一身白色長毛，不怕山上的冷風。"], ["曙鳳蝶", "台灣高山的鳳蝶，紅色身體、黑色翅膀。"], ["黃喉貂", "黃色喉嚨、長長的尾巴，敏捷的高山獵手。"], ["雪岩雪豹", "灰白毛色、玫瑰斑紋，蓬鬆的大尾巴。"], ["霜角幼龍", "冰柱般的小角，呼出來的氣是白的。"], ["雪嶺神龍", "白鬃飄飄，盤踞在雪嶺之上。"]],
};
// 這一階（自己的夥伴、照現在選的配色）：名字、描述換成那個物種；v 有給就用 v（好友的）
function petStageInfo(i, v) { const t = v == null ? petTone() : v, base = PET_STAGES[i] || PET_STAGES[0], x = PET_VARIANTS[t] && PET_VARIANTS[t][i]; return x ? Object.assign({}, base, { n: x[0], d: x[1], v: t }) : base; }
function petTone() { const t = localStorage.getItem("tt_pet_tone") || ""; return petToneUnlocked()[t] ? t : ""; }
function petApplyTone() { if (typeof PET_ART !== "undefined" && PET_ART.setTone) PET_ART.setTone(petTone()); }
function petFruitSvg() {
  const se = typeof PetStage !== "undefined" ? ((window.__ps && window.__ps.season) || PetStage.season()) : "";
  const F = {
    spring: '<path d="M12 3c-1 3-3 5-5 7M12 3c1 3 3 4 5 6" stroke="#4f7a3a" stroke-width="1.3" fill="none" stroke-linecap="round"/><circle cx="7.4" cy="15" r="5" fill="#d8283e"/><circle cx="16.6" cy="15.6" r="5" fill="#c51f36"/><ellipse cx="6" cy="13.4" rx="1.4" ry="1" fill="#ff9aa8"/><ellipse cx="15.2" cy="14" rx="1.4" ry="1" fill="#ff9aa8"/>',
    summer: '<path d="M12 4.4c5 0 8 4 8 8.6S16.4 21 11.4 21C6.6 21 4 17.6 4 13.4S7.2 4.4 12 4.4Z" fill="#f4a72a"/><path d="M12 4.4c5 0 8 4 8 8.6 0 3-1.6 5.6-4.4 7" fill="#e8762a" opacity=".55"/><ellipse cx="8.6" cy="9.6" rx="1.8" ry="1.2" fill="#ffe08a"/><path d="M12 4.4c0-1.4 1-2.4 2.6-2.4" stroke="#4f7a3a" stroke-width="1.3" fill="none" stroke-linecap="round"/>',
    autumn: '<circle cx="12" cy="14" r="7" fill="#f0782a"/><path d="M5.4 12.6a7 7 0 0 0 13.2 0" fill="#d95f1e" opacity=".45"/><path d="M8 7.6c1.4.8 2.6.8 4 0 1.4.8 2.6.8 4 0-1 2-2.4 2.4-4 1.8-1.6.6-3 .2-4-1.8Z" fill="#4f7a3a"/><ellipse cx="9" cy="12" rx="1.6" ry="1" fill="#ffc28a"/>',
    winter: '<circle cx="12" cy="14" r="7" fill="#f59a1e"/><circle cx="9.4" cy="11.6" r=".6" fill="#ffd28a"/><circle cx="14" cy="12.4" r=".6" fill="#ffd28a"/><circle cx="11" cy="16.6" r=".6" fill="#ffd28a"/><path d="M12 7c.4-1.6 2-2.6 3.8-2.2-.6 1.6-2 2.4-3.8 2.2Z" fill="#4f9a3e"/><ellipse cx="9" cy="11.8" rx="1.8" ry="1.1" fill="#ffcf7a" opacity=".8"/>',
  };
  return F[se] ? `<svg class="berry" viewBox="0 0 24 24" aria-hidden="true">${F[se]}</svg>` : BERRY_SVG_BASE;
}
function feedPet() {
  if (typeof PetStage !== "undefined" && PetStage.isPlaying && PetStage.isPlaying()) { petSay(ttT("玩完再吃～")); return; }
  if (feedCooldownMs() > 0) { petSay(`${ttT("牠還飽著，約")} ${Math.ceil(feedCooldownMs() / 3600e3)} ${ttT("小時後再餵")}`); return; }
  if (berriesBalance() < 3) { petSay(ttT("果實不夠，再多走一點就有")); return; }
  const heartsBefore = petHearts();
  localStorage.setItem("tt_pet_berry_spent", String((+(localStorage.getItem("tt_pet_berry_spent") || 0)) + 3));
  bumpAffinity(15);
  localStorage.setItem("tt_pet_fed_t", String(ttClock.now())); petDiaryAdd("feed1");
  const gain = heartsBefore >= 5 ? 0.5 : 0.3;                  // 親密度滿時照顧獎勵更多
  localStorage.setItem("tt_pet_feedkm", String(+(feedBonusKm() + gain).toFixed(2)));
  petBuzz([20, 30, 20]);
  const done = () => {
    petBurst("❤️", 2);   // 先冒愛心
    window.__petEvolving = false; checkPetEvolve();    // 進化了會整張重畫（被進化儀式蓋住，看不到跳動）
    if (window.__petEvolving) { renderPet(); return; }
    // 沒進化：說一句、「+km」飛進成長進度條，飛到的那一格才更新卡片（進度條往前長、成長里程往上數、「再走 X km」跳一下）
    petSay(ttT("牠吃得好開心"));
    petFloat(`+${gain} km`, ".pet-card .pet-track", () => { renderPet(); document.querySelectorAll(".pet-card .pet-evo-top b, .pet-card .pet-chip .cv").forEach(e => { e.classList.remove("pet-bump"); void e.offsetWidth; e.classList.add("pet-bump"); }); }, BERRY_SVG);
  };
  // 果實從天上掉下來、牠走過去吃（pet-stage.js）；舞台不在畫面上或減少動態效果時直接結算
  const fb = $("#petFeed"); if (fb) fb.disabled = true;
  if (typeof PetStage !== "undefined") PetStage.feed(petFruitSvg()).then(done, e => { done(); setTimeout(() => { throw e; }); });   // 2026-10-06：失敗照樣結算，但把錯誤丟出來（以前安靜吞掉，幼蟲掉頭壞了好幾個版本都沒人知道）
  else done();
}
// 帽子要用果實解鎖（果實除了餵食之外多一個用途）；解過的永久擁有
const HAT_COST = 10;
function hatsOwned() {
  let s; try { s = new Set(JSON.parse(localStorage.getItem("tt_pet_hats_owned")) || ["none"]); } catch { s = new Set(["none"]); }
  if (typeof PetJourney !== "undefined" && typeof Premium !== "undefined" && Premium.isOn()) PetJourney.regionHats().forEach(h => s.add(h));   // 地區配件（PRO）：走過那個地區就有（從紀錄推，不存）
  return s;
}
// 蛋上的裂縫數（進化進度 1/3、2/3 各多一道；pet-art.js 的 .pc-crack2/3、CSS 讀 .ps-box[data-evo]）
const petEvoLv = pct => (pct == null ? 0 : pct >= 67 ? 2 : pct >= 34 ? 1 : 0);
function petStageIndex(km) { let i = 0; for (let k = 0; k < PET_STAGES.length; k++) if (km >= PET_STAGES[k].km) i = k; return i; }
function petName() { return localStorage.getItem("tt_pet_name") || ""; }
// 脖子上的配件（2026-10-09 R5 原20）：跟帽子分開的第二個位置；用果實換（跟帽子同價、同樣的 PRO 規則），換過的一直是你的
function petAcc() { const v = localStorage.getItem("tt_pet_acc") || "none"; return typeof PET_ART !== "undefined" && PET_ART.ACC_IDS && PET_ART.ACC_IDS.includes(v) ? v : "none"; }
function accsOwned() { try { return new Set(JSON.parse(localStorage.getItem("tt_pet_accs_owned") || "[]")); } catch (e) { return new Set(); } }
function petHat() {   // A5 配件（Premium 裝扮）
  const h = localStorage.getItem("tt_pet_hat") || "none";
  // 地區配件是 PRO 的旅行功能、不是用果實買的：沒有 PRO 就不戴（用果實換的配件到期後照樣能戴）
  if (typeof PetJourney !== "undefined" && PetJourney.hatRegion(h) && !(typeof Premium !== "undefined" && Premium.isOn())) return "none";
  return h;
}
// 裝扮選擇器：戴帽子在夥伴頭上。
// 免費版也能打開：自己掙來的（每月挑戰的登山頭巾）和以前換過的照樣能戴；用果實換新配件是 PRO 福利。
const FREE_HATS = new Set(["none", "bandana", "santa", "rabbit"]);
// 季節限定配件（2026-10-07 寵物新一輪 #17）：當季免費拿、拿了永遠擁有；不在季節內＝顯示什麼時候拿得到
const HAT_SEASON = { santa: { hint: "12 月到 1 月初才拿得到", on: d => d.getMonth() === 11 || (d.getMonth() === 0 && d.getDate() <= 6) },
  rabbit: { hint: "中秋節前後一週才拿得到", on: d => PET_FEST.ma.some(x => Math.abs(new Date(x + "T12:00:00") - d) <= 7.5 * 864e5) } };
function hatSeason(id) { const s = HAT_SEASON[id]; if (!s) return null; const f = !!window.__hatSeasonAll; return { on: f || s.on(ttClock.date()), hint: s.hint }; }   // __hatSeasonAll：測試面板強制當季
// ── 裝扮視窗（2026-10-09 修正案 R8-1，使用者：「裝扮設計得太粗糙」）──
// 上面是大預覽（先試穿）；帽子／配件／擺設三頁；每組標「已收集 n/m」；格子只畫配件本身（沒拿到的照樣是彩色＋小鎖＋怎麼拿）。
// 點格子：已經有的、免費可拿的＝直接戴；要用果實換的＝先試穿，下面的按鈕「用 10 顆果實換上」按了才扣（使用者決定 2）；
// 免費版點 PRO 的＝開升級面板；每月挑戰、季節沒到、地區沒走過＝試穿看樣子＋說怎麼拿
const HAT_GROUPS = [["用果實換", ["none", "straw", "party", "crown", "bow"]], ["每月挑戰", ["bandana"]], ["走過那個地區", ["silvergrass", "maple", "pineapple", "wave", "shell"]], ["季節限定", ["santa", "rabbit"]]];
function hatState(id, pro, own) {
  const reg = typeof PetJourney !== "undefined" ? PetJourney.hatRegion(id) : "", sea = hatSeason(id), has = own.has(id);
  if (id === "none" || has) return { k: "own" };
  if (reg) return pro ? { k: "lock", msg: `${ttT(reg)}・${ttT("走過那裡的步道就會解鎖")}` } : { k: "pro" };
  if (id === "bandana") return { k: "lock", msg: ttT("完成一次每月挑戰就會解鎖，在夥伴頁看進度") };
  if (sea) return sea.on ? { k: "free" } : { k: "lock", msg: `${ttT("季節限定")}・${ttT(sea.hint)}` };
  return !pro && !FREE_HATS.has(id) ? { k: "pro" } : { k: "buy" };
}
function accState(id, i, pro, own) {
  if (id === "none" || own.has(id)) return PET_ART.accOk(i, id) ? { k: "own" } : { k: "na" };
  if (!PET_ART.accOk(i, id)) return { k: "na" };
  return pro ? { k: "buy" } : { k: "pro" };
}
function openHatPicker() {
  if (document.querySelector('[data-ov="pethat"]')) return;
  const pro = typeof Premium !== "undefined" && Premium.isOn(), i = petStageIndex(totalKm());
  let tryHat = petHat(), tryAcc = petAcc(), pane = "hat";
  const badge = st => st.k === "buy" ? `<div class="hat-cost">${BERRY_SVG}${HAT_COST}</div>` : st.k === "pro" ? `<div class="hat-cost"><span class="pro-tag">PRO</span></div>` : st.k === "lock" ? `<div class="hat-cost dr-lock">${ic("lock")}</div>` : "";
  const tile = (kind, id, st, on) => `<button class="hat-opt ${kind === "acc" ? "acc-opt" : ""}${on ? " on" : ""}${st.k === "own" || st.k === "free" ? "" : " locked"}${st.k === "lock" ? " quest" : ""}${st.k === "na" ? " na" : ""}" data-${kind}="${id}"${st.k === "na" ? ' aria-disabled="true"' : ""}>` +
    `<div class="hat-prev dr-ic">${id === "none" ? `<span class="dr-none">${ic("x")}</span>` : kind === "acc" ? PET_ART.accIcon(i, id) : PET_ART.hatIcon(id)}</div><div class="hat-lbl">${ttT(kind === "acc" ? PET_ART.ACC_LABEL[id] : PET_ART.HAT_LABEL[id])}</div>${badge(st)}</button>`;
  const hatPane = () => { const own = hatsOwned(), cur = petHat(); return HAT_GROUPS.map(([t, ids]) => { const got = ids.filter(id => id !== "none" && own.has(id)).length, all = ids.filter(id => id !== "none").length;
    return `<div class="dr-grp"><div class="dr-gh">${ttT(t)}<small>${ttT("已收集 {n}/{m}").replace("{n}", got).replace("{m}", all)}</small></div><div class="hat-grid">${ids.map(id => tile("hat", id, hatState(id, pro, own), id === cur)).join("")}</div></div>`; }).join(""); };
  const accPane = () => { const own = accsOwned(), cur = petAcc(), ids = PET_ART.ACC_IDS, got = ids.filter(id => id !== "none" && own.has(id)).length;
    return `<div class="dr-grp"><div class="dr-gh">${ttT("配件")}<small>${ttT("已收集 {n}/{m}").replace("{n}", got).replace("{m}", ids.length - 1)}</small></div><div class="hat-grid acc-grid">${ids.map(id => tile("acc", id, accState(id, i, pro, own), id === cur)).join("")}</div>${i === 0 ? `<p class="dr-note">${ttT("蛋還沒有脖子，孵出來就能戴")}</p>` : ""}</div>`; };
  const ov = document.createElement("div"); ov.className = "pet-modal"; ov.dataset.ov = "pethat";
  ov.innerHTML = `<div class="pet-modal-card dr-card"><button class="sheet-close" id="hatClose" aria-label="${ttT("關閉")}">${ic("x")}</button><h2>${ic("sparkle")} ${ttT("幫夥伴裝扮")}</h2>
    <div class="dr-prev" aria-live="polite"><div class="dr-stage"></div><div class="dr-try"></div></div>
    <div class="hat-bal">${ttT("你有")} ${BERRY_SVG}<b>${berriesBalance()}</b></div>
    <div class="dr-tabs pp-tods" role="tablist">${[["hat", "帽子"], ["acc", "配件"], ["prop", "擺設"]].map(([k, l]) => `<button class="pp-tod${k === pane ? " on" : ""}" role="tab" aria-selected="${k === pane}" data-pane="${k}">${ttT(l)}</button>`).join("")}</div>
    <div class="dr-pane" data-pane="hat">${hatPane()}</div><div class="dr-pane" data-pane="acc" hidden>${accPane()}</div><div class="dr-pane" data-pane="prop" hidden>${petPropsPicker()}</div>
    <div class="dr-bar"><span class="dr-msg"></span><button class="btn primary" id="drBuy" hidden></button></div></div>`;
  document.body.appendChild(ov);
  bindPropsPicker(ov);
  let _a11y = null;
  const close = () => { if (_a11y) _a11y(); ov.remove(); };
  if (typeof ttModalA11y === "function") _a11y = ttModalA11y(ov, close, { focus: "#hatClose" });
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  ov.querySelector("#hatClose").addEventListener("click", close);
  const stageEl = ov.querySelector(".dr-stage"), tryEl = ov.querySelector(".dr-try"), msg = ov.querySelector(".dr-msg"), buy = ov.querySelector("#drBuy");
  const drawPrev = () => { stageEl.innerHTML = PET_ART.own(() => PET_ART.svg(i, "", tryHat, 30, tryAcc));
    const tryNow = (tryHat !== petHat() || tryAcc !== petAcc()); tryEl.textContent = tryNow ? `${ttT("試穿中")}${ttColon()}${[tryHat !== petHat() ? ttT(PET_ART.HAT_LABEL[tryHat]) : "", tryAcc !== petAcc() ? ttT(PET_ART.ACC_LABEL[tryAcc]) : ""].filter(Boolean).join("、")}` : ""; };
  const bar = (text, buyLabel, onBuy) => { msg.textContent = text || ""; buy.hidden = !buyLabel; if (buyLabel) { buy.innerHTML = buyLabel; buy.onclick = onBuy; } };
  const bal = () => { const b = ov.querySelector(".hat-bal b"); if (b) b.textContent = berriesBalance(); };
  const refresh = () => { ov.querySelector('[data-pane="hat"].dr-pane').innerHTML = hatPane(); ov.querySelector('[data-pane="acc"].dr-pane').innerHTML = accPane(); bindTiles(); };
  const wearHat = id => { localStorage.setItem("tt_pet_hat", id); tryHat = id; renderPet(); petBuzz(15); refresh(); drawPrev(); bar(""); };
  const wearAcc = id => { localStorage.setItem("tt_pet_acc", id); tryAcc = id; renderPet(); petBuzz(15); refresh(); drawPrev(); bar(""); };
  const pay = () => { if (berriesBalance() < HAT_COST) { toast(`${ttT("果實還差")} ${HAT_COST - berriesBalance()}`); return false; }
    localStorage.setItem("tt_pet_berry_spent", String((+(localStorage.getItem("tt_pet_berry_spent") || 0)) + HAT_COST)); bal(); return true; };   // 先結算（A4）
  const buyLabel = () => `${BERRY_SVG} ${ttT("用 {n} 顆果實換上").replace("{n}", HAT_COST)}`;
  function bindTiles() {
    ov.querySelectorAll(".hat-opt[data-hat]").forEach(btn => btn.addEventListener("click", () => {
      const id = btn.dataset.hat, own = hatsOwned(), st = hatState(id, pro, own);
      ov.querySelectorAll(".hat-opt[data-hat]").forEach(b => b.classList.toggle("sel", b === btn));
      if (st.k === "pro") { _proGate(); return; }
      tryHat = id; drawPrev();
      if (st.k === "own") return wearHat(id);
      if (st.k === "free") { own.add(id); localStorage.setItem("tt_pet_hats_owned", JSON.stringify([...own].filter(h => !(typeof PetJourney !== "undefined" && PetJourney.hatRegion(h))))); toast(`${ttT("拿到了")}${ttColon()}${ttT(PET_ART.HAT_LABEL[id])}`); return wearHat(id); }
      if (st.k === "lock") { toast(st.msg); return bar(st.msg); }
      bar(ttT(PET_ART.HAT_LABEL[id]), buyLabel(), () => { if (!pay()) return; const o = hatsOwned(); o.add(id); localStorage.setItem("tt_pet_hats_owned", JSON.stringify([...o].filter(h => !(typeof PetJourney !== "undefined" && PetJourney.hatRegion(h))))); wearHat(id); });
    }));
    ov.querySelectorAll(".hat-opt[data-acc]").forEach(btn => btn.addEventListener("click", () => {
      const id = btn.dataset.acc, own = accsOwned(), st = accState(id, i, pro, own);
      ov.querySelectorAll(".hat-opt[data-acc]").forEach(b => b.classList.toggle("sel", b === btn));
      if (st.k === "na") return bar(i === 0 ? ttT("蛋還沒有脖子，孵出來就能戴") : ttT("這一階戴不了（身體的樣子放不上去）"));
      if (st.k === "pro") { _proGate(); return; }
      tryAcc = id; drawPrev();
      if (st.k === "own") return wearAcc(id);
      bar(ttT(PET_ART.ACC_LABEL[id]), buyLabel(), () => { if (!pay()) return; const o = accsOwned(); o.add(id); localStorage.setItem("tt_pet_accs_owned", JSON.stringify([...o])); wearAcc(id); });
    }));
  }
  bindTiles(); drawPrev();
  ov.querySelectorAll(".dr-tabs .pp-tod").forEach(b => b.addEventListener("click", () => { pane = b.dataset.pane;
    ov.querySelectorAll(".dr-tabs .pp-tod").forEach(o => { o.classList.toggle("on", o === b); o.setAttribute("aria-selected", o === b); });
    ov.querySelectorAll(".dr-pane").forEach(p => { p.hidden = p.dataset.pane !== pane; }); bar(""); }));
}
// 夥伴的音效與震動（2026-10-07 寵物新一輪 #23）：音效預設關（吃東西、抱抱、進化、收到禮物各一種輕柔的合成音，不用音檔）；震動預設開，可以在「？」裡關掉
const petHapticOn = () => localStorage.getItem("tt_pet_haptic") !== "0", petSoundOn = () => localStorage.getItem("tt_pet_sound") === "1";
// 裝置做得到才顯示開關（2026-10-08 修正案 A6）：以前 iPhone 網頁版有「夥伴震動」開關但 Safari 根本沒有震動；
// 搖手機在 iPhone 要先請「動作與方向」權限，以前從沒請過＝這個功能在 iPhone 上一直是死的
// 玩松果（2026-10-08 R4 原6）：x＝丟到哪裡（相對舞台中間的 px；null＝隨便丟）。10 分鐘內玩到第 3 次會累：打個哈欠、休息 2 分鐘
const _petPlays = [];
function petPlayAt(x) {
  if (typeof PetStage === "undefined" || !PetStage.play) return;
  if (PetStage.isFeeding() || PetStage.isPlaying()) { petSay(ttT("正在忙，等我一下～"), 1600); return; }
  const now = Date.now(); while (_petPlays.length && now - _petPlays[0] > 10 * 60e3) _petPlays.shift();
  if (_petPlays.length >= 3 && now - _petPlays[_petPlays.length - 1] < 2 * 60e3) { petSay(ttT("玩累了，休息一下"), 2000); if (PetStage.act) PetStage.act("yawn"); return; }
  if (_petPlays.length >= 3) _petPlays.length = 0;   // 休息夠了：重新算
  _petPlays.push(now); const tired = _petPlays.length >= 3;
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) { petSay(ttT("好好玩！")); petBurst("❤️", 1); if (petPatAff()) renderPet(); return; }   /* 減少動態效果：沒有動畫，但親密照樣算（修正案共用原則 6，2026-10-08） */
  // 玩具（2026-10-09 R5 原13）：松果之外，牠帶回來的橡實、羽毛也會拿來玩（同一套落下、碰、帶、回位的流程，不各寫一套）
  const toys = ["pine"].concat(["acorn", "feather"].filter(k => petGiftsOwned().some(o => o.id === k))), toy = toys[Math.floor(Math.random() * toys.length)];
  petBuzz(12); PetStage.play(`<svg viewBox="0 0 24 24">${giftSvg(PET_GIFTS[toy][1])}</svg>`, x, toy).then(ok => { if (!ok) return;
    if (tired) { petSay(ttT("玩累了，休息一下"), 2400); if (PetStage.act) setTimeout(() => PetStage.act("yawn"), 300); }   // 累了只喘口氣、打個哈欠（不加新的數值）
    else petSay(ttT(["好好玩！", "再丟一次嘛", "我抓到了！"][Math.floor(Math.random() * 3)]));
    if (petPatAff()) petFloat(`${ttT("親密")} +1`, ".pet-card .pet-meter:nth-child(2) .aff-hearts", null, PET_HEART_SVG); });
}
// 睡覺時間、提醒頻率的選單（2026-10-08 修正案 R4 原5／原29）
function petSleepSel() {
  const W = typeof PetStage !== "undefined" && PetStage.sleepWin ? PetStage.sleepWin() : [22, 6], hh = h => `${String(h).padStart(2, "0")}:00`;
  const a = `<select id="petSleepA" class="ah-select"><option value="off"${W ? "" : " selected"}>${escHtml(ttT("不睡覺"))}</option>${[19, 20, 21, 22, 23, 0, 1].map(h => `<option value="${h}"${W && W[0] === h ? " selected" : ""}>${hh(h)}</option>`).join("")}</select>`;
  const b = `<select id="petSleepB" class="ah-select"${W ? "" : " disabled"}>${[4, 5, 6, 7, 8, 9].map(h => `<option value="${h}"${(W ? W[1] : 6) === h ? " selected" : ""}>${hh(h)}</option>`).join("")}</select>`;
  return `${a} ～ ${b}`;
}
function petNudgeDays() { const v = localStorage.getItem("tt_pet_nudge"); return v == null ? 3 : +v || 0; }
const petCan = {
  sound: () => !!(window.AudioContext || window.webkitAudioContext),
  haptic: () => { const C = window.Capacitor; return !!(C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.Haptics) || typeof navigator.vibrate === "function"; },
  motionAsk: () => typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function",   // 只有 iPhone 需要（Android 不用問就有）
};
function petBuzz(p) { if (petHapticOn() && typeof ttBuzz === "function") ttBuzz(p); }
let _petAc = null;
function petSound(k) {
  if (!petSoundOn()) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; _petAc = _petAc || new AC(); const c = _petAc; if (c.state === "suspended") c.resume();
    const tone = (f, t, d, type, v, f2) => { const o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + t; o.type = type || "sine"; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d);
      g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(v || .12, t0 + .015); g.gain.exponentialRampToValueAtTime(.0001, t0 + d); o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + d + .02); };
    if (k === "bite") { tone(620, 0, .09, "sine", .1, 380); tone(480, .07, .08, "sine", .07, 300); }
    else if (k === "hug") [523, 659, 784].forEach((f, i) => tone(f, i * .09, .35, "triangle", .07));
    else if (k === "evolve") [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * .12, .5, "triangle", .08));
    else if (k === "gift") { tone(880, 0, .25, "sine", .08); tone(1175, .12, .35, "sine", .07); }
    else if (k === "hop") { if (petAcc() === "bell") { tone(1568, 0, .18, "sine", .05); tone(2093, .05, .22, "sine", .035); } }   // 戴著小鈴鐺跳：叮（2026-10-09 R8；音效預設關）
  } catch (e) { /* 沒有音訊就安靜 */ }
}
window.addEventListener("pet-fx", e => petSound(e.detail));
// 好友送的果實（2026-10-07 寵物新一輪 #20）：從舞台上方一顆一顆飄下來，再化成「+N」飛進餵食鈕；不在夥伴頁就照舊跳提示
function petGiftBerries(n) {
  const ps = document.querySelector(".pet-card .ps-box");
  if (!ps || document.body.dataset.view !== "pet" || !ps.getClientRects().length) { toast(`${ttT("收到好友送的果實")} +${n}`); renderPet(); return; }
  const k = Math.min(5, n), wrap = document.createElement("div"); wrap.className = "ps-giftb"; wrap.setAttribute("aria-hidden", "true");
  wrap.innerHTML = Array.from({ length: k }, (_, j) => `<i style="left:${20 + j * 60 / Math.max(1, k - 1)}%;--dl:${j * 140}ms;--r:${(j % 2 ? 1 : -1) * (10 + j * 6)}deg">${BERRY_SVG}</i>`).join("");
  ps.appendChild(wrap); petSay(ttT("好友送你 {n} 顆果實！").replace("{n}", n), 2600); petBuzz([15, 40, 15]); petSound("gift");
  setTimeout(() => { wrap.remove(); petFloat(`+${n}`, "#petFeed", () => renderPet(), BERRY_SVG); }, 1100 + k * 140);
}
// 舞台擺設（2026-10-07 寵物新一輪 #16，參考 Finch 的房間佈置）：牠帶回來的小東西＋四個里程碑小物，挑兩個擺在舞台左右下角
const PET_PROP_EXTRA = {
  tent: ["小帳篷", "走滿 10 趟", '<path d="M2 21 12 4l10 17Z" fill="#e8a33d" stroke="#9a6418" stroke-width="1.3" stroke-linejoin="round"/><path d="M12 4v17M9 21l3-6 3 6" fill="#7a4c14" stroke="#9a6418" stroke-width="1.2"/>', () => realRecords().length >= 10],
  sign: ["小路標", "走過 5 條不同的步道", '<path d="M11 3h2v19h-2Z" fill="#8a5a2a"/><path d="M4 5h13l3 3-3 3H4Z" fill="#d8b47a" stroke="#8a5a2a" stroke-width="1.2"/><path d="M20 12H8l-3 3 3 3h12Z" fill="#c99a5a" stroke="#8a5a2a" stroke-width="1.2"/>', () => new Set(realRecords().map(r => r.trailId).filter(Boolean)).size >= 5],
  fire: ["小營火", "有一趟走到天黑才回來", '<path d="M4 21l16-4M4 17l16 4" stroke="#7a4c14" stroke-width="2.4" stroke-linecap="round"/><path d="M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8Z" fill="#f2793a"/><path d="M12 9c1.5 2 2.5 3 2.5 4.5a2.5 2.5 0 0 1-5 0c0-1.5 1-2.5 2.5-4.5Z" fill="#ffd36a"/>', () => realRecords().some(r => { const e = new Date(new Date(r.date).getTime() + (r.elapsedMs || 0)).getHours(); return e >= 18 || e < 4; })],
  pole: ["登山杖", "成長里程滿 100 km", '<path d="M8 2l2 20M16 2l-2 20" stroke="#5d7180" stroke-width="2.2" stroke-linecap="round"/><path d="M7 5h4M13 5h4" stroke="#d6372f" stroke-width="3" stroke-linecap="round"/><circle cx="10" cy="21" r="1.6" fill="#333"/><circle cx="14" cy="21" r="1.6" fill="#333"/>', () => totalKm() >= 100],
};
// ── 小東西與擺設 v2（2026-10-09，使用者：「目前所有的配件和新加的都要設計精緻一點」）──
// 以前是 24×24 的平塗小圖；改用角色同一套畫法（PET_ART.kit 的 P：有色外框、右下暗面、左上高光）＋材質細節。名字、取得條件不變。
// 圖裡有裁切（§ 開頭的 id）：每次畫都要經過 giftSvg() 換成自己的 id（同一頁會畫很多份）
let _gU = 0;
const giftSvg = raw => String(raw || "").replace(/§/g, "g" + (++_gU).toString(36) + "_");
(() => {
  if (typeof PET_ART === "undefined" || !PET_ART.kit) return;
  const { P, E, C, Pa } = PET_ART.kit, o = (hl, dx) => ({ hl, dx: dx || .7, dy: dx || .8, sw: 1 }), L = (d, c, w) => `<path d="${d}" stroke="${c}" stroke-width="${w || .8}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  const G = {
    pine: L("M12 6.5V2.6", "#4f7a3a", 1.5) + P(E(12, 14, 6, 8), "#9a6a3a", o([9.8, 10.5, 1.4, 2.6])) + L("M6.8 11.2q2.6 2 5.2 0q2.6 2 5.2 0M6.4 14.6q2.8 2 5.6 0q2.8 2 5.6 0M7.4 18q2.3 1.8 4.6 0q2.3 1.8 4.6 0", "#6b4422", .85),
    feather: P(Pa("M18.5 2.8C9.5 4.6 6 11.6 5.8 19l2.2-1C9 12 12.2 7.8 18.5 2.8Z"), "#dfe8f4", o([12, 8.5, 1, 3.2])) + L("M8.6 15.6l3.6-1.6M9.6 12.6l4.4-2M11.4 9.6l4.4-2.2M13.6 6.8l3.6-2", "#9fb3cc", .7) + L("M5.8 19L4 22", "#7d93ad", 1.4),
    maple: P(Pa("M12 2l2 4 4-1-1 4 4 2-4 2 1 3-4-1-1 5h-2l-1-5-4 1 1-3-4-2 4-2-1-4 4 1Z"), "#e0603a", o([9.6, 8, 1.4, 1])) + L("M12 6v14M12 11l-3.6-2.4M12 11l3.6-2.4M12 14.4l-3.2 1M12 14.4l3.2 1", "#a83a1f", .7),
    stone: P(E(12, 14, 8, 6), "#8fa3b0", o([8.6, 11.6, 2.6, 1.3], .9)) + L("M5.6 13.2c3 2.2 9.8 2.2 12.8 0", "#e8eef2", 1.3) + `<circle cx="14.6" cy="16.4" r=".7" fill="#6c8090"/><circle cx="9.4" cy="17" r=".5" fill="#6c8090"/>`,
    acorn: L("M12 5V2.8", "#5a3a1c", 1.4) + P(Pa("M7.2 10.2c0 6 2 9.8 4.8 9.8s4.8-3.8 4.8-9.8Z"), "#c98a4a", o([10.2, 13.6, 1.2, 2.6])) + P(Pa("M5.8 10.6c0-3.2 2.8-5.4 6.2-5.4s6.2 2.2 6.2 5.4Z"), "#7a5230", o(null, .5)) + L("M8 9.6l1.6-2.6M11 9.8l1.2-3M14 9.6l1.2-2.6", "#5a3a1c", .7),
    flower: L("M12 13v9", "#5d9a4a", 1.4) + P(Pa("M12 18q-4-1-5 1q3 2 5-1Z"), "#6aab55", o(null, .4)) + [0, 72, 144, 216, 288].map(a => P(E(12, 6.4, 2.9, 4).replace("<ellipse", `<ellipse transform="rotate(${a} 12 10.6)"`), "#f2a6c2", o(null, .4))).join("") + P(C(12, 10.6, 2.1), "#f7c04a", o([11.4, 10, .6, .5], .3)),
    crystal: P(Pa("M12 2l5 6-2 13H9L7 8Z"), "#bfe6f0", o([10, 7, 1, 3])) + L("M12 2v19M7 8h10M9.5 21L12 8l2.5 13", "#5aa3b8", .7) + `<path d="M18.6 3.4l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5Z" fill="#fff6c8"/>`,
    shell: P(C(12, 13, 7), "#e8c58a", o([9.4, 10.2, 1.8, 1.2])) + L("M12 13a2.4 2.4 0 1 1 2.4 2.4a4.8 4.8 0 1 1-4.8-5.6", "#a37a3a", 1) + L("M17.6 17.6q2.4 1.6 3.4 3.8", "#c9a066", 1.2),
    fern: L("M12 22C12 14 11 8 8 2", "#4f7a3a", 1.3) + [4, 7, 10, 13, 16].map((y, k) => P(Pa(`M${(11 - k * .3).toFixed(1)} ${y + 2}q-3-2.4-6-.4q3 2 6 .4Z`), "#6aab55", o(null, .3)) + P(Pa(`M${(11.6 - k * .3).toFixed(1)} ${y + 2}q3-2.6 6-.8q-3 2-6 .8Z`), "#78b862", o(null, .3))).join(""),
    bean: P(E(9, 13, 4, 5), "#d8322a", o([7.8, 11, 1, 1.4])) + `<path d="M6.2 10.4a2 2 0 0 1 2-2.2" stroke="#1e1a1a" stroke-width="2.2" stroke-linecap="round" fill="none"/>` + P(E(16, 12, 3.4, 4.4), "#d8322a", o([15, 10.4, .8, 1.2])),
    moss: P(C(12, 13.4, 7.8), "#6f9a3e", o([9.4, 10.4, 2, 1.4])) + L("M7 11.4l1 2M10 8.6l1 2M14 9.4l-1 2M16.4 13l-1 1.2M9 16.4l1-1.2M13 16.4l1 1.2M12 13v1.6", "#a8cf6a", 1.1) + L("M8 20.6q4 1.6 8 0", "#46692a", 1),
    gumball: [0, 45, 90, 135, 180, 225, 270, 315].map(a => `<path d="M12 6.8v-2.6" stroke="#5a3a1a" stroke-width="1.5" stroke-linecap="round" transform="rotate(${a} 12 13)"/>`).join("") + P(C(12, 13, 6.2), "#8a5a2c", o([10, 10.8, 1.4, 1])) + L("M12 6V2", "#5a3a1a", 1.1) + [[10, 12], [14, 12.6], [12, 15.4]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".8" fill="#5a3a1a"/>`).join(""),
    cicada: P(Pa("M12 4c3 0 4 3 4 6l2 6-3 1-1 3h-4l-1-3-3-1 2-6c0-3 1-6 4-6Z"), "#d6a25a", o([10.4, 8, 1, 2])) + L("M12 7v11M9 12h6M8.6 15.4l-2 1.6M15.4 15.4l2 1.6", "#9a6a2a", .8) + `<circle cx="10.4" cy="6.4" r=".8" fill="#6a4410"/><circle cx="13.6" cy="6.4" r=".8" fill="#6a4410"/>`,
    petal: P(Pa("M12 21c-5-3-7-8-5-13 2 1 3 3 5 3s3-2 5-3c2 5 0 10-5 13Z"), "#f4a3bd", o([9.4, 12, 1, 2.4])) + L("M12 11v8M12 14l-2 -1.6M12 14l2 -1.6", "#c4607f", .7),
  };
  for (const k in G) if (PET_GIFTS[k]) PET_GIFTS[k][1] = G[k];
  const X = {
    tent: L("M2 21.4h20", "#7a6a4a", 1.2) + P(Pa("M2.6 21L12 4.4 21.4 21Z"), "#e8a33d", o([9, 12, 1.4, 3])) + P(Pa("M12 9.6L8.8 21h6.4Z"), "#8a5a1a", o(null, .4)) + L("M12 4.4V1.8", "#7a4c14", 1) + `<path d="M12 1.8l3.4 1-3.4 1Z" fill="#d6372f"/>`,
    sign: P(Pa("M11 3h2v19h-2Z"), "#8a5a2a", o(null, .4)) + P(Pa("M4 5h13l3 3-3 3H4Z"), "#d8b47a", o([7, 6.8, 2, .8])) + P(Pa("M20 12H8l-3 3 3 3h12Z"), "#c99a5a", o([16, 13.8, 2, .8])) + L("M6.4 8h7.6M10 15h7.6", "#8a5a2a", .8),
    fire: P(Pa("M3.4 20.4l17-4.2 .7 2.4-17 4.2Z"), "#7a4c14", o(null, .4)) + P(Pa("M3.4 18.6l.7-2.4 17 4.2-.7 2.4Z"), "#8a5a22", o(null, .4)) + P(Pa("M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8Z"), "#f2793a", o([10, 10, 1, 2])) + `<path d="M12 9c1.5 2 2.5 3 2.5 4.5a2.5 2.5 0 0 1-5 0c0-1.5 1-2.5 2.5-4.5Z" fill="#ffd36a"/><circle cx="17.4" cy="5" r=".7" fill="#ffb45a"/><circle cx="6.8" cy="6.4" r=".5" fill="#ffb45a"/>`,
    pole: P(Pa("M7.2 2.2l1.6-.2 2 19.6-1.6.2Z"), "#6d8190", o(null, .4)) + P(Pa("M16.8 2.2l-1.6-.2-2 19.6 1.6.2Z"), "#6d8190", o(null, .4)) + P(Pa("M6.4 3.6h4.2l.3 3.4H6.7Z"), "#d6372f", o(null, .3)) + P(Pa("M13.4 3.6h4.2l-.3 3.4h-4.2Z"), "#d6372f", o(null, .3)) + `<ellipse cx="10" cy="20.6" rx="2.2" ry=".8" fill="none" stroke="#333" stroke-width=".9"/><ellipse cx="14" cy="20.6" rx="2.2" ry=".8" fill="none" stroke="#333" stroke-width=".9"/>`,
  };
  for (const k in X) if (PET_PROP_EXTRA[k]) PET_PROP_EXTRA[k][2] = X[k];
})();
function petPropsAll() { const own = new Set(petGiftsOwned().map(g => g.id)); return Object.keys(PET_GIFTS).map(id => ({ id, n: PET_GIFTS[id][0], svg: PET_GIFTS[id][1], ok: own.has(id), how: "親密滿了會帶回來" })).concat(Object.keys(PET_PROP_EXTRA).map(id => { const e = PET_PROP_EXTRA[id]; return { id, n: e[0], svg: e[2], ok: !!window.__petPropsAll || e[3](), how: e[1] }; })); }   // __petPropsAll：測試面板全解鎖
// 擺設：舞台上 3 個固定位置（2026-10-09 第三版 R13 原19：左、右、後面；不做自由拖曳——會跟視差、摸頭手勢打架）
// tt_pet_props 存 {l, r, b}；舊格式是陣列（最多 2 個，依序左、右）照讀
const PET_PROP_SLOTS = [["l", "左邊"], ["b", "後面"], ["r", "右邊"]];
function petPropsSlots() {
  let a = null; try { a = JSON.parse(localStorage.getItem("tt_pet_props") || "null"); } catch (e) { /* */ }
  const o = Array.isArray(a) ? { l: a[0] || null, r: a[1] || null, b: null } : a && typeof a === "object" ? { l: a.l || null, r: a.r || null, b: a.b || null } : { l: null, r: null, b: null };
  const ok = new Set(petPropsAll().filter(p => p.ok).map(p => p.id)); for (const k in o) if (!ok.has(o[k])) o[k] = null;   // 還沒解鎖的不擺
  return o;
}
function petPropsOn() { const o = petPropsSlots(); return ["l", "r", "b"].map(k => o[k]).filter(Boolean); }
function petPropsSvgs() { const all = petPropsAll(), o = petPropsSlots(); return ["l", "r", "b"].filter(k => o[k]).map(k => { const p = all.find(x => x.id === o[k]); return { s: k, svg: p ? `<svg viewBox="0 0 24 24">${giftSvg(p.svg)}</svg>` : "" }; }); }
function petPropsPicker() {
  const o = petPropsSlots(), all = petPropsAll(), act = "l";
  const slot = ([k, l]) => { const p = o[k] && all.find(x => x.id === o[k]); return `<button class="prop-slot${k === act ? " on" : ""}" data-slot="${k}"><span class="ps-ic">${p ? `<svg viewBox="0 0 24 24">${giftSvg(p.svg)}</svg>` : ""}</span>${escHtml(ttT(l))}</button>`; };
  return `<div class="dex-sec">${ttT("舞台擺設（左、右、後面各一個）")}</div><div class="prop-slots" data-act="${act}">${PET_PROP_SLOTS.map(slot).join("")}</div><div class="gift-grid prop-grid">${all.map(p => `<button class="gift-it prop-it${p.ok ? "" : " no"}${o[act] === p.id ? " on" : ""}${p.ok && o[act] !== p.id && Object.values(o).includes(p.id) ? " used" : ""}" data-prop="${p.id}"${p.ok ? "" : " disabled"}>${p.ok ? `<svg class="pg-ic" viewBox="0 0 24 24">${giftSvg(p.svg)}</svg>` : "<b>?</b>"}<span>${escHtml(ttT(p.ok ? p.n : p.how))}</span></button>`).join("")}</div>`;
}
function bindPropsPicker(ov) {
  const box = ov.querySelector(".prop-slots"); if (!box) return;
  const paint = () => {
    const o = petPropsSlots(), act = box.dataset.act, all = petPropsAll();
    box.querySelectorAll(".prop-slot").forEach(b => { const k = b.dataset.slot, p = o[k] && all.find(x => x.id === o[k]); b.classList.toggle("on", k === act); b.querySelector(".ps-ic").innerHTML = p ? `<svg viewBox="0 0 24 24">${giftSvg(p.svg)}</svg>` : ""; });
    ov.querySelectorAll(".prop-it").forEach(x => { const id = x.dataset.prop; x.classList.toggle("on", o[act] === id); x.classList.toggle("used", !x.classList.contains("no") && o[act] !== id && Object.values(o).includes(id)); });
  };
  box.querySelectorAll(".prop-slot").forEach(b => b.addEventListener("click", () => { box.dataset.act = b.dataset.slot; paint(); }));
  ov.querySelectorAll(".prop-it:not(.no)").forEach(b => b.addEventListener("click", () => {
    const o = petPropsSlots(), id = b.dataset.prop, act = box.dataset.act;
    if (o[act] === id) o[act] = null;   // 再點一次：收起來
    else { for (const k in o) if (o[k] === id) o[k] = null; o[act] = id; }   // 同一件只擺一個位置：從別的位置搬過來
    localStorage.setItem("tt_pet_props", JSON.stringify(o)); paint(); petBuzz(10); renderPet();
  }));
}
const PET_TOY_ICON = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="13" rx="5.5" ry="7.5"/><path d="M7 10h10M6.6 13.5h10.8M7.4 17h9.2M12 5V2"/></svg>`;   // 松果（玩）
// 拍照模式（2026-10-07 寵物新一輪 #18）：夥伴＋牠的舞台＋名字、等級、成長里程、同行天數，存成一張 4:5 的圖分享；可以換時段
const PET_PHOTO_TOD = [["dawn", "清晨"], ["day", "白天"], ["dusk", "黃昏"], ["night", "夜晚"]];
const PET_PHOTO_POSE = [["sit", "坐著"], ["happy", "開心"], ["sleep", "睡覺"]];   // 2026-10-08 R4 原16
function petLastTrail() { const r = realRecords().find(x => x && x.trailName); return r ? r.trailName : ""; }
async function drawPetPhoto(tod, pose, trail) {
  const W = 1080, H = 1350, SH = 930, c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
  const F = "'TaipeiSans', 'PingFang TC', sans-serif", km = totalKm(), i = petStageIndex(km), st = petStageInfo(i);
  try { await document.fonts.load(`800 60px TaipeiSans`); } catch (e) { /* 字型讀不到就用系統的 */ }
  const img = src => new Promise((res, rej) => { const m = new Image(); m.onload = () => res(m); m.onerror = rej; m.src = src; });
  const svgUri = t => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(t);
  const sv = PetStage.photoSvgs(i, tod, W, SH);
  x.drawImage(await img(svgUri(sv.back)), 0, 0, W, SH);
  const S = 600; x.save(); x.shadowColor = "rgba(0,0,0,.3)"; x.shadowBlur = 30; x.shadowOffsetY = 14;
  x.drawImage(await img(PET_ART.own(() => PET_ART.dataUri(i, S, petHat(), pose, petAcc()))), (W - S) / 2, SH - S - 70, S, S); x.restore();
  x.drawImage(await img(svgUri(sv.front)), 0, 0, W, SH);
  if (pose === "sleep") { x.fillStyle = "rgba(255,255,255,.85)"; [[250, 40], [196, 54], [132, 70]].forEach(([dy, f], k) => { x.font = `800 ${f}px ${F}`; x.fillText(k === 2 ? "Z" : "z", W / 2 + 120 + k * 46, SH - S - 70 + dy); });   /* 從頭旁邊冒出小 z，越往上越大 */ }   // 睡覺：飄 Z
  if (trail) { x.font = `800 46px ${F}`; const t = trail.length > 16 ? trail.slice(0, 15) + "…" : trail, tw = Math.min(W - 120, x.measureText(t).width + 80);   // 步道名標題（最近走的那一條）
    x.fillStyle = "rgba(20,40,28,.62)"; x.beginPath(); if (x.roundRect) x.roundRect((W - tw) / 2, 56, tw, 84, 42); else x.rect((W - tw) / 2, 56, tw, 84); x.fill();
    x.fillStyle = "#fbf8ee"; x.textAlign = "center"; x.fillText(t, W / 2, 114, W - 160); }
  const g = x.createLinearGradient(0, SH - 60, 0, H); g.addColorStop(0, "rgba(22,44,31,0)"); g.addColorStop(.12, "#1d3a28"); g.addColorStop(1, "#14281c"); x.fillStyle = g; x.fillRect(0, SH - 60, W, H - SH + 60);
  x.textAlign = "center"; x.fillStyle = "#fbf8ee"; x.font = `900 76px ${F}`; x.fillText(petName() || ttT(st.n), W / 2, SH + 70, W - 120);
  x.fillStyle = "#e8c87a"; x.font = `700 40px ${F}`; x.fillText(petName() ? `Lv.${i + 1} · ${ttT(st.n)}` : `Lv.${i + 1}`, W / 2, SH + 130, W - 120);   // 沒取名字：標題已經是種類名，副標只寫等級
  const stats = [[`${km.toFixed(1)} km`, ttT("成長里程")], [`${petDaysTogether()} ${ttT("天")}`, ttT("同行")], [`${affinity()}`, ttT("親密")]];
  { const fills = affFills(affinity()), hx = W / 2 + 320, hy = SH + 318;   // 親密：數字下面五顆小心（部分填色，跟卡片一樣，R7-2）
    const heart = (cx, cy, r) => { x.beginPath(); x.moveTo(cx, cy + r * .9); x.bezierCurveTo(cx - r * 1.6, cy - r * .2, cx - r * .7, cy - r * 1.3, cx, cy - r * .45); x.bezierCurveTo(cx + r * .7, cy - r * 1.3, cx + r * 1.6, cy - r * .2, cx, cy + r * .9); x.closePath(); };
    fills.forEach((f, k) => { const cx = hx + (k - 2) * 34; heart(cx, hy, 13); x.fillStyle = "rgba(251,248,238,.22)"; x.fill(); if (f > 0) { x.save(); heart(cx, hy, 13); x.clip(); x.fillStyle = "#f07a95"; x.fillRect(cx - 22, hy - 22, 44 * f, 44); x.restore(); } }); }
  stats.forEach(([v, l], k) => { const cx = W / 2 + (k - 1) * 320; x.fillStyle = "#fbf8ee"; x.font = `800 54px ${F}`; x.fillText(v, cx, SH + 230, 300); x.fillStyle = "rgba(251,248,238,.65)"; x.font = `500 32px ${F}`; x.fillText(l, cx, SH + 276, 300); });
  x.fillStyle = "rgba(232,200,122,.85)"; x.font = `700 34px ${F}`; x.fillText(ttT("循徑拾光 · Gather the Trail"), W / 2, H - 50);
  return c;
}
function openPetPhoto() {
  if (document.querySelector('[data-ov="petphoto"]') || typeof PetStage === "undefined" || !PetStage.photoSvgs) return;
  let tod = PetStage.tod(), busy = false, pose = "sit", withTrail = false; const lastTrail = petLastTrail();
  const ov = document.createElement("div"); ov.className = "pet-modal"; ov.dataset.ov = "petphoto";
  ov.innerHTML = `<div class="pet-modal-card pp-card"><button class="sheet-close" id="ppClose" aria-label="${ttT("關閉")}">${ic("x")}</button><h2>${ic("camera")} ${ttT("幫夥伴拍張照")}</h2>
    <div class="pp-prev"><img alt="${escHtml(ttT("夥伴照片預覽"))}"></div>
    <div class="pp-tods" role="radiogroup" aria-label="${escHtml(ttT("時段"))}">${PET_PHOTO_TOD.map(([k, l]) => `<button class="pp-tod${k === tod ? " on" : ""}" data-tod="${k}" role="radio" aria-checked="${k === tod}">${ttT(l)}</button>`).join("")}</div>
    <div class="pp-tods pp-poses" role="radiogroup" aria-label="${escHtml(ttT("姿勢"))}">${PET_PHOTO_POSE.map(([k, l]) => `<button class="pp-tod pp-pose${k === "sit" ? " on" : ""}" data-pose="${k}" role="radio" aria-checked="${k === "sit"}">${ttT(l)}</button>`).join("")}</div>
    ${lastTrail ? `<label class="ah-sw pp-trail"><span>${escHtml(ttT("加上最近走的步道"))}</span><input type="checkbox" class="tt-switch" id="ppTrail"></label>` : ""}
    <button class="btn primary" id="ppShare">${ic("share")} ${ttT("存成圖片分享")}</button></div>`;
  document.body.appendChild(ov);
  let _a11y = null; const close = () => { if (_a11y) _a11y(); ov.remove(); };
  if (typeof ttModalA11y === "function") _a11y = ttModalA11y(ov, close, { focus: "#ppClose" });
  ov.addEventListener("click", e => { if (e.target === ov) close(); }); ov.querySelector("#ppClose").addEventListener("click", close);
  const im = ov.querySelector(".pp-prev img");
  const draw = async () => { try { const cv = await drawPetPhoto(tod, pose, withTrail ? lastTrail : ""); im.src = cv.toDataURL("image/jpeg", .85); im.__cv = cv; } catch (e) { toast(ttT("產生圖片失敗")); } };
  ov.querySelectorAll(".pp-pose").forEach(b => b.addEventListener("click", () => { pose = b.dataset.pose; ov.querySelectorAll(".pp-pose").forEach(o => { o.classList.toggle("on", o === b); o.setAttribute("aria-checked", o === b); }); draw(); }));
  { const tr = ov.querySelector("#ppTrail"); if (tr) tr.addEventListener("change", () => { withTrail = tr.checked; draw(); }); }
  ov.querySelectorAll(".pp-tod:not(.pp-pose)").forEach(b => b.addEventListener("click", () => { tod = b.dataset.tod; ov.querySelectorAll(".pp-tod:not(.pp-pose)").forEach(o => { o.classList.toggle("on", o === b); o.setAttribute("aria-checked", o === b); }); draw(); }));
  ov.querySelector("#ppShare").addEventListener("click", async () => {
    if (busy || !im.__cv) return; busy = true;
    try { const blob = await new Promise(r => im.__cv.toBlob(r, "image/png")); const how = await saveBlob(blob, `${ttCJK() ? "循徑拾光-夥伴" : "gather-the-trail-buddy"}.png`, petName() || ttT(PET_STAGES[petStageIndex(totalKm())].n)); if (how === "saved") toast(ttT("已存成圖片")); }
    catch (e) { toast(ttT("產生圖片失敗")); } finally { busy = false; }
  });
  draw();
}
// 供社群同步：寵物名字/等級/成長里程，讓好友看到你的進度
function petStats() {
  const km = totalKm(), i = petStageIndex(km), st = petStageInfo(i);
  return { name: petName() || st.n, level: i + 1, stage: st.n, emoji: st.e, km: +km.toFixed(1) };
}
function petHatch() { let h = localStorage.getItem("tt_pet_hatch"); if (!h) { h = ttClock.date().toISOString(); localStorage.setItem("tt_pet_hatch", h); } return h; }
// 「同行天數」從第一次真的出門健行算（以前從第一次打開夥伴頁算，沒出過門也在累積）
function petDaysTogether() {
  const recs = realRecords(); if (!recs.length) return 0;
  const first = recs.reduce((m, r) => (r.date && r.date < m ? r.date : m), recs[0].date);
  return daysSince(first) + 1;
}
function daysSince(iso) { const t = new Date(iso).getTime(); if (!isFinite(t)) return 0; return Math.max(0, Math.floor((ttClock.now() - t) / 864e5)); }   // 防護：孵化日異常/舊格式 → 回 0（不再顯示 NaN）
function weekIndex(d) { const dt = new Date(d); dt.setHours(0, 0, 0, 0); dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); return Math.round(dt / 6048e5); }
function weeksStreak() {
  const recs = realRecords(); if (!recs.length) return 0;
  const weeks = new Set(recs.map(r => weekIndex(r.date)));
  const now = weekIndex(ttClock.now());
  let w = weeks.has(now) ? now : now - 1, s = 0;
  while (weeks.has(w)) { s++; w--; }
  return s;
}
const PET_MOODS = { sleepy: { e: "", t: "好久沒出門，懶洋洋的", k: "sleepy" }, content: { e: "", t: "狀態不錯，隨時能出發", k: "content" }, happy: { e: "", t: "剛運動完，活力滿滿！", k: "happy" }, longing: { e: "", t: "有點想念山林了…", k: "longing" } };
function petMood() {
  const dm = localStorage.getItem("tt_debug_mood"); if (dm && PET_MOODS[dm]) return PET_MOODS[dm];   // 測試面板指定心情
  const last = realRecords()[0];   // 最新一筆（紀錄為新到舊）
  if (!last) return { e: "", t: "等你帶牠出門走走", k: "sleepy" };
  const d = daysSince(last.date);
  if (d <= 1) return { e: "", t: "剛運動完，活力滿滿！", k: "happy" };
  if (d <= 4) return { e: "", t: "狀態不錯，隨時能出發", k: "content" };
  if (d <= 9) return { e: "", t: "有點想念山林了…", k: "longing" };
  return { e: "", t: "好久沒出門，懶洋洋的", k: "sleepy" };
}
// 心情小裝飾（角色旁）：呼應對話泡，讓角色本體也「有情緒」。O4：改 SVG（不再用 emoji，避免空框）
const PET_FX_SVG = {
  happy: `<svg viewBox="0 0 24 24" fill="#ffe08a" aria-hidden="true"><path d="M12 2l1.8 5.8L20 9.6l-6.2 1.8L12 17l-1.8-5.6L4 9.6l6.2-1.8z"/></svg>`,
  sleepy: `<svg viewBox="0 0 24 24" fill="none" stroke="#cfe0e8" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 8h7l-7 8h7"/></svg>`,
  longing: `<svg viewBox="0 0 24 24" fill="#e7e1cf" aria-hidden="true"><ellipse cx="14" cy="9" rx="8" ry="6"/><circle cx="5" cy="17" r="2.6"/><circle cx="9.5" cy="20.5" r="1.5"/></svg>`,
};
const PET_HEART_SVG = `<svg viewBox="0 0 24 24" fill="#e0556b" aria-hidden="true"><path d="M12 21c-5-3.5-8-7-8-11a4.2 4.2 0 0 1 8-1.2A4.2 4.2 0 0 1 20 10c0 4-3 7.5-8 11z"/></svg>`;
function petMoodFx(k) { return PET_FX_SVG[k] ? `<span class="pet-fx pet-fx-${k}">${PET_FX_SVG[k]}</span>` : ""; }
// 冒出小愛心（點擊/餵食的反應）：從角色位置往上飄（O4：紅愛心用 SVG）
function petBurst(_ignore, n) {
  const em = document.getElementById("petEmoji"); if (!em) return;
  const r = em.getBoundingClientRect(); n = n || 1;
  for (let i = 0; i < n; i++) {
    const s = document.createElement("span");
    s.className = "pet-particle"; s.innerHTML = PET_HEART_SVG;
    s.style.left = (r.left + r.width / 2 + (i - (n - 1) / 2) * 20) + "px";
    s.style.top = (r.top + r.height * 0.32) + "px";
    s.style.animationDelay = (i * 0.07) + "s";
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1200);
  }
}
// 活力：越久沒出門越低，出門健行恢復（約 7 天歸零）
function energy() {
  const last = realRecords()[0]; if (!last) return null;   // 還沒出過門：不顯示假的 25
  return Math.max(0, Math.min(100, Math.round(100 - daysSince(last.date) * 14)));
}
// 連續健行天數
function daysStreak() {
  const recs = realRecords(); if (!recs.length) return 0;
  const days = new Set(recs.map(r => localDay(r.date)));
  const d = ttClock.date(); d.setHours(0, 0, 0, 0);
  const key = () => localDayOf(d);
  if (!days.has(key())) d.setDate(d.getDate() - 1);   // 今天還沒走→從昨天起算
  let s = 0; while (days.has(key())) { s++; d.setDate(d.getDate() - 1); }
  return s;
}
function todayAscent() { const ds = todayStr(); return realRecords().filter(r => localDay(r.date) === ds).reduce((s, r) => s + (r.ascent || 0), 0); }
function todayTrips() { const ds = todayStr(); return realRecords().filter(r => localDay(r.date) === ds).length; }
// 每日任務進度高水位：當天內只增不減（防止任何資料裁切/日期邊界造成進度倒退），過了本地午夜才重置
function questProgress() {
  let hi = null;
  try { hi = JSON.parse(localStorage.getItem("tt_quest_hi")); } catch { /* ignore */ }
  const d = todayStr();
  const cur = { d, km: todayKm(), asc: todayAscent(), trips: todayTrips(), fresh: todayNewTrail(), early: todayEarly() };
  if (hi && hi.d === d) {
    cur.km = Math.max(cur.km, +hi.km || 0);
    cur.asc = Math.max(cur.asc, +hi.asc || 0);
    cur.trips = Math.max(cur.trips, +hi.trips || 0);
    cur.fresh = Math.max(cur.fresh, +hi.fresh || 0);
    cur.early = Math.max(cur.early, +hi.early || 0);
  }
  const j = JSON.stringify(cur);
  if (!hi || JSON.stringify(hi) !== j) { try { localStorage.setItem("tt_quest_hi", j); } catch { /* ignore */ } }   // 有變才寫
  return cur;
}
// 今天走了沒走過的步道？／今天有沒有 9 點前出發？（輪換任務用）
function todayNewTrail() {
  const ds = todayStr(), recs = realRecords();
  const before = new Set(recs.filter(r => localDay(r.date) < ds && r.trailId != null).map(r => String(r.trailId)));
  return recs.some(r => localDay(r.date) === ds && r.trailId != null && !before.has(String(r.trailId))) ? 1 : 0;
}
function todayEarly() { const ds = todayStr(); return realRecords().some(r => localDay(r.date) === ds && new Date(r.date).getHours() < 9) ? 1 : 0; }
// 每日任務：里程／爬升目標跟著夥伴等級長大（後期不再是 1.5 km 就過關）；第三項每天輪換
const QUEST_KM = [1.5, 2, 3, 4, 5, 6, 8], QUEST_ASC = [50, 80, 120, 200, 300, 400, 500];
function renderQuests() {
  const box = $("#petQuests"); if (!box) return;
  const p = questProgress();
  const km = p.km, asc = p.asc, trips = p.trips, streak = daysStreak();
  const lv = petStageIndex(totalKm()), gKm = QUEST_KM[lv], gAsc = QUEST_ASC[lv];
  const doy = Math.floor((ttClock.date() - new Date(ttClock.date().getFullYear(), 0, 0)) / 864e5);
  const rot = [
    { icon: "mountain", label: `${ttT("往上爬")} ${gAsc} m`, cur: asc, goal: gAsc, dec: 0, unit: "m" },
    { icon: "compass", label: ttT("去一條沒走過的步道"), cur: p.fresh, goal: 1, dec: 0, unit: "" },
    { icon: "sun", label: ttT("早上 9 點前出發"), cur: p.early, goal: 1, dec: 0, unit: "" },
  ][doy % 3];
  const quests = [
    { icon: "footprints", label: ttT("今天出門走走"), cur: trips, goal: 1, dec: 0, unit: "" },
    { icon: "ruler", label: `${ttT("今天走")} ${gKm} km`, cur: km, goal: gKm, dec: 1, unit: "km" },
    rot,
  ];
  const allDone = quests.every(q => q.cur >= q.goal);
  const claimed = localStorage.getItem("tt_quest_claim") === todayStr();
  // #7 連續達成獎勵：基礎 +5，連續每多一天 +1（上限 +5），到 3/7/14/30 天再給里程碑大獎
  const reward = questReward(streak);
  const nextMile = QUEST_MILES.find(m => m.day > streak);
  const streakChip = streak >= 2 ? ` <span class="streak-chip">${ic("flame")} ${ttT("連續健行")} ${ttCount(streak, "day")}</span>` : "";
  const btnLabel = claimed ? `${ic("check")} ${ttT("今天的獎勵領過了")}` : (allDone ? `${ttT("領取")} +${reward.total} ${BERRY_SVG}` : `${ttT("三項都完成就能領")} ${BERRY_SVG}`);
  const mileHint = (!claimed && nextMile) ? `<div class="quest-mile">${ic("flame")} ${ttT("下個連續里程碑")}${ttColon()}${ttCount(nextMile.day, "day")} +${nextMile.bonus} ${BERRY_SVG}</div>` : "";
  const fmtQ = q => q.unit ? `${q.dec ? Math.min(q.cur, 999).toFixed(q.dec) : Math.round(q.cur)} / ${q.goal} ${q.unit}` : `${Math.min(q.cur, q.goal)} / ${q.goal}`;
  box.innerHTML = `<div class="section-title">${ic("calendar")}${ttT("每日任務")}${streakChip}</div>
    <div class="quest-list">${quests.map(q => { const done = q.cur >= q.goal, pc = Math.min(100, q.cur / q.goal * 100).toFixed(0); return `<div class="quest ${done ? "done" : ""}"><span class="q-ic">${ic(q.icon)}</span><div class="q-body"><div class="q-l">${q.label}</div><div class="q-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pc}"><i style="width:${pc}%"></i></div></div><span class="q-chk">${done ? ic("check") : fmtQ(q)}</span></div>`; }).join("")}</div>
    <button class="btn ${allDone && !claimed ? "primary" : "ghost"}" id="qClaim"${allDone && !claimed ? "" : " disabled"}>${btnLabel}</button>${mileHint}`;
  const cb = $("#qClaim");
  if (cb && allDone && !claimed) cb.addEventListener("click", () => {
    const r = questReward(daysStreak());
    addBerryBonus(r.total); localStorage.setItem("tt_quest_claim", todayStr()); if (document.getElementById("petFeed")) petFloat(`+${r.total}`, "#petFeed", null, BERRY_SVG);   /* 數值回饋統一：果實也飛進餵食鈕（R9） */ bumpAffinity(5);
    toast(`${ttT(r.mile ? "連續達成獎勵！" : "今天的任務都完成了")} +${r.total} ${ttT("顆果實")}`);
    petBuzz(r.mile ? [120, 60, 120] : 40);
    confetti && confetti(); renderQuests(); renderPet();
  });
  if (typeof Challenge !== "undefined") { try { Challenge.render(); } catch (e) { /* */ } }   // 每月挑戰跟著每日任務一起更新
}
// 每日任務里程碑：連續 N 天達成的一次性大獎
const QUEST_MILES = [{ day: 3, bonus: 5 }, { day: 7, bonus: 15 }, { day: 14, bonus: 25 }, { day: 30, bonus: 50 }];
function questReward(streak) {
  const stBonus = Math.min(Math.max(streak - 1, 0), 5);   // 連續加成，上限 +5
  const m = QUEST_MILES.find(x => x.day === streak);
  const mile = m ? m.bonus : 0;
  return { total: 5 + stBonus + mile, mile, stBonus };
}
function renderPet() {
  const box = $("#petCard");
  if (!box) return;
  petApplyTone();
  const km = totalKm(), i = petStageIndex(km), st = petStageInfo(i), next = PET_STAGES[i + 1];
  const nm = petName(), mood = petMood(), days = petDaysTogether(), streak = weeksStreak(), en = energy();
  const berries = berriesBalance(), h = petHearts(), canFeed = canFeedNow(), cd = feedCooldownMs();
  const art = (typeof PET_ART !== "undefined") ? PET_ART.own(() => PET_ART.svg(i, "", petHat(), true, petAcc())) : `<span style="font-size:70px">${st.e}</span>`;   // 帽子畫在角色裡面，跟著同一個動畫動
  let evoTop, prog = "";
  if (next) {
    const pct = Math.max(2, Math.min(100, Math.round((km - st.km) / (next.km - st.km) * 100)));
    // 下一階不劇透：剪影＋「？？？」（手冊也是這樣）
    const nextArt = (typeof PET_ART !== "undefined") ? `<span class="pet-evo-sil">${PET_ART.svg(i + 1)}</span>` : "";
    evoTop = `<span>${ttT("再走")} <b>${(next.km - km).toFixed(1)}</b> km ${ttT("就進化")}</span><span class="pet-evo-next">${nextArt}<span>${ttUnknown()}</span></span>`;
    prog = `<div class="pet-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>`;
  } else evoTop = `<span>${ic("sparkle")} ${ttT("已經是最終型態了")}</span>`;
  const aff = affinity(), lovePct = aff;   // 進度條照點數（R7-2）
  const need = Math.max(0, 3 - berries);
  const feedLbl = cd > 0 ? `${cd >= 3600e3 ? `${Math.ceil(cd / 3600e3)} ${ttT("小時後可餵")}` : `${Math.ceil(cd / 6e4)} ${ttT("分鐘後可餵")}`}`
    : need > 0 ? `${ttT("還差")} ${need} ${ttT("顆果實")}` : `${ttT("餵食")}`;
  // 2.5D 舞台（pet-stage.js）：角色那一層包在分層場景裡；沒載到就退回舊的平面棲地
  // 2026-10-04：舞台、角色沒變（同一階、同一頂帽子、同一個名字、天氣與裝飾一樣）就只更新數字和文字——
  // 以前餵完、摸完都整張重畫：粒子位置重抽、待機動作重來、對話泡重彈，看起來像頁面刷新了一次
  const sig = [i, petHat(), petAcc(), petTone(), nm, (typeof Premium !== "undefined" && Premium.isOn()) ? 1 : 0, typeof PetStage !== "undefined" ? PetStage.cachedWx() + (PetStage.cachedFeel ? PetStage.cachedFeel() : "") : "", typeof PetJourney !== "undefined" ? PetJourney.decor().join(",") : "", document.documentElement.lang || "", JSON.stringify(window.__ps || null), typeof PetStage !== "undefined" ? PetStage.tod() + PetStage.season() : "", petFestival() || "", petPropsOn().join(",")].join("|");   // __ps＝測試面板強制的時段／季節／天氣；時段、季節換了也要重畫（星星、螢火蟲、天空是畫出來的，2026-10-08）
  if (box.dataset.sig === sig && box.querySelector("#petEmoji")) {
    petCardUpdate(box, { km, mood, days, streak, en, h, left: next ? next.km - km : null, lovePct: affinity(), aff: affinity(), canFeed, cd, berries, evoTop, pct: next ? Math.max(2, Math.min(100, Math.round((km - st.km) / (next.km - st.km) * 100))) : null });
    if (typeof PetJourney !== "undefined") PetJourney.render();
    petCompanion(box, i, true);
    if (typeof PetStage !== "undefined" && PetStage.sync) PetStage.sync();   // 跨過 22:00／06:00：睡／醒不必整張重畫
    return;
  }
  box.dataset.sig = sig;
  const actorHtml = `
      <div class="pet-bubble">${ttT(mood.t)}</div><div class="sr-only" id="petLive" role="status" aria-live="polite"></div>
      <div id="petEmoji" class="pet-m-${mood.k || "content"}" role="button" tabindex="0" aria-label="${ttT("摸摸")} ${escHtml(nm || ttT(st.n))}">${typeof PET_ART !== "undefined" && PET_ART.prop ? PET_ART.prop(i) : ""}${art}${petMoodFx(mood.k)}</div>
      <div class="pet-shadow"></div>`;
  const stageHtml = (typeof PetStage !== "undefined")
    ? PetStage.html(i, actorHtml, { evo: next ? petEvoLv(Math.round((km - st.km) / (next.km - st.km) * 100)) : 0, wx: PetStage.cachedWx(), feel: PetStage.cachedFeel ? PetStage.cachedFeel() : "", decor: typeof PetJourney !== "undefined" ? PetJourney.decor() : [], fest: petFestival(), props: petPropsSvgs() })
    : `<div class="pet-habitat">${(typeof PET_ART !== "undefined" && PET_ART.habitat) ? PET_ART.habitat(i) : ""}</div>${actorHtml}`;
  box.innerHTML = `<div class="pet-card${i >= 6 ? " final" : ""}" style="--habitat:${PET_BG[i]}">
    ${stageHtml}
    <div class="pet-stage">
      <div class="pet-idline"><span class="pet-name">${escHtml(nm || ttT(st.n))}</span><span class="lv-chip lvt-${Math.min(i + 1, 7)} pet-lv-chip">Lv.${i + 1}</span></div>
      <div class="pet-evo"><div class="pet-evo-top">${evoTop}</div>${prog}</div>
    </div>
    <div class="pet-meters">
      <div class="pet-meter${en == null ? " no-en" : ""}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${en == null ? 0 : en}" aria-label="${ttT("活力")}"><span>${ttT("活力")} <b>${en == null ? "—" : en}</b></span><div class="mtrack"><i class="m-en" style="width:${en == null ? 0 : en}%"></i></div><em class="m-hint">${ttT("走一趟就有")}</em></div>
      <div class="pet-meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${lovePct}" aria-label="${ttT("親密")}" aria-valuetext="${escHtml(affNextLine(aff))}"><span>${ttT("親密")} ${affHeartsHtml(aff)}<b>${aff}</b></span><div class="mtrack"><i class="m-love" style="width:${lovePct}%"></i></div></div>
      <button class="pet-help" id="petHelp" aria-label="${ttT("活力和親密是什麼？")}">?</button>
    </div>
    <div class="pet-chips">
      <div class="pet-chip${km < .05 ? " zero" : ""}"><div class="cv">${km.toFixed(1)}<small> km</small></div><div class="cl">${ttT("成長里程")}</div></div>
      <div class="pet-chip${days ? "" : " zero"}"><div class="cv">${days}<small> ${ttT("天")}</small></div><div class="cl">${ttT("同行")}</div></div>
      <div class="pet-chip${streak ? "" : " zero"}"><div class="cv">${streak}<small> ${ttT("週")}</small></div><div class="cl">${ttT("週週有走")}</div></div>
    </div>
    <div class="pet-acts pet-acts-main">
      <button class="pet-btn feed" id="petFeed"${canFeed ? "" : " disabled"}><b class="fb-ic">${BERRY_SVG}<i class="fb-ring"></i></b><span>${feedLbl}</span>${need > 0 || cd > 0 ? "" : `<b class="feed-bal">${berries}</b>`}</button>
      <button class="pet-btn pet-sq" id="petPlay">${PET_TOY_ICON}<span>${ttT("玩")}</span></button>
      <button class="pet-btn pet-sq" id="petPhoto">${ic("camera")}<span>${ttT("拍照")}</span></button>
      <button class="pet-btn pet-sq" id="petDress">${ic("sparkle")}<span>${ttT("裝扮")}</span></button>
    </div>
    <div class="pet-more"><button class="pet-link" id="petDex">${ic("book")}${ttT("手冊")}</button><button class="pet-link" id="petRec">${ic("compass")}${ttT("去走")}</button>${(typeof Premium !== "undefined" && Premium.isOn()) ? `<button class="pet-link" id="petRename">${ic("pencil")}${ttT("改名")}</button>` : ""}</div>
  </div>`;
  if (typeof PetStage !== "undefined") {
    PetStage.bind(box.querySelector(".ps-box"), mood.k);
    petCompanion(box, i);
    const had = PetStage.cachedWx() + PetStage.cachedFeel();
    PetStage.weather().then(w => { if (w + PetStage.cachedFeel() !== had && document.body.dataset.view === "pet" && box.isConnected) renderPet(); if (typeof window.syncMyStatsToCloud === "function") window.syncMyStatsToCloud(); });   // 好友看到的天氣、配件跟著更新   // 天氣回來了才補畫（之後走快取，不會一直重畫）
  }
  if (typeof PetJourney !== "undefined") PetJourney.render();   // 夥伴的旅行（PRO：明信片／走過的縣市／地區配件）
  { const card = box.querySelector(".pet-card"), fb0 = $("#petFeed"); if (card) card.classList.toggle("evo-near", !!next && next.km - km < 1); if (fb0) { fb0.classList.toggle("cd", cd > 0); fb0.style.setProperty("--cdp", cd > 0 ? (1 - cd / FEED_COOLDOWN).toFixed(3) : "1"); } }
  clearInterval(window.__petCdT); if (cd > 0) window.__petCdT = setInterval(() => { if (document.body.dataset.view === "pet" && !document.hidden) renderPet(); }, 60000);   // 冷卻倒數：每分鐘更新一次環和文字
  { const ev = box.querySelector(".pet-evo"); if (ev && next) ev.addEventListener("click", e => { if (!e.target.closest(".pet-evo-next")) return; const l = Math.max(0, PET_STAGES[petStageIndex(totalKm()) + 1] ? PET_STAGES[petStageIndex(totalKm()) + 1].km - totalKm() : 0); petSay(`${ttT("再走")} ${l.toFixed(1)} km ${ttT("就進化")}？`); }); }   // 點「？？？」：泡泡提示還差多少
  const em = $("#petEmoji");
  // 點頭＝摸摸頭（瞇眼）、點身體＝搔癢（扭一扭）、長按＝抱抱（壓扁回彈＋三顆心，每天第一次抱親密 +2）
  const S = typeof PetStage !== "undefined";
  // 餵食中不能摸、不能抱（2026-10-07 使用者）：點了只在泡泡說一句（最多每 3 秒一次），不打斷吃東西的動作
  let busyT = 0;
  const eating = () => { if (!(S && PetStage.isFeeding && (PetStage.isFeeding() || (PetStage.isPlaying && PetStage.isPlaying())))) return false; if (Date.now() - busyT > 3000) { busyT = Date.now(); petSay(ttT("在吃東西，等我一下～"), 1800); } return true; };
  // 睡著時（深夜，2026-10-07 寵物新一輪 #4）：點、抱都先叫醒——揉眼、伸懶腰、說一句，這一下不算摸頭
  const WAKE = ["嗯…？你回來了", "（揉眼睛）天亮了嗎？", "呼啊～被你叫醒了", "剛剛夢到在山頂看日出"];
  const rmFb = () => { if (!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) || !em) return; em.classList.add("rm-fb"); clearTimeout(em.__rmT); em.__rmT = setTimeout(() => em.classList.remove("rm-fb"), 700); };   // 減少動態：亮一下代替動作（#24）
  const woke = () => { if (!(S && PetStage.isAsleep && PetStage.isAsleep())) return false; PetStage.wake(); petBuzz(10); petSay(ttT(WAKE[Math.floor(Math.random() * WAKE.length)])); return true; };
  const poke = (zone) => {
    if (eating() || woke()) return;
    if (S) PetStage.react(zone); else { em.classList.remove("tap"); void em.offsetWidth; em.classList.add("tap"); }
    rmFb();
    petBuzz(20);
    petBurst("❤️", 1);
    petSay(petTapLine(petMood().k));   // 現在的心情（在泡泡裡說；以前是畫面底部的提示框）
    if (petPatAff()) petFloat(`${ttT("親密")} +1`, ".pet-card .pet-meter:nth-child(2) .aff-hearts", null, PET_HEART_SVG);   // 摸頭也算一點親密（每天 3 次，寵物新一輪 #8）
  };
  const hug = () => {
    if (eating() || woke()) return;
    const first = localStorage.getItem("tt_pet_hug_day") !== todayStr();
    if (S) PetStage.react(first ? "hug" : "pat");   // 今天已經抱過：蹭一下就好
    rmFb();
    petBuzz(first ? [20, 40, 20] : 20);
    petBurst("❤️", first ? 3 : 1);
    if (first) {
      localStorage.setItem("tt_pet_hug_day", todayStr()); bumpAffinity(2); petDiaryAdd("hug1");
      petSay(ttT("抱抱！今天的親密增加了")); petFloat(`${ttT("親密")} +2`, ".pet-card .pet-meter:nth-child(2) .aff-hearts", null, PET_HEART_SVG);
    } else petSay(`${ttT("抱抱！")} ${ttT("今天已經抱過囉")}`);
  };
  if (em) {
    let pressT = 0, hugged = false;
    // 來回摸（2026-10-07 寵物新一輪 #11）：按著在牠身上左右來回滑 3 次＝摸摸（瞇眼扭一扭，也算一次摸頭的親密）；一動起來就不是長按抱抱
    let rub = null;
    em.addEventListener("pointerdown", e => { hugged = false; clearTimeout(pressT); pressT = setTimeout(() => { hugged = true; hug(); }, 550); rub = { x: e.clientX, x0: e.clientX, dir: 0, n: 0, t: Date.now() }; });
    em.addEventListener("pointermove", e => {
      if (!rub || !e.buttons && e.pointerType === "mouse") return;
      if (Math.abs(e.clientX - rub.x0) > 10) clearTimeout(pressT);
      const d = Math.sign(e.clientX - rub.x); if (Math.abs(e.clientX - rub.x) < 6) return;
      if (d && d !== rub.dir) { if (rub.dir) rub.n++; rub.dir = d; } rub.x = e.clientX;
      if (rub.n >= 3 && Date.now() - rub.t < 2000) { rub = null; hugged = true;   /* 放開時的 click 不再當成點一下 */
        if (eating() || woke()) return; if (S) PetStage.react("rub"); rmFb(); petBuzz([10, 30, 10]); petBurst("❤️", 2); petSay(ttT(["好舒服～", "再摸一下嘛", "呼嚕呼嚕…"][Math.floor(Math.random() * 3)]));
        if (petPatAff()) petFloat(`${ttT("親密")} +1`, ".pet-card .pet-meter:nth-child(2) .aff-hearts", null, PET_HEART_SVG); }
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(t => em.addEventListener(t, () => { clearTimeout(pressT); rub = null; }));
    em.closest(".ps-box") && em.closest(".ps-box").addEventListener("pet-shaken", () => petSay(ttT(["哇～頭好暈", "別搖啦～", "地震了嗎？！"][Math.floor(Math.random() * 3)])));
    em.addEventListener("contextmenu", e => e.preventDefault());   // 長按不要跳出系統選單
    let lastTap = 0;
    em.addEventListener("click", e => {
      if (hugged) { hugged = false; return; }
      const now = Date.now(), dbl = now - lastTap < 350; lastTap = dbl ? 0 : now;
      if (dbl && S && PetStage.trick && petTrickKnown() && !eating() && !woke()) { PetStage.trick(); petSay(ttT(PET_TRICKS[petStageIndex(totalKm())])); petBuzz([10, 30, 10]); return; }   // 點兩下＝表演學會的把戲（R13）
      poke(S ? PetStage.zoneOf(e.clientY) : "pat");
    });
    em.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); poke("pat"); } });
  }
  $("#petDex").addEventListener("click", openPetDex);
  $("#petRec").addEventListener("click", petRecommend);
  $("#petFeed").addEventListener("click", feedPet);
  $("#petHelp").addEventListener("click", () => {
    // 2026-10-07 寵物新一輪 #8：親密的每一種來源列出來，旁邊是今天的進度（參考寶可夢 GO 夥伴：每種有上限、一看就知道還能做什麼）
    setTimeout(() => {   // 對話框開好之後才綁開關（#23）
      const so = document.getElementById("petSoundSw"), hp = document.getElementById("petHapticSw");
      if (so) so.addEventListener("change", () => { localStorage.setItem("tt_pet_sound", so.checked ? "1" : "0"); if (so.checked) petSound("hug"); });
      if (hp) hp.addEventListener("change", () => { localStorage.setItem("tt_pet_haptic", hp.checked ? "1" : "0"); if (hp.checked) petBuzz(20); });
      const s1 = document.getElementById("petSleepA"), s2 = document.getElementById("petSleepB"), nu = document.getElementById("petNudgeSel");
      const saveSleep = () => { localStorage.setItem("tt_pet_sleep", s1.value === "off" ? "off" : `${s1.value}-${s2.value}`); s2.disabled = s1.value === "off"; if (typeof PetStage !== "undefined" && PetStage.sync) PetStage.sync(); };
      if (s1 && s2) { s1.addEventListener("change", saveSleep); s2.addEventListener("change", saveSleep); }
      if (nu) nu.addEventListener("change", () => { localStorage.setItem("tt_pet_nudge", nu.value); if (typeof Reminders !== "undefined" && Reminders.refreshPet) Reminders.refreshPet(); });
      const mo = document.getElementById("petMotionSw");   // iPhone：要使用者按下去那一刻才能請「動作與方向」權限
      if (mo) mo.addEventListener("change", () => { if (!mo.checked) { localStorage.setItem("tt_pet_motion", "0"); return; }
        DeviceMotionEvent.requestPermission().then(r => { const g = r === "granted"; mo.checked = g; localStorage.setItem("tt_pet_motion", g ? "1" : "0"); if (!g) toast(ttT("需允許「動作與方向」權限")); }).catch(() => { mo.checked = false; toast(ttT("需允許「動作與方向」權限")); }); });
    }, 0);
    const rows = petAffRows().map(([a, b, c]) => `<tr><td>${escHtml(ttT(a))}</td><td class="ah-v">${b}</td><td class="ah-t">${escHtml(c)}</td></tr>`).join("");
    if (typeof ttChoice === "function") ttChoice({ html: `<div class="aff-help"><h3 class="ah-title">${escHtml(ttT("活力和親密是什麼？"))}</h3><p class="ah-c">${escHtml(ttT("活力：出門走路就會補滿，太久沒出門會慢慢掉。"))}</p><p class="ah-h"><b>${escHtml(ttT("親密怎麼增加"))}</b></p><div class="ah-now"><div class="ah-hearts">${affHeartsHtml(affinity())}</div><div>${escHtml(affNextLine(affinity()))}</div></div><table>${rows}</table>
      <p class="ah-c">${escHtml(ttT("親密滿 5 顆心：餵食給的成長更多，牠也會自己出門帶小東西回來。"))}</p><p class="ah-n ah-c">${escHtml(ttT("兩個都不會讓夥伴退化，放心。"))}</p>
      ${petCan.sound() ? `<label class="ah-sw"><span>${escHtml(ttT("夥伴音效（吃東西、抱抱、進化）"))}</span><input type="checkbox" class="tt-switch" id="petSoundSw"${petSoundOn() ? " checked" : ""}></label>` : ""}
      ${petCan.haptic() ? `<label class="ah-sw"><span>${escHtml(ttT("夥伴震動"))}</span><input type="checkbox" class="tt-switch" id="petHapticSw"${petHapticOn() ? " checked" : ""}></label>` : ""}
      <label class="ah-sw"><span>${escHtml(ttT("夥伴睡覺時間"))}</span><span class="ah-sel">${petSleepSel()}</span></label>
      <label class="ah-sw"><span>${escHtml(ttT("夥伴想你的提醒"))}</span><select id="petNudgeSel" class="ah-select">${[["3", ttT("{n} 天沒出門").replace("{n}", 3)], ["7", ttT("{n} 天沒出門").replace("{n}", 7)], ["0", ttT("不要提醒")]].map(([v, t]) => `<option value="${v}"${petNudgeDays() === +v ? " selected" : ""}>${escHtml(t)}</option>`).join("")}</select></label>
      ${petCan.motionAsk() ? `<label class="ah-sw"><span>${escHtml(ttT("搖一搖手機，牠會頭暈"))}</span><input type="checkbox" class="tt-switch" id="petMotionSw"${localStorage.getItem("tt_pet_motion") === "1" ? " checked" : ""}></label>` : ""}</div>` }, [{ label: ttT("知道了"), value: true, cls: "primary" }]);
  });
  { const dr = $("#petDress"); if (dr) dr.addEventListener("click", openHatPicker); }
  { const ph = $("#petPhoto"); if (ph) ph.addEventListener("click", openPetPhoto); }
  { const pl = $("#petPlay"); if (pl) pl.addEventListener("click", () => petPlayAt(null));   // 丟松果（#12）：每隻用自己的方式玩
    // 點舞台的空地：松果丟到那裡（2026-10-08 R4 原6；點到角色、按鈕、擺設不算）
    const stg = box.querySelector(".ps-box"); if (stg) stg.addEventListener("click", e => {
      if (e.target.closest("#petEmoji, button, a, select, .ps-props, .ps-guest, .pet-bubble, .ps-berry")) return;
      const r = stg.getBoundingClientRect(); petPlayAt(e.clientX - (r.left + r.width / 2));
    }); }
  const ren = $("#petRename");   // Premium：為夥伴命名
  if (ren) ren.addEventListener("click", () => {
    askInput({ title: ttT("幫你的山林夥伴取個名字"), value: petName() || ttT(st.n), max: 12 }).then(v => {
      if (v == null) return;
      if (!ttCleanOk(v)) return;   // 夥伴名字會出現在個人檔案、拜訪卡、分享圖：一樣擋不當字詞
      localStorage.setItem("tt_pet_name", v.trim().slice(0, 12)); renderPet();
    });
  });
}


// 只更新會變的數字和文字（舞台、角色、粒子都不動）：數字往上跳、進度條和親密條平滑變長、文字有變才淡入淡出
function petCountUp(el, to, digits) {
  if (!el) return;
  const from = parseFloat(el.textContent) || 0;
  if (Math.abs(from - to) < 1e-9) return;
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { el.textContent = to.toFixed(digits); return; }
  const t0 = performance.now(), D = 900;
  const step = t => { const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3); el.textContent = (from + (to - from) * e).toFixed(digits); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
  el.closest(".pet-chip, .pet-meter")?.classList.add("bump"); setTimeout(() => el.closest(".pet-chip, .pet-meter")?.classList.remove("bump"), 700);
}
// 夥伴說的話、飄起來的數字（2026-10-07：寵物頁的回饋都在卡片裡——以前用畫面底部的提示框，在 iPhone 上會偏到右下、還壓在卡片下緣）
let _sayT = 0;
function petSay(text, ms) {
  const b = document.querySelector(".pet-card .pet-bubble"); if (!b) return;
  clearTimeout(_sayT); b.classList.add("say"); petSwapText(b, escHtml(text));
  // 讀屏（2026-10-08 修正案 原31）：只播「操作的結果」（petSay＝餵、抱、摸、禮物、好友果實、被擋下來的原因），不播待機動作和心情句子；
  // 先清空再寫，同一句話連說兩次也會再播
  const live = document.getElementById("petLive"); if (live) { live.textContent = ""; setTimeout(() => { live.textContent = String(text); }, 60); }
  _sayT = setTimeout(() => { b.classList.remove("say"); const w = window.__petLine; petSwapText(b, w && w.until > Date.now() ? escHtml(w.t) : ttT(petMood().t)); }, ms || 2600);   // 說完回到剛剛那句（健行感想／不在時做了什麼）
}
// 從角色飛到某個條（成長進度條、親密條）：帶果實／愛心的膠囊走一道弧線，飛到條「現在的末端」；
// 到了那一格炸開一圈光、條和數字才開始跳（onArrive 在那一格更新卡片——2026-10-07 使用者：「飛進去進度條裡面，數字和進度條再跳動，無縫連接」）
function petFloat(text, toSel, onArrive, icon) {
  const em = document.getElementById("petEmoji"), to = document.querySelector(toSel); if (!em || !to) { if (onArrive) onArrive(); return; }
  const a = em.getBoundingClientRect(), z = to.getBoundingClientRect(), fill = to.querySelector("i"), fz = fill ? fill.getBoundingClientRect() : null;
  const x0 = a.left + a.width / 2, y0 = a.top + a.height * .32, x1 = fz && fz.width ? fz.right : z.left + z.width / 2, y1 = z.top + z.height / 2;
  const f = document.createElement("span"); f.className = "pet-float"; f.innerHTML = (icon || "") + `<b>${escHtml(text)}</b>`; document.body.appendChild(f);
  f.style.left = x0 + "px"; f.style.top = y0 + "px";
  const reduceM = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const land = () => {
    f.remove();
    if (!reduceM) { const r = document.createElement("span"); r.className = "pet-ring"; r.style.left = x1 + "px"; r.style.top = y1 + "px"; document.body.appendChild(r); setTimeout(() => r.remove(), 700); }
    to.classList.remove("pet-hit"); void to.offsetWidth; to.classList.add("pet-hit");
    if (onArrive) onArrive();
  };
  if (reduceM) { setTimeout(land, 500); return; }
  // 弧線：先往上彈出來、停一下讓人看清楚，再沿著往上拱的弧線飛下去（取樣 6 點的二次貝茲）
  const cx = (x0 + x1) / 2 + (x1 - x0) * .15, cy = Math.min(y0, y1) - 46, kf = [{ transform: "translate(-50%, -50%) scale(.6)", opacity: 0, offset: 0 }, { transform: "translate(-50%, -150%) scale(1.12)", opacity: 1, offset: .16 }, { transform: "translate(-50%, -150%) scale(1)", opacity: 1, offset: .32 }];
  for (let k = 1; k <= 6; k++) { const t = k / 6, u = 1 - t, X = u * u * x0 + 2 * u * t * cx + t * t * x1, Y = u * u * (y0 - 20) + 2 * u * t * cy + t * t * y1;
    kf.push({ transform: `translate(calc(-50% + ${(X - x0).toFixed(1)}px), calc(-50% + ${(Y - y0).toFixed(1)}px)) scale(${(1 - .85 * Math.pow(t, 1.6)).toFixed(3)})`, opacity: k === 6 ? 0 : k === 5 ? .75 : 1, offset: +(.32 + .68 * t).toFixed(3) }); }   // 越接近條縮得越快，最後被吸進去（2026-10-07 使用者）
  f.animate(kf, { duration: 1250, easing: "cubic-bezier(.45,.05,.55,.95)" }).onfinish = land;
}
function petSwapText(el, html) {
  if (!el || el.innerHTML === html) return;
  el.classList.add("swap"); clearTimeout(el.__swT);   // 新的換字取消還沒換完的那次（以前兩次連著換，後到的舊字會蓋掉新字）
  el.__swT = setTimeout(() => { el.innerHTML = html; el.classList.remove("swap"); }, 170);
}
function petCardUpdate(box, v) {
  const em = box.querySelector("#petEmoji");
  // 心情：對話泡、角色的心情 class、旁邊的小裝飾
  { const bb = box.querySelector(".pet-bubble"); if (bb && !bb.classList.contains("say")) petSwapText(bb, ttT(v.mood.t)); }   // 正在說話（餵食、抱抱的回饋）時不蓋掉
  const k = v.mood.k || "content";
  if (!em.classList.contains("pet-m-" + k)) {
    em.className = em.className.replace(/\bpet-m-\S+/g, "").trim() + " pet-m-" + k;
    const fx = em.querySelector(".pet-fx"); if (fx) fx.remove();
    em.insertAdjacentHTML("beforeend", petMoodFx(k));
    if (typeof PetStage !== "undefined" && PetStage.setMood) PetStage.setMood(k);
  }
  // 進化進度
  petSwapText(box.querySelector(".pet-evo-top"), v.evoTop);
  const tr = box.querySelector(".pet-track"); if (tr && v.pct != null) { tr.querySelector("i").style.width = v.pct + "%"; tr.setAttribute("aria-valuenow", v.pct); }
  { const card = box.querySelector(".pet-card"); if (card) card.classList.toggle("evo-near", v.left != null && v.left < 1); }   // 差不到 1 km 就進化：進度條呼吸發光、剪影輕晃
  const psb = box.querySelector(".ps-box"); if (psb) { const ev = petEvoLv(v.pct); if (ev) psb.dataset.evo = ev; else delete psb.dataset.evo; }   // 餵完長大：蛋上的裂縫當場多一道
  // 活力、親密
  const ms = box.querySelectorAll(".pet-meter");
  if (ms[0]) { ms[0].classList.toggle("no-en", v.en == null); ms[0].setAttribute("aria-valuenow", v.en == null ? 0 : v.en); ms[0].querySelector("b").textContent = v.en == null ? "—" : v.en; ms[0].querySelector(".m-en").style.width = (v.en == null ? 0 : v.en) + "%"; }
  if (ms[1]) { const b = ms[1].querySelector("b"), was = b.textContent; b.textContent = `${v.aff}`; const hs = ms[1].querySelector(".aff-hearts"); if (hs) hs.outerHTML = affHeartsHtml(v.aff); ms[1].setAttribute("aria-valuenow", v.lovePct); ms[1].setAttribute("aria-valuetext", affNextLine(v.aff)); ms[1].querySelector(".m-love").style.width = v.lovePct + "%"; if (was !== b.textContent) { ms[1].classList.add("bump"); setTimeout(() => ms[1].classList.remove("bump"), 700); } }
  // 成長里程（往上跳）、同行天數、週週有走
  const cv = box.querySelectorAll(".pet-chip .cv");
  if (cv[0]) { const n = cv[0].firstChild; if (n && n.nodeType === 3) { const sp = document.createElement("span"); sp.textContent = n.textContent; cv[0].replaceChild(sp, n); } petCountUp(cv[0].firstChild, v.km, 1); }
  if (cv[1]) cv[1].firstChild.textContent = v.days;
  if (cv[2]) cv[2].firstChild.textContent = v.streak;
  [v.km < .05, !v.days, !v.streak].forEach((z, k) => { if (cv[k]) cv[k].parentNode.classList.toggle("zero", z); });   // 0 的數字淡一點（新夥伴不要一排醒目的 0）
  // 餵食鈕：能不能餵、文字（冷卻幾小時）、果實數
  const fb = box.querySelector("#petFeed");
  if (fb) {
    const need = Math.max(0, 3 - v.berries);
    const lbl = v.cd > 0 ? `${v.cd >= 3600e3 ? `${Math.ceil(v.cd / 3600e3)} ${ttT("小時後可餵")}` : `${Math.ceil(v.cd / 6e4)} ${ttT("分鐘後可餵")}`}` : need > 0 ? `${ttT("還差")} ${need} ${ttT("顆果實")}` : `${ttT("餵食")}`;
    fb.disabled = !v.canFeed;
    fb.classList.toggle("cd", v.cd > 0); fb.style.setProperty("--cdp", v.cd > 0 ? (1 - v.cd / FEED_COOLDOWN).toFixed(3) : "1");   // 冷卻：果實外一圈環狀倒數
    petSwapText(fb.querySelector("span"), lbl);
    let bal = fb.querySelector(".feed-bal");
    if (need > 0 || v.cd > 0) { if (bal) bal.remove(); }
    else { if (!bal) { bal = document.createElement("b"); bal.className = "feed-bal"; fb.appendChild(bal); } bal.textContent = v.berries; }
  }
}

// 夥伴推薦：依心情挑（太久沒出門→先來條輕鬆的；有偏好的主題→就走那個；
// 都沒有→挑你最少走的主題，同一天按幾次都是同一個主題），再直接幫你翻到一條
const PET_THEMES = ["瀑布", "古道", "海景", "森林", "湖泊"];
function petRecommend() {
  const mood = petMood().k;
  let filters, say;
  if (mood === "sleepy" || mood === "longing") { filters = ["d1"]; say = ttT("好久沒出門了，先來條輕鬆的"); }
  else {
    let tag = typeof favoriteTag === "function" ? favoriteTag() : null;
    if (!tag) {
      const walked = new Set(realRecords().map(r => String(r.trailId)));
      const cnt = {}; PET_THEMES.forEach(g => cnt[g] = 0);
      if (typeof tagsOf === "function") TRAILS.forEach(t => { if (walked.has(String(t.id))) tagsOf(t).forEach(g => { if (g in cnt) cnt[g]++; }); });
      const least = Math.min(...PET_THEMES.map(g => cnt[g]));
      const cands = PET_THEMES.filter(g => cnt[g] === least);
      const d = ttClock.date(); tag = cands[(d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate()) % cands.length];
    }
    filters = ["tag:" + tag]; say = `${ttT("夥伴想去走")}${ttSp()}${ttQuote(ttT(tag))}`;
  }
  document.querySelector('.tab[data-view="explore"]').click();
  // 走探索頁的統一入口：連地圖範圍、附近、搜尋字一起重設（直接改變數會讓篩選狀態對不起來）
  if (typeof setExploreState === "function") setExploreState({ filters }, { clearQuery: true, clearScope: true });
  toast(say, { top: true });   // 放上面：放底下會蓋住接著打開的步道詳情數據格
  const t = petPickTrail();
  if (t) setTimeout(() => openDetail(t.id), 450);
}
// 「去走」挑一條：從剛套好的篩選結果裡，優先挑還沒走過、難度跟平常走的差不多的
// （以前借用探索頁骰子的 pickForMe；骰子拿掉後搬到這裡）
function petPickTrail() {
  const pool = (typeof curList !== "undefined" && curList && curList.length) ? curList : TRAILS;
  if (!pool.length) return null;
  const walked = new Set(Store.getRecords().map(r => String(r.trailId)).filter(Boolean));
  const diffs = TRAILS.filter(t => walked.has(String(t.id))).map(t => t.difficulty || 0).sort((a, b) => a - b);
  const usual = diffs.length ? diffs[Math.floor(diffs.length / 2)] : null;
  const fresh = pool.filter(t => !walked.has(String(t.id)) && !logC(t.id).done && !isClosed(t));
  const fit = usual == null ? fresh : fresh.filter(t => Math.abs((t.difficulty || 0) - usual) <= 1);
  const pick = fit.length ? fit : fresh.length ? fresh : pool;
  return pick[Math.floor(Math.random() * pick.length)];
}
// 成就（徽章資料、解鎖、成就步道全螢幕頁、分享圖卡）已拆到 js/achievements.js，緊接在 pet.js 之後載入
// 夥伴手冊：進化圖鑑 + 成就徽章
// 夥伴日記（2026-10-07 收尾輪）：自動記牠的大事；相遇（孵化日）和第一次一起出門從現有資料推，不另外存
// 測試資料開著（測試面板加的里程、強制心情／時段／季節配件、測試行程）時寫的日記標 dbg：不顯示、「清 debug」一起刪（2026-10-07 使用者：日記會記到 debug 的數據）
function petDebugOn() { if (localStorage.getItem("tt_test_diary")) return false;   /* 自動測試：用測試里程切階段，但要照常寫日記 */
  return debugKm() > 0 || !!localStorage.getItem("tt_debug_mood") || !!window.__ps || !!window.__hatSeasonAll || !!window.__petDbg || !!window.__petPropsAll || (Store.getRecords ? Store.getRecords().some(r => r.dbg) : false); }
function petDiaryAdd(k, i) {
  try { const d = JSON.parse(localStorage.getItem("tt_pet_diary") || "[]"), dbg = petDebugOn(); if (k !== "evo" && d.some(x => x.k === k && !!x.dbg === dbg)) return; d.push(Object.assign({ t: ttClock.date().toISOString(), k, i: i == null ? petStageIndex(totalKm()) : i }, dbg ? { dbg: 1 } : {})); localStorage.setItem("tt_pet_diary", JSON.stringify(d.slice(-60))); } catch (e) { /* 壞掉的資料就不記 */ }
}
function petDiaryHtml(ym) {   // ym："2026-10"＝只看那個月（2026-10-08 R4 原22）；不帶＝全部
  let d = []; try { d = JSON.parse(localStorage.getItem("tt_pet_diary") || "[]"); } catch (e) { /* */ }
  d = d.filter(x => !x.dbg);   // 測試資料寫的不顯示
  const recs = realRecords().filter(r => !r.dbg), first = recs.length ? recs[recs.length - 1] : null;
  const all = d.slice(); all.push({ t: petHatch(), k: "meet", i: 0 }); if (first) all.push({ t: first.date, k: "hike1", i: null });
  all.sort((a, b) => String(b.t).localeCompare(String(a.t)));
  if (ym) { const keep = all.filter(x => localYM(x.t) === ym); all.length = 0; all.push(...keep); }
  const txt = x => x.k === "meet" ? ttT("我們相遇了") : x.k === "evo" ? `${ttT("進化成")} ${ttT(PET_STAGES[x.i] ? petStageInfo(x.i).n : "")}` : x.k === "feed1" ? ttT("第一次吃果實") : x.k === "hug1" ? ttT("第一次抱抱") : x.k === "hike1" ? ttT("第一次一起出門") : /^ann:y/.test(x.k) ? ttT("相遇 {n} 週年").replace("{n}", x.k.slice(5)) : /^ann:d/.test(x.k) ? ttT("相遇第 {n} 天").replace("{n}", x.k.slice(5)) : /^gift:/.test(x.k) && PET_GIFTS[x.k.slice(5)] ? `${ttT("帶回來一個")}${ttCJK() ? "" : " "}${ttT(PET_GIFTS[x.k.slice(5)][0])}` : /^(give|got|visit|visited):/.test(x.k) ? petDiarySocialText(x.k) : /^trick:\d$/.test(x.k) ? ttT("學會新把戲：{t}").replace("{t}", ttT(PET_TRICKS[+x.k.slice(6)] || "")) : "";
  const dt = t => { const z = new Date(t); return isNaN(z) ? "" : `${z.getFullYear()}/${z.getMonth() + 1}/${z.getDate()}`; };
  const rows = all.filter(x => txt(x)).map(x => `<div class="diary-row"><span class="diary-ic">${x.i != null && typeof PET_ART !== "undefined" ? PET_ART.svg(x.i) : `<span class="inline-ic">${ic("footprints")}</span>`}</span><span class="diary-t">${escHtml(txt(x))}</span><time>${dt(x.t)}</time></div>`).join("");
  return rows || `<div class="diary-empty">${ttT("還沒有紀錄")}</div>`;
}
// 日記照月份看（2026-10-08 R4 原22，併進手冊、不另做一套）：有紀錄的月份一顆按鈕；選了月份上面多一行「這個月」的小結
function petDiaryMonths() {
  let d = []; try { d = JSON.parse(localStorage.getItem("tt_pet_diary") || "[]").filter(x => !x.dbg); } catch (e) { /* */ }
  const ms = [...new Set(d.map(x => localYM(x.t)).concat(realRecords().filter(r => !r.dbg).map(r => localYM(r.date))).filter(Boolean))].sort().reverse().slice(0, 12);
  if (ms.length < 2) return "";   // 只有一個月：不用篩
  const lab = m => { const [y, mo] = m.split("-"); return new Date(+y, +mo - 1, 1).toLocaleDateString(ttLocale(), { month: "short" }); };
  return `<div class="pp-tods diary-months" role="radiogroup" aria-label="${escHtml(ttT("月份"))}"><button class="pp-tod on" data-ym="" role="radio" aria-checked="true">${ttT("全部")}</button>${ms.map(m => `<button class="pp-tod" data-ym="${m}" role="radio" aria-checked="false">${lab(m)}</button>`).join("")}</div><div class="diary-month-sum" hidden></div>`;
}
function petMonthSum(ym) {
  const recs = realRecords().filter(r => !r.dbg && localYM(r.date) === ym), km = recs.reduce((s, r) => s + (r.distanceKm || 0), 0);
  let d = []; try { d = JSON.parse(localStorage.getItem("tt_pet_diary") || "[]").filter(x => !x.dbg && localYM(x.t) === ym); } catch (e) { /* */ }
  return ttT("這個月：一起出門 {a} 次、{b} km、日記 {c} 則").replace("{a}", recs.length).replace("{b}", km.toFixed(1)).replace("{c}", d.length);
}
function bindDiaryMonths(ov) {
  const sum = ov.querySelector(".diary-month-sum"), list = ov.querySelector(".diary-list");
  ov.querySelectorAll(".diary-months .pp-tod").forEach(b => b.addEventListener("click", () => {
    ov.querySelectorAll(".diary-months .pp-tod").forEach(o => { o.classList.toggle("on", o === b); o.setAttribute("aria-checked", o === b); });
    const ym = b.dataset.ym; list.innerHTML = petDiaryHtml(ym || null); if (sum) { sum.hidden = !ym; sum.textContent = ym ? petMonthSum(ym) : ""; }
  }));
}
function openPetDex() {
  if (document.querySelector('[data-ov="petdex"]')) return;   // 防連點疊層
  const km = totalKm(), reached = petStageIndex(km), next = PET_STAGES[reached + 1];
  const Q = ttUnknown();
  const stages = PET_STAGES.map((s0, i) => {
    const s = petStageInfo(i), unlocked = i <= reached, isNow = i === reached;   // R15：照現在選的配色顯示那一種物種的名字、樣子
    return `<div class="dex-row${unlocked ? "" : " locked"}${isNow ? " now" : ""}">
      <div class="dex-e">${unlocked && typeof PET_ART !== "undefined" ? PET_ART.own(() => PET_ART.svg(i)) : (unlocked ? s.e : `<svg class="ic dex-lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`)}</div>
      <div class="dex-body">
        <div class="dex-h"><b>${unlocked ? ttT(s.n) : Q}</b><span class="lv-chip lvt-${Math.min(i + 1, 7)}">Lv.${i + 1}</span>${isNow ? `<span class="dex-now">${ttT("目前")}</span>` : ""}</div>
        <div class="dex-k">${i === 0 ? ttT("起始型態") : ttT(`成長里程 ${s.km} km 解鎖`)}</div>
        ${unlocked ? `<div class="dex-trick">${petTrickKnown(i) ? `${escHtml(ttT("把戲"))}：<b>${escHtml(ttT(PET_TRICKS[i]))}</b>（${escHtml(ttT("點兩下"))}）` : escHtml(ttT("連續 3 天摸摸牠，會學會一個小把戲"))}</div>` : ""}
        <div class="dex-d">${unlocked ? ttT(s.d) : ttT("還沒見過牠。多走幾趟就碰得到")}</div>
      </div>
    </div>`;
  }).join("");
  const tip = next ? `${ttT("再走")} <b>${(next.km - km).toFixed(1)}</b> ${ttT(`km 進化成 ${Q}`)}` : ttT("已經是最終型態了，接下來就一起走吧");
  const sp = ttSp();   // 「成長里程」要粗體，三段分開翻；外文要自己補空白（以前英文黏成 "footsteps.growth kmcomes"）
  const ov = document.createElement("div");
  ov.className = "pet-modal"; ov.dataset.ov = "petdex";
  ov.innerHTML = `<div class="pet-modal-card">
    <button class="sheet-close" id="petDexClose" aria-label="${ttT("關閉")}"><svg class="ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    <h2>${ttT("夥伴手冊")}</h2>
    <p class="dex-intro">${ttT("牠靠你的腳程長大。")}${sp}<b>${ttCJK() ? ttT("成長里程") : ttT("成長里程").replace(/^\p{Ll}/u, c => c.toUpperCase())}</b>${sp}${ttT("主要來自你走的路，餵食和每日任務也會偷偷加一點。")}</p>
    <div class="dex-tip"><span class="inline-ic">${ic("footprints")}</span> ${tip}</div>
    <div class="dex-sec">${ttT("牠帶回來的小東西")}</div>
    <div class="gift-grid">${Object.keys(PET_GIFTS).map(k => { const o = petGiftsOwned().find(g => g.id === k); return o ? `<div class="gift-it">${petGiftIcon(k)}<span>${escHtml(ttT(PET_GIFTS[k][0]))}</span></div>` : `<div class="gift-it no"><b>?</b><span>${escHtml(ttT("還沒帶回來"))}</span></div>`; }).join("")}</div>
    <div class="dex-sec">${ttT("近親物種")}</div><div class="dex-tones dex-species">${[["", "原本"], ["deep", "深林"], ["sea", "海風"], ["alpine", "高山"]].map(([k, l]) => { const ok = petToneUnlocked()[k], nm = ttT(petStageInfo(reached, k).n); return `<button class="dex-sp${petTone() === k ? " on" : ""}" data-tone="${k}"${ok ? "" : " disabled"} aria-label="${escHtml(ttT(l) + " " + nm)}"><span class="dex-sp-art">${typeof PET_ART !== "undefined" ? PET_ART.as(k, () => PET_ART.svg(reached)) : ""}</span><span class="dex-sp-n">${ok ? "" : `<svg class="ic tone-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`}${escHtml(ttT(l))}</span><span class="dex-sp-s">${escHtml(nm)}</span></button>`; }).join("")}</div>${(() => { const u = petToneUnlocked(), need = [["deep", "深林", "走 3 趟森林步道解鎖"], ["sea", "海風", "走 3 趟海景或湖泊步道解鎖"], ["alpine", "高山", "走 3 趟海拔 1500 公尺以上解鎖"]].filter(([k]) => !u[k]); const pr = petToneProgress(); return `<div class="dex-tone-hint"><span class="dex-tone-what">${escHtml(ttT("常走同一類步道，夥伴會長成那裡的近親物種：只換樣子和名字，不影響成長；好友也看得到"))}</span>${need.map(([k, l, h]) => `<span><b>${escHtml(ttT(l))}</b> ${escHtml(ttT(h))}（${Math.min(3, pr[k])}/3）</span>`).join("")}</div>`; })()}
    <div class="dex-sec">${ttT("夥伴日記")}</div>
    ${petDiaryMonths()}<div class="diary-list">${petDiaryHtml()}</div>
    <div class="dex-sec">${ttT(`進化圖鑑（共 ${PET_STAGES.length} 階）`)}</div>
    <div class="dex-list">${stages}</div>
  </div>`;
  document.body.appendChild(ov);
  let _a11y = null;
  const close = () => { if (_a11y) _a11y(); ov.remove(); };
  if (typeof ttModalA11y === "function") _a11y = ttModalA11y(ov, close, { focus: "#petDexClose" });
  bindDiaryMonths(ov);
  ov.querySelectorAll(".dex-tones .dex-sp:not([disabled])").forEach(b => b.addEventListener("click", () => {
    localStorage.setItem("tt_pet_tone", b.dataset.tone); petApplyTone(); renderPet(); petBuzz(10);
    const card = ov.querySelector(".pet-modal-card"), y = card ? card.scrollTop : 0; ov.remove(); openPetDex();   // 整本重畫：進化圖鑑的名字、樣子跟著換
    const c2 = document.querySelector('[data-ov="petdex"] .pet-modal-card'); if (c2) c2.scrollTop = y;
  }));
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  ov.querySelector("#petDexClose").addEventListener("click", close);
}
// 全螢幕進化慶祝
function celebrateEvolve(st, lv) {
  if (document.querySelector('[data-ov="evolve"]')) return;   // 防連點疊層
  const ov = document.createElement("div");
  ov.className = "evolve-ov"; ov.dataset.ov = "evolve";
  const A = typeof PET_ART !== "undefined";
  const newIdx = lv - 1, prevIdx = Math.max(0, lv - 2);
  // 變身序列：舊角色抖動→白光爆閃→新角色現身
  const stageHtml = A
    ? `<div class="evolve-stage"><div class="evolve-from">${PET_ART.svg(prevIdx)}</div><div class="evolve-flash"></div><div class="evolve-to">${PET_ART.svg(newIdx)}</div></div>`
    : `<div class="evolve-emoji">${st.e}</div>`;
  ov.style.setProperty("--habitat", PET_BG[newIdx] || PET_BG[0]);
  ov.classList.add("evolve-lv" + lv);
  // 背景＝新階段的 2.5D 場景（跟主卡同一套，時段跟真實世界）；中間旋轉光芒＋光點往外爆
  const bg = typeof PetStage !== "undefined" ? PetStage.html(newIdx, "", { bg: true }) : ((A && PET_ART.habitat) ? PET_ART.habitat(newIdx) : "");
  const burst = Array.from({ length: 16 }, (_, k) => `<i style="--a:${k * 22.5}deg;--dl:${(1.05 + (k % 4) * .05).toFixed(2)}s"></i>`).join("");
  ov.innerHTML = `<div class="evolve-bg">${bg}</div><div class="evolve-rays" aria-hidden="true"></div><div class="evolve-card">
    <div class="evolve-spark"></div><div class="evolve-burst" aria-hidden="true">${burst}</div>
    ${stageHtml}
    <div class="evolve-h">${ttT("進化了！")}</div>
    <div class="evolve-n">${escHtml(petName() || ttT(st.n))} <span class="lv-chip lvt-${Math.min(lv, 7)}">Lv.${lv}</span></div>
    <div class="evolve-d">${ttT(st.d)}</div>
    <div class="evolve-diary">${ttT("已經寫進夥伴日記")}</div>
    <button class="btn primary" id="evolveOk">${ttT("太棒了")}</button>
  </div>`;
  document.body.appendChild(ov);
  petBuzz([30, 80, 30]); setTimeout(() => { if (ov.isConnected) { petBuzz([60, 40, 140]); petSound("evolve"); } }, 2150);   // 白光那一刻再震一次（#13）
  const close = () => ov.remove();
  ov.querySelector("#evolveOk").addEventListener("click", close);
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
}
// 走完後檢查是否進化（跨次也記住）
function checkPetEvolve() {
  const i = petStageIndex(totalKm());
  const prev = +(localStorage.getItem("tt_pet_stage") || 0);
  if (i !== prev) localStorage.setItem("tt_pet_stage", i);
  if (i > prev) { setTimeout(() => celebrateEvolve(petStageInfo(i), i + 1), 800); window.__petEvolving = true; petDiaryAdd("evo", i); try { if (typeof window !== "undefined" && window.scheduleCloudBackup) window.scheduleCloudBackup(); } catch (e) { /* */ } }   // 寵物進化也自動備份
}
// 記錄頁待機面板（未開始記錄時顯示夥伴/上次/推薦）
function renderRecIdle() {
  const box = $("#recIdle"); if (!box) return;
  if (Recorder.getState && Recorder.getState() !== "idle") { box.hidden = true; return; }
  // 已選好步道：收起這張，讓地圖和「開始」留在第一個畫面裡
  if (typeof selectedTrailId !== "undefined" && selectedTrailId) { box.hidden = true; return; }
  const recs = realRecords(), last = recs[0];
  // 快捷卡：最近走過＋收藏的步道，點一下就選好（不用回探索頁找）
  const seen = new Set(), picks = [];
  for (const r of recs) { if (r.trailId != null && !seen.has(String(r.trailId))) { const t = TRAILS.find(x => String(x.id) === String(r.trailId)); if (t) { seen.add(String(t.id)); picks.push([t, "clock"]); } } if (picks.length >= 3) break; }
  for (const t of TRAILS) { if (picks.length >= 5) break; if (Store.isFav(t.id) && !seen.has(String(t.id))) { seen.add(String(t.id)); picks.push([t, "star"]); } }
  if (!last && !picks.length) { box.hidden = true; return; }
  box.hidden = false;
  // 步道名獨立成一個文字節點，外文介面才翻得到（以前「上次：南澳古道・」整句黏在一起）
  let html = last ? `<div class="ridle-row"><span class="inline-ic">${ic("pin")}</span><span><span>${ttT("上次")}</span>${ttColon()}<span>${escHtml(last.trailName || ttT("自由路線"))}</span>・<b>${(last.distanceKm || 0).toFixed(2)}</b> km</span></div>` : "";
  if (picks.length) html += `<div class="ridle-picks-h">${ttT("今天走這條？")}</div><div class="ridle-picks">${picks.map(([t, i]) =>
    `<button class="ridle-pick" data-pick="${t.id}">${ic(i)}<span>${escHtml(t.name)}</span></button>`).join("")}</div>`;
  // #4 臨門提醒：離下一個成就還差多少
  try {
    const nu = achNextUp()[0];
    if (nu && nu.ratio >= 0.35) {   // 已接近才提醒，免洗版
      const [cur, goal, unit] = nu.b.p, remain = goal - cur;
      const rn = unit === "km" ? Math.round(remain * 10) / 10 : Math.ceil(remain);
      // 單位：天走 ttCount（各語言單複數）；其他單位英文 1 時去掉複數 s（以前「In 1 weeks」）
      let ut = unit === "天" ? ttCount(rn, "day").replace(/^\S+\s/, "") : ttT(unit);
      if (rn === 1 && typeof I18n !== "undefined" && I18n.lang() === "en") ut = ut.replace(/s$/, "");
      html += `<div class="ridle-row ridle-ach"><span class="inline-ic">${ic("trophy")}</span><span class="ra-n">${ttQuote(ttT(nu.b.n))}</span><span class="ra-r"><span>${ttT("還差")}</span> <b>${unit === "km" ? rn.toFixed(1) : rn}</b> <span>${ut}</span></span></div>`;
    }
  } catch (e) { /* */ }
  box.innerHTML = html;
  box.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", () => {
    const t = TRAILS.find(x => String(x.id) === b.dataset.pick); if (!t) return;
    ensureGeo(t.region).then(() => selectTrailForRecord(t)).catch(() => selectTrailForRecord(t));
  }));
}
// 我的足跡熱力圖：所有真實軌跡疊在一張地圖上
async function openFootprintMap() {
  if (document.querySelector('[data-ov="footmap"]')) return;   // 防連點疊層
  if (typeof ttBusy === "function" && ttBusy("footmap")) return;   // 同步鎖：讀封存的空窗期連點也擋
  const recs = (await Store.allFull()).filter(r => isFootRec(r) && r.track && r.track.length > 1);
  if (!recs.length) { toast(ttT("地圖還空空的，走完第一趟就畫上去了")); return; }
  const ov = document.createElement("div");
  ov.className = "foot-modal"; ov.dataset.ov = "footmap";
  ov.innerHTML = `<button class="lb-close" id="footClose" aria-label="${ttT("關閉")}">✕</button><div id="footMap"></div><div class="foot-cap"><span>${ttT("足跡地圖")}</span> · <b>${recs.length}</b> <span>${ttT("段軌跡")}</span></div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  $("#footClose").addEventListener("click", close);
  setTimeout(() => {
    const m = L.map("footMap", { zoomControl: false });
    L.control.zoom({ position: "topleft", zoomInTitle: ttT("放大地圖"), zoomOutTitle: ttT("縮小地圖") }).addTo(m);   // 跟記錄地圖同一套縮放鈕
    baseTopo().addTo(m);
    const all = [];
    recs.forEach(r => {
      const pts = r.track.map(p => [p.lat, p.lon]);
      // 疊加＝熱力（gap 分段）；趟數少時透明度提高，不然只有一兩趟時淡到看不見
      L.polyline(trackSegments(r.track).map(s => s.map(p => [p.lat, p.lon])), { color: "#e8590c", weight: 5, opacity: Math.max(.35, Math.min(.9, 2 / recs.length)) }).addTo(m);
      all.push(...pts);
    });
    if (all.length) m.fitBounds(all, { padding: [40, 40] });
    m.invalidateSize();
  }, 90);
}
// 每日目標環
function todayKm() { const d = todayStr(); return realRecords().filter(r => localDay(r.date) === d).reduce((s, r) => s + (r.distanceKm || 0), 0); }
// （每日目標環已依使用者要求移除；todayKm 仍供每日任務使用）
