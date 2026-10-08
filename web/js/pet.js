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
const BERRY_SVG = `<svg class="berry" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5c3.6 0 6 2.2 6 5.6 0 3.8-3 6.9-6 6.9s-6-3.1-6-6.9c0-3.4 2.4-5.6 6-5.6Z" fill="#e0445c"/><path d="M9 12.5h.01M12 11.5h.01M15 12.5h.01M10.5 15.5h.01M13.5 15.5h.01M12 18h.01" stroke="#ffd9a0" stroke-width="1.6" stroke-linecap="round"/><path d="M12 8.5c-.6-2-2.2-3.2-4.2-3.3 1 1.5 2.4 2.7 4.2 3.3Zm0 0c.6-2 2.2-3.2 4.2-3.3-1 1.5-2.4 2.7-4.2 3.3Zm0 0V4.5" fill="#4f9a55" stroke="#4f9a55" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
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
function affinity() {
  const raw = +(localStorage.getItem("tt_pet_aff") || 0);
  const t = localStorage.getItem("tt_pet_aff_t");
  const idle = t ? Math.max(0, daysSince(t) - 1) : 0;
  return Math.max(0, Math.min(100, Math.round(raw - idle * 2)));
}
function petHearts() { return Math.max(0, Math.min(5, Math.floor(affinity() / 20))); }
function bumpAffinity(amt) {
  const cur = affinity();
  localStorage.setItem("tt_pet_aff", String(Math.max(0, Math.min(100, cur + amt))));
  localStorage.setItem("tt_pet_aff_t", ttClock.date().toISOString());
}
// ── 陪伴（2026-10-07 寵物新一輪 #5 #8 #9 #10，參考 Finch／寶可夢 GO 夥伴／Pikmin Bloom）──
// 親密的來源一條一條寫清楚（每種各有上限，不懲罰）；摸頭也算一點點（每天最多 3 次）
function petPatAff() {
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
};
function petGiftsOwned() { try { return JSON.parse(localStorage.getItem("tt_pet_gifts") || "[]"); } catch (e) { return []; } }
function petGiftIcon(id, cls) { const g = PET_GIFTS[id]; return g ? `<svg class="${cls || "pg-ic"}" viewBox="0 0 24 24" aria-hidden="true">${g[1]}</svg>` : ""; }
function petGiftDue() { return petHearts() >= 5 && ttClock.now() - (+(localStorage.getItem("tt_pet_gift_t") || 0)) >= 2 * 864e5; }
function petGiftGive() {
  const own = petGiftsOwned(), left = Object.keys(PET_GIFTS).filter(k => !own.some(o => o.id === k)), id = left.length ? left[Math.floor(Math.random() * left.length)] : null;
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
// 農曆新年、端午、中秋（前後一天）舞台掛一盞燈籠、泡泡說祝福。農曆日期先內建到 2030 年
const PET_FEST = { ny: ["2026-02-17", "2027-02-06", "2028-01-26", "2029-02-13", "2030-02-03"], db: ["2026-06-19", "2027-06-09", "2028-05-28", "2029-06-16", "2030-06-05"], ma: ["2026-09-25", "2027-09-15", "2028-10-03", "2029-09-22", "2030-09-12"] };
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
// 打開夥伴頁時泡泡先說什麼：剛健行完的感想 > 你不在時牠做了什麼；說了就留 25 秒（期間天氣回來重畫也不換掉）
function petStickyLine(i) {
  const w = window.__petLine; if (w && w.until > Date.now()) return w.t;
  const away = petAwayLine(i), t = petSpecialDay() || petRecapLine() || (away ? ttT(away) : null);
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
  if (typeof PetStage !== "undefined") PetStage.feed(BERRY_SVG).then(done, e => { done(); setTimeout(() => { throw e; }); });   // 2026-10-06：失敗照樣結算，但把錯誤丟出來（以前安靜吞掉，幼蟲掉頭壞了好幾個版本都沒人知道）
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
function openHatPicker() {
  if (document.querySelector('[data-ov="pethat"]')) return;
  const pro = typeof Premium !== "undefined" && Premium.isOn();
  const i = petStageIndex(totalKm()), cur = petHat(), owned = hatsOwned();
  const opts = PET_ART.HAT_IDS.map(id => {
    const reg = typeof PetJourney !== "undefined" ? PetJourney.hatRegion(id) : "";   // 地區配件：走過才有，不能買
    const has = owned.has(id), sea = hatSeason(id), quest = id === "bandana" || !!reg || (!!sea && !sea.on);   // 登山頭巾：完成每月挑戰才拿得到，不能買；季節限定不在季節內
    const proLock = !pro && !FREE_HATS.has(id) && !has;   // 以前當會員時換到的照樣能戴；新換的、地區配件要 PRO
    return `<button class="hat-opt${id === cur ? " on" : ""}${has && !proLock ? "" : " locked"}${quest && !has ? " quest" : ""}" data-hat="${id}"><div class="hat-prev">${PET_ART.svg(i)}${PET_ART.hat(id, i)}</div><div class="hat-lbl">${ttT(PET_ART.HAT_LABEL[id])}</div>${proLock ? `<div class="hat-cost"><span class="pro-tag">PRO</span></div>` : has ? "" : reg ? `<div class="hat-cost hat-quest">${ic("map")} <span>${ttT(reg)}</span></div>` : sea ? `<div class="hat-cost hat-quest">${ic("sparkle")} <span>${ttT(sea.on ? "季節限定・免費" : "季節限定")}</span></div>` : quest ? `<div class="hat-cost hat-quest">${ic("flag")} <span>${ttT("每月挑戰")}</span></div>` : `<div class="hat-cost">${BERRY_SVG}${HAT_COST}</div>`}</button>`;
  }).join("");
  const ov = document.createElement("div"); ov.className = "pet-modal"; ov.dataset.ov = "pethat";
  ov.innerHTML = `<div class="pet-modal-card"><button class="sheet-close" id="hatClose" aria-label="${ttT("關閉")}">${ic("x")}</button><h2>${ic("sparkle")} ${ttT("幫夥伴裝扮")}</h2><p class="dex-intro">${ttT("用果實換新配件，換過的就一直是你的。")}</p><div class="hat-bal">${ttT("你有")} ${BERRY_SVG}<b>${berriesBalance()}</b></div><div class="hat-grid">${opts}</div>${petPropsPicker()}</div>`;
  document.body.appendChild(ov);
  bindPropsPicker(ov);
  let _a11y = null;
  const close = () => { if (_a11y) _a11y(); ov.remove(); };
  if (typeof ttModalA11y === "function") _a11y = ttModalA11y(ov, close, { focus: "#hatClose" });
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  ov.querySelector("#hatClose").addEventListener("click", close);
  ov.querySelectorAll(".hat-opt").forEach(btn => btn.addEventListener("click", async () => {
    const id = btn.dataset.hat, own = hatsOwned();
    const reg = typeof PetJourney !== "undefined" ? PetJourney.hatRegion(id) : "";
    if (reg && !_proGate()) return;   // 地區配件：PRO 的旅行功能
    if (reg && !own.has(id)) { toast(`${ttT(reg)}・${ttT("走過這個地區的步道就會解鎖")}`); return; }
    if (!FREE_HATS.has(id) && !own.has(id) && !_proGate()) return;   // 用果實換新配件：PRO（已擁有的照樣能戴）
    if (!own.has(id) && id === "bandana") { toast(ttT("完成一次每月挑戰就會解鎖，在夥伴頁看進度")); return; }
    { const sea = hatSeason(id); if (sea && !own.has(id)) { if (!sea.on) { toast(`${ttT("季節限定")}・${ttT(sea.hint)}`); return; }
      own.add(id); localStorage.setItem("tt_pet_hats_owned", JSON.stringify([...own].filter(h => !(typeof PetJourney !== "undefined" && PetJourney.hatRegion(h))))); btn.classList.remove("locked"); const c = btn.querySelector(".hat-cost"); if (c) c.remove(); toast(ttT("季節限定配件收進來了，之後隨時都能戴")); } }
    if (!own.has(id)) {
      if (berriesBalance() < HAT_COST) { toast(`${ttT("果實還差")} ${HAT_COST - berriesBalance()}`); return; }
      const ok = typeof ttConfirm === "function" ? await ttConfirm(`${ttT("換上")}${ttSp()}${ttQuote(ttT(PET_ART.HAT_LABEL[id]))}${ttCJK() ? "？" : "?"}${ttParen(`${HAT_COST} ${ttT("顆果實")}`)}`, ttT("換上"), ttT("再想想")) : true;
      if (!ok) return;
      localStorage.setItem("tt_pet_berry_spent", String((+(localStorage.getItem("tt_pet_berry_spent") || 0)) + HAT_COST));
      own.add(id); localStorage.setItem("tt_pet_hats_owned", JSON.stringify([...own].filter(h => !(typeof PetJourney !== "undefined" && PetJourney.hatRegion(h)))));   // 地區配件是推出來的，不寫進存檔
      btn.classList.remove("locked"); const c = btn.querySelector(".hat-cost"); if (c) c.remove();
      const bal = ov.querySelector(".hat-bal b"); if (bal) bal.textContent = berriesBalance();
    }
    localStorage.setItem("tt_pet_hat", id);
    ov.querySelectorAll(".hat-opt").forEach(b => b.classList.toggle("on", b === btn));
    renderPet();
    petBuzz(15);
  }));
}
// 夥伴的音效與震動（2026-10-07 寵物新一輪 #23）：音效預設關（吃東西、抱抱、進化、收到禮物各一種輕柔的合成音，不用音檔）；震動預設開，可以在「？」裡關掉
const petHapticOn = () => localStorage.getItem("tt_pet_haptic") !== "0", petSoundOn = () => localStorage.getItem("tt_pet_sound") === "1";
// 裝置做得到才顯示開關（2026-10-08 修正案 A6）：以前 iPhone 網頁版有「夥伴震動」開關但 Safari 根本沒有震動；
// 搖手機在 iPhone 要先請「動作與方向」權限，以前從沒請過＝這個功能在 iPhone 上一直是死的
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
function petPropsAll() { const own = new Set(petGiftsOwned().map(g => g.id)); return Object.keys(PET_GIFTS).map(id => ({ id, n: PET_GIFTS[id][0], svg: PET_GIFTS[id][1], ok: own.has(id), how: "親密滿了會帶回來" })).concat(Object.keys(PET_PROP_EXTRA).map(id => { const e = PET_PROP_EXTRA[id]; return { id, n: e[0], svg: e[2], ok: !!window.__petPropsAll || e[3](), how: e[1] }; })); }   // __petPropsAll：測試面板全解鎖
function petPropsOn() { let a = []; try { a = JSON.parse(localStorage.getItem("tt_pet_props") || "[]"); } catch (e) { /* */ } const ok = new Set(petPropsAll().filter(p => p.ok).map(p => p.id)); return a.filter(id => ok.has(id)).slice(0, 2); }
function petPropsSvgs() { const all = petPropsAll(); return petPropsOn().map(id => { const p = all.find(x => x.id === id); return p ? `<svg viewBox="0 0 24 24">${p.svg}</svg>` : ""; }); }
function petPropsPicker() {
  const on = petPropsOn();
  return `<div class="dex-sec">${ttT("舞台擺設（最多 2 個）")}</div><div class="gift-grid prop-grid">${petPropsAll().map(p => `<button class="gift-it prop-it${p.ok ? "" : " no"}${on.includes(p.id) ? " on" : ""}" data-prop="${p.id}"${p.ok ? "" : " disabled"}>${p.ok ? `<svg class="pg-ic" viewBox="0 0 24 24">${p.svg}</svg>` : "<b>?</b>"}<span>${escHtml(ttT(p.ok ? p.n : p.how))}</span></button>`).join("")}</div>`;
}
function bindPropsPicker(ov) {
  ov.querySelectorAll(".prop-it:not(.no)").forEach(b => b.addEventListener("click", () => {
    let on = petPropsOn(); const id = b.dataset.prop;
    on = on.includes(id) ? on.filter(x => x !== id) : on.concat(id).slice(-2);   // 第三個：最早擺的那個收起來
    localStorage.setItem("tt_pet_props", JSON.stringify(on)); ov.querySelectorAll(".prop-it").forEach(x => x.classList.toggle("on", on.includes(x.dataset.prop)));
    petBuzz(10); renderPet();
  }));
}
const PET_TOY_ICON = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="13" rx="5.5" ry="7.5"/><path d="M7 10h10M6.6 13.5h10.8M7.4 17h9.2M12 5V2"/></svg>`;   // 松果（玩）
// 拍照模式（2026-10-07 寵物新一輪 #18）：夥伴＋牠的舞台＋名字、等級、成長里程、同行天數，存成一張 4:5 的圖分享；可以換時段
const PET_PHOTO_TOD = [["dawn", "清晨"], ["day", "白天"], ["dusk", "黃昏"], ["night", "夜晚"]];
async function drawPetPhoto(tod) {
  const W = 1080, H = 1350, SH = 930, c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
  const F = "'TaipeiSans', 'PingFang TC', sans-serif", km = totalKm(), i = petStageIndex(km), st = PET_STAGES[i];
  try { await document.fonts.load(`800 60px TaipeiSans`); } catch (e) { /* 字型讀不到就用系統的 */ }
  const img = src => new Promise((res, rej) => { const m = new Image(); m.onload = () => res(m); m.onerror = rej; m.src = src; });
  const svgUri = t => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(t);
  const sv = PetStage.photoSvgs(i, tod, W, SH);
  x.drawImage(await img(svgUri(sv.back)), 0, 0, W, SH);
  const S = 600; x.save(); x.shadowColor = "rgba(0,0,0,.3)"; x.shadowBlur = 30; x.shadowOffsetY = 14;
  x.drawImage(await img(PET_ART.dataUri(i, S, petHat())), (W - S) / 2, SH - S - 70, S, S); x.restore();
  x.drawImage(await img(svgUri(sv.front)), 0, 0, W, SH);
  const g = x.createLinearGradient(0, SH - 60, 0, H); g.addColorStop(0, "rgba(22,44,31,0)"); g.addColorStop(.12, "#1d3a28"); g.addColorStop(1, "#14281c"); x.fillStyle = g; x.fillRect(0, SH - 60, W, H - SH + 60);
  x.textAlign = "center"; x.fillStyle = "#fbf8ee"; x.font = `900 76px ${F}`; x.fillText(petName() || ttT(st.n), W / 2, SH + 70, W - 120);
  x.fillStyle = "#e8c87a"; x.font = `700 40px ${F}`; x.fillText(petName() ? `Lv.${i + 1} · ${ttT(st.n)}` : `Lv.${i + 1}`, W / 2, SH + 130, W - 120);   // 沒取名字：標題已經是種類名，副標只寫等級
  const stats = [[`${km.toFixed(1)} km`, ttT("成長里程")], [`${petDaysTogether()} ${ttT("天")}`, ttT("同行")], [`${petHearts()}/5`, ttT("親密")]];
  stats.forEach(([v, l], k) => { const cx = W / 2 + (k - 1) * 320; x.fillStyle = "#fbf8ee"; x.font = `800 54px ${F}`; x.fillText(v, cx, SH + 230, 300); x.fillStyle = "rgba(251,248,238,.65)"; x.font = `500 32px ${F}`; x.fillText(l, cx, SH + 276, 300); });
  x.fillStyle = "rgba(232,200,122,.85)"; x.font = `700 34px ${F}`; x.fillText(ttT("循徑拾光 · Gather the Trail"), W / 2, H - 50);
  return c;
}
function openPetPhoto() {
  if (document.querySelector('[data-ov="petphoto"]') || typeof PetStage === "undefined" || !PetStage.photoSvgs) return;
  let tod = PetStage.tod(), busy = false;
  const ov = document.createElement("div"); ov.className = "pet-modal"; ov.dataset.ov = "petphoto";
  ov.innerHTML = `<div class="pet-modal-card pp-card"><button class="sheet-close" id="ppClose" aria-label="${ttT("關閉")}">${ic("x")}</button><h2>${ic("camera")} ${ttT("幫夥伴拍張照")}</h2>
    <div class="pp-prev"><img alt="${escHtml(ttT("夥伴照片預覽"))}"></div>
    <div class="pp-tods" role="radiogroup" aria-label="${escHtml(ttT("時段"))}">${PET_PHOTO_TOD.map(([k, l]) => `<button class="pp-tod${k === tod ? " on" : ""}" data-tod="${k}" role="radio" aria-checked="${k === tod}">${ttT(l)}</button>`).join("")}</div>
    <button class="btn primary" id="ppShare">${ic("share")} ${ttT("存成圖片分享")}</button></div>`;
  document.body.appendChild(ov);
  let _a11y = null; const close = () => { if (_a11y) _a11y(); ov.remove(); };
  if (typeof ttModalA11y === "function") _a11y = ttModalA11y(ov, close, { focus: "#ppClose" });
  ov.addEventListener("click", e => { if (e.target === ov) close(); }); ov.querySelector("#ppClose").addEventListener("click", close);
  const im = ov.querySelector(".pp-prev img");
  const draw = async () => { try { const cv = await drawPetPhoto(tod); im.src = cv.toDataURL("image/jpeg", .85); im.__cv = cv; } catch (e) { toast(ttT("產生圖片失敗")); } };
  ov.querySelectorAll(".pp-tod").forEach(b => b.addEventListener("click", () => { tod = b.dataset.tod; ov.querySelectorAll(".pp-tod").forEach(o => { o.classList.toggle("on", o === b); o.setAttribute("aria-checked", o === b); }); draw(); }));
  ov.querySelector("#ppShare").addEventListener("click", async () => {
    if (busy || !im.__cv) return; busy = true;
    try { const blob = await new Promise(r => im.__cv.toBlob(r, "image/png")); const how = await saveBlob(blob, `${ttCJK() ? "循徑拾光-夥伴" : "gather-the-trail-buddy"}.png`, petName() || ttT(PET_STAGES[petStageIndex(totalKm())].n)); if (how === "saved") toast(ttT("已存成圖片")); }
    catch (e) { toast(ttT("產生圖片失敗")); } finally { busy = false; }
  });
  draw();
}
// 供社群同步：寵物名字/等級/成長里程，讓好友看到你的進度
function petStats() {
  const km = totalKm(), i = petStageIndex(km), st = PET_STAGES[i];
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
    addBerryBonus(r.total); localStorage.setItem("tt_quest_claim", todayStr()); bumpAffinity(5);
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
  const km = totalKm(), i = petStageIndex(km), st = PET_STAGES[i], next = PET_STAGES[i + 1];
  const nm = petName(), mood = petMood(), days = petDaysTogether(), streak = weeksStreak(), en = energy();
  const berries = berriesBalance(), h = petHearts(), canFeed = canFeedNow(), cd = feedCooldownMs();
  const art = (typeof PET_ART !== "undefined") ? PET_ART.svg(i, "", petHat(), true) : `<span style="font-size:70px">${st.e}</span>`;   // 帽子畫在角色裡面，跟著同一個動畫動
  let evoTop, prog = "";
  if (next) {
    const pct = Math.max(2, Math.min(100, Math.round((km - st.km) / (next.km - st.km) * 100)));
    // 下一階不劇透：剪影＋「？？？」（手冊也是這樣）
    const nextArt = (typeof PET_ART !== "undefined") ? `<span class="pet-evo-sil">${PET_ART.svg(i + 1)}</span>` : "";
    evoTop = `<span>${ttT("再走")} <b>${(next.km - km).toFixed(1)}</b> km ${ttT("就進化")}</span><span class="pet-evo-next">${nextArt}<span>${ttUnknown()}</span></span>`;
    prog = `<div class="pet-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>`;
  } else evoTop = `<span>${ic("sparkle")} ${ttT("已經是最終型態了")}</span>`;
  const lovePct = Math.round(h / 5 * 100);
  const need = Math.max(0, 3 - berries);
  const feedLbl = cd > 0 ? `${cd >= 3600e3 ? `${Math.ceil(cd / 3600e3)} ${ttT("小時後可餵")}` : `${Math.ceil(cd / 6e4)} ${ttT("分鐘後可餵")}`}`
    : need > 0 ? `${ttT("還差")} ${need} ${ttT("顆果實")}` : `${ttT("餵食")}`;
  // 2.5D 舞台（pet-stage.js）：角色那一層包在分層場景裡；沒載到就退回舊的平面棲地
  // 2026-10-04：舞台、角色沒變（同一階、同一頂帽子、同一個名字、天氣與裝飾一樣）就只更新數字和文字——
  // 以前餵完、摸完都整張重畫：粒子位置重抽、待機動作重來、對話泡重彈，看起來像頁面刷新了一次
  const sig = [i, petHat(), nm, (typeof Premium !== "undefined" && Premium.isOn()) ? 1 : 0, typeof PetStage !== "undefined" ? PetStage.cachedWx() : "", typeof PetJourney !== "undefined" ? PetJourney.decor().join(",") : "", document.documentElement.lang || "", JSON.stringify(window.__ps || null), typeof PetStage !== "undefined" ? PetStage.tod() + PetStage.season() : "", petFestival() || "", petPropsOn().join(",")].join("|");   // __ps＝測試面板強制的時段／季節／天氣；時段、季節換了也要重畫（星星、螢火蟲、天空是畫出來的，2026-10-08）
  if (box.dataset.sig === sig && box.querySelector("#petEmoji")) {
    petCardUpdate(box, { km, mood, days, streak, en, h, left: next ? next.km - km : null, lovePct: Math.round(h / 5 * 100), canFeed, cd, berries, evoTop, pct: next ? Math.max(2, Math.min(100, Math.round((km - st.km) / (next.km - st.km) * 100))) : null });
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
    ? PetStage.html(i, actorHtml, { evo: next ? petEvoLv(Math.round((km - st.km) / (next.km - st.km) * 100)) : 0, wx: PetStage.cachedWx(), decor: typeof PetJourney !== "undefined" ? PetJourney.decor() : [], fest: petFestival(), props: petPropsSvgs() })
    : `<div class="pet-habitat">${(typeof PET_ART !== "undefined" && PET_ART.habitat) ? PET_ART.habitat(i) : ""}</div>${actorHtml}`;
  box.innerHTML = `<div class="pet-card${i >= 6 ? " final" : ""}" style="--habitat:${PET_BG[i]}">
    ${stageHtml}
    <div class="pet-stage">
      <div class="pet-idline"><span class="pet-name">${escHtml(nm || ttT(st.n))}</span><span class="lv-chip lvt-${Math.min(i + 1, 7)} pet-lv-chip">Lv.${i + 1}</span></div>
      <div class="pet-tools"><button class="pet-tool" id="petDress">${ic("sparkle")}${ttT("裝扮")}</button><button class="pet-tool" id="petPlay">${PET_TOY_ICON}${ttT("玩")}</button><button class="pet-tool" id="petPhoto">${ic("camera")}${ttT("拍照")}</button>${(typeof Premium !== "undefined" && Premium.isOn()) ? `<button class="pet-tool" id="petRename">${ic("pencil")}${ttT("改名")}</button>` : ""}</div>
      <div class="pet-evo"><div class="pet-evo-top">${evoTop}</div>${prog}</div>
    </div>
    <div class="pet-meters">
      <div class="pet-meter${en == null ? " no-en" : ""}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${en == null ? 0 : en}" aria-label="${ttT("活力")}"><span>${ttT("活力")} <b>${en == null ? "—" : en}</b></span><div class="mtrack"><i class="m-en" style="width:${en == null ? 0 : en}%"></i></div><em class="m-hint">${ttT("走一趟就有")}</em></div>
      <div class="pet-meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${lovePct}" aria-label="${ttT("親密")}"><span>${ttT("親密")} <b>${h}/5</b></span><div class="mtrack"><i class="m-love" style="width:${lovePct}%"></i></div></div>
      <button class="pet-help" id="petHelp" aria-label="${ttT("活力和親密是什麼？")}">?</button>
    </div>
    <div class="pet-chips">
      <div class="pet-chip${km < .05 ? " zero" : ""}"><div class="cv">${km.toFixed(1)}<small> km</small></div><div class="cl">${ttT("成長里程")}</div></div>
      <div class="pet-chip${days ? "" : " zero"}"><div class="cv">${days}<small> ${ttT("天")}</small></div><div class="cl">${ttT("同行")}</div></div>
      <div class="pet-chip${streak ? "" : " zero"}"><div class="cv">${streak}<small> ${ttT("週")}</small></div><div class="cl">${ttT("週週有走")}</div></div>
    </div>
    <div class="pet-acts">
      <button class="pet-btn feed" id="petFeed"${canFeed ? "" : " disabled"}><b class="fb-ic">${BERRY_SVG}<i class="fb-ring"></i></b><span>${feedLbl}</span>${need > 0 || cd > 0 ? "" : `<b class="feed-bal">${berries}</b>`}</button>
      <button class="pet-btn" id="petDex">${ic("book")} ${ttT("手冊")}</button>
      <button class="pet-btn" id="petRec">${ic("compass")} ${ttT("去走")}</button>
    </div>
  </div>`;
  if (typeof PetStage !== "undefined") {
    PetStage.bind(box.querySelector(".ps-box"), mood.k);
    petCompanion(box, i);
    const had = PetStage.cachedWx();
    PetStage.weather().then(w => { if (w !== had && document.body.dataset.view === "pet" && box.isConnected) renderPet(); if (typeof window.syncMyStatsToCloud === "function") window.syncMyStatsToCloud(); });   // 好友看到的天氣、配件跟著更新   // 天氣回來了才補畫（之後走快取，不會一直重畫）
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
    if (petPatAff()) petFloat(`${ttT("親密")} +1`, ".pet-card .pet-meter:nth-child(2) .mtrack", null, PET_HEART_SVG);   // 摸頭也算一點親密（每天 3 次，寵物新一輪 #8）
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
      petSay(ttT("抱抱！今天的親密增加了")); petFloat(`${ttT("親密")} +2`, ".pet-card .pet-meter:nth-child(2) .mtrack", null, PET_HEART_SVG);
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
        if (petPatAff()) petFloat(`${ttT("親密")} +1`, ".pet-card .pet-meter:nth-child(2) .mtrack", null, PET_HEART_SVG); }
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(t => em.addEventListener(t, () => { clearTimeout(pressT); rub = null; }));
    em.closest(".ps-box") && em.closest(".ps-box").addEventListener("pet-shaken", () => petSay(ttT(["哇～頭好暈", "別搖啦～", "地震了嗎？！"][Math.floor(Math.random() * 3)])));
    em.addEventListener("contextmenu", e => e.preventDefault());   // 長按不要跳出系統選單
    em.addEventListener("click", e => { if (hugged) { hugged = false; return; } poke(S ? PetStage.zoneOf(e.clientY) : "pat"); });
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
      const mo = document.getElementById("petMotionSw");   // iPhone：要使用者按下去那一刻才能請「動作與方向」權限
      if (mo) mo.addEventListener("change", () => { if (!mo.checked) { localStorage.setItem("tt_pet_motion", "0"); return; }
        DeviceMotionEvent.requestPermission().then(r => { const g = r === "granted"; mo.checked = g; localStorage.setItem("tt_pet_motion", g ? "1" : "0"); if (!g) toast(ttT("需允許「動作與方向」權限")); }).catch(() => { mo.checked = false; toast(ttT("需允許「動作與方向」權限")); }); });
    }, 0);
    const rows = petAffRows().map(([a, b, c]) => `<tr><td>${escHtml(ttT(a))}</td><td class="ah-v">${b}</td><td class="ah-t">${escHtml(c)}</td></tr>`).join("");
    if (typeof ttChoice === "function") ttChoice({ html: `<div class="aff-help"><p>${escHtml(ttT("活力：出門走路就會補滿，太久沒出門會慢慢掉。"))}</p><p><b>${escHtml(ttT("親密怎麼增加"))}</b></p><table>${rows}</table>
      <p>${escHtml(ttT("親密滿 5 顆心：餵食給的成長更多，牠也會自己出門帶小東西回來。"))}</p><p class="ah-n">${escHtml(ttT("兩個都不會讓夥伴退化，放心。"))}</p>
      ${petCan.sound() ? `<label class="ah-sw"><span>${escHtml(ttT("夥伴音效（吃東西、抱抱、進化）"))}</span><input type="checkbox" class="tt-switch" id="petSoundSw"${petSoundOn() ? " checked" : ""}></label>` : ""}
      ${petCan.haptic() ? `<label class="ah-sw"><span>${escHtml(ttT("夥伴震動"))}</span><input type="checkbox" class="tt-switch" id="petHapticSw"${petHapticOn() ? " checked" : ""}></label>` : ""}
      ${petCan.motionAsk() ? `<label class="ah-sw"><span>${escHtml(ttT("搖一搖手機，牠會頭暈"))}</span><input type="checkbox" class="tt-switch" id="petMotionSw"${localStorage.getItem("tt_pet_motion") === "1" ? " checked" : ""}></label>` : ""}</div>` }, [{ label: ttT("知道了"), value: true, cls: "primary" }]);
  });
  { const dr = $("#petDress"); if (dr) dr.addEventListener("click", openHatPicker); }
  { const ph = $("#petPhoto"); if (ph) ph.addEventListener("click", openPetPhoto); }
  { const pl = $("#petPlay"); if (pl) pl.addEventListener("click", () => {   // 丟松果（#12）：每隻用自己的方式玩；吃東西、正在玩的時候不能再丟
      if (typeof PetStage === "undefined" || !PetStage.play) return;
      if (PetStage.isFeeding() || PetStage.isPlaying()) { petSay(ttT("正在忙，等我一下～"), 1600); return; }
      if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) { petSay(ttT("好好玩！")); petBurst("❤️", 1); if (petPatAff()) renderPet(); return; }   /* 減少動態效果：沒有動畫，但親密照樣算（修正案共用原則 6，2026-10-08） */
      petBuzz(12); PetStage.play(`<svg viewBox="0 0 24 24">${PET_GIFTS.pine[1]}</svg>`).then(ok => { if (ok) { petSay(ttT(["好好玩！", "再丟一次嘛", "我抓到了！"][Math.floor(Math.random() * 3)])); if (petPatAff()) petFloat(`${ttT("親密")} +1`, ".pet-card .pet-meter:nth-child(2) .mtrack", null, PET_HEART_SVG); } });
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
  if (ms[1]) { const b = ms[1].querySelector("b"), was = b.textContent; b.textContent = `${v.h}/5`; ms[1].setAttribute("aria-valuenow", v.lovePct); ms[1].querySelector(".m-love").style.width = v.lovePct + "%"; if (was !== b.textContent) { ms[1].classList.add("bump"); setTimeout(() => ms[1].classList.remove("bump"), 700); } }
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
function petDiaryHtml() {
  let d = []; try { d = JSON.parse(localStorage.getItem("tt_pet_diary") || "[]"); } catch (e) { /* */ }
  d = d.filter(x => !x.dbg);   // 測試資料寫的不顯示
  const recs = realRecords().filter(r => !r.dbg), first = recs.length ? recs[recs.length - 1] : null;
  const all = d.slice(); all.push({ t: petHatch(), k: "meet", i: 0 }); if (first) all.push({ t: first.date, k: "hike1", i: null });
  all.sort((a, b) => String(b.t).localeCompare(String(a.t)));
  const txt = x => x.k === "meet" ? ttT("我們相遇了") : x.k === "evo" ? `${ttT("進化成")} ${ttT(PET_STAGES[x.i] ? PET_STAGES[x.i].n : "")}` : x.k === "feed1" ? ttT("第一次吃果實") : x.k === "hug1" ? ttT("第一次抱抱") : x.k === "hike1" ? ttT("第一次一起出門") : /^ann:y/.test(x.k) ? ttT("相遇 {n} 週年").replace("{n}", x.k.slice(5)) : /^ann:d/.test(x.k) ? ttT("相遇第 {n} 天").replace("{n}", x.k.slice(5)) : /^gift:/.test(x.k) && PET_GIFTS[x.k.slice(5)] ? `${ttT("帶回來一個")}${ttCJK() ? "" : " "}${ttT(PET_GIFTS[x.k.slice(5)][0])}` : "";
  const dt = t => { const z = new Date(t); return isNaN(z) ? "" : `${z.getFullYear()}/${z.getMonth() + 1}/${z.getDate()}`; };
  const rows = all.filter(x => txt(x)).map(x => `<div class="diary-row"><span class="diary-ic">${x.i != null && typeof PET_ART !== "undefined" ? PET_ART.svg(x.i) : `<span class="inline-ic">${ic("footprints")}</span>`}</span><span class="diary-t">${escHtml(txt(x))}</span><time>${dt(x.t)}</time></div>`).join("");
  return rows || `<div class="diary-empty">${ttT("還沒有紀錄")}</div>`;
}
function openPetDex() {
  if (document.querySelector('[data-ov="petdex"]')) return;   // 防連點疊層
  const km = totalKm(), reached = petStageIndex(km), next = PET_STAGES[reached + 1];
  const Q = ttUnknown();
  const stages = PET_STAGES.map((s, i) => {
    const unlocked = i <= reached, isNow = i === reached;
    return `<div class="dex-row${unlocked ? "" : " locked"}${isNow ? " now" : ""}">
      <div class="dex-e">${unlocked && typeof PET_ART !== "undefined" ? PET_ART.svg(i) : (unlocked ? s.e : `<svg class="ic dex-lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`)}</div>
      <div class="dex-body">
        <div class="dex-h"><b>${unlocked ? ttT(s.n) : Q}</b><span class="lv-chip lvt-${Math.min(i + 1, 7)}">Lv.${i + 1}</span>${isNow ? `<span class="dex-now">${ttT("目前")}</span>` : ""}</div>
        <div class="dex-k">${i === 0 ? ttT("起始型態") : ttT(`成長里程 ${s.km} km 解鎖`)}</div>
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
    <div class="dex-sec">${ttT("夥伴日記")}</div>
    <div class="diary-list">${petDiaryHtml()}</div>
    <div class="dex-sec">${ttT(`進化圖鑑（共 ${PET_STAGES.length} 階）`)}</div>
    <div class="dex-list">${stages}</div>
  </div>`;
  document.body.appendChild(ov);
  let _a11y = null;
  const close = () => { if (_a11y) _a11y(); ov.remove(); };
  if (typeof ttModalA11y === "function") _a11y = ttModalA11y(ov, close, { focus: "#petDexClose" });
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
  if (i > prev) { setTimeout(() => celebrateEvolve(PET_STAGES[i], i + 1), 800); window.__petEvolving = true; petDiaryAdd("evo", i); try { if (typeof window !== "undefined" && window.scheduleCloudBackup) window.scheduleCloudBackup(); } catch (e) { /* */ } }   // 寵物進化也自動備份
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
