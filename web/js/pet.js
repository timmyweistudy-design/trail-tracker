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
function petTapLine(k) {
  const h = new Date().getHours(), tm = PET_TAPS_TIME.find(([a, b]) => h >= a && h < b);
  const pool = (PET_TAPS[k] || PET_TAPS.content).concat(tm ? [tm[2]] : []);
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
  localStorage.setItem("tt_pet_aff_t", new Date().toISOString());
}
// 每日任務/目標一律用「本地日期」：toISOString 是 UTC，台灣早上 8 點前會被算成前一天，
// 造成任務進度看起來莫名被刷新。跨日以本地午夜為準。
function localDayOf(d) { const t = new Date(d); if (isNaN(t)) return ""; return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; }
function todayStr() { return localDayOf(new Date()); }
function localDay(iso) { return localDayOf(iso); }
// 本地年月／年份（分析、年度回顧、匯出用）：以前直接切 ISO 字串＝UTC，月初 8 點前那趟會算到上個月
function localYM(iso) { return localDayOf(iso).slice(0, 7); }
function localYear(iso) { return localDayOf(iso).slice(0, 4); }
const FEED_COOLDOWN = 8 * 3600e3;   // 餵食冷卻 8 小時
function feedCooldownMs() { return Math.max(0, FEED_COOLDOWN - (Date.now() - (+(localStorage.getItem("tt_pet_fed_t") || 0)))); }
function canFeedNow() { return berriesBalance() >= 3 && feedCooldownMs() === 0; }   // 「現在能不能餵」（看 8h 冷卻，非每日）
function feedPet() {
  if (feedCooldownMs() > 0) { toast(`${ttT("牠還飽著，約")} ${Math.ceil(feedCooldownMs() / 3600e3)} ${ttT("小時後再餵")}`); return; }
  if (berriesBalance() < 3) { toast(ttT("果實不夠，再多走一點就有")); return; }
  const heartsBefore = petHearts();
  localStorage.setItem("tt_pet_berry_spent", String((+(localStorage.getItem("tt_pet_berry_spent") || 0)) + 3));
  bumpAffinity(15);
  localStorage.setItem("tt_pet_fed_t", String(Date.now()));
  const gain = heartsBefore >= 5 ? 0.5 : 0.3;                  // 親密度滿時照顧獎勵更多
  localStorage.setItem("tt_pet_feedkm", String(+(feedBonusKm() + gain).toFixed(2)));
  ttBuzz([20, 30, 20]);
  toast(`${ttT("牠吃得好開心")}・${ttT("成長")} +${gain} km`);
  checkPetEvolve();
  renderPet();
  const em = $("#petEmoji"); if (em) { void em.offsetWidth; em.classList.add("tap"); }   // 開心扭動
  petBurst("❤️", 1);   // 跳一個紅色愛心
}
// 帽子要用果實解鎖（果實除了餵食之外多一個用途）；解過的永久擁有
const HAT_COST = 10;
function hatsOwned() { try { return new Set(JSON.parse(localStorage.getItem("tt_pet_hats_owned")) || ["none"]); } catch { return new Set(["none"]); } }
function petStageIndex(km) { let i = 0; for (let k = 0; k < PET_STAGES.length; k++) if (km >= PET_STAGES[k].km) i = k; return i; }
function petName() { return localStorage.getItem("tt_pet_name") || ""; }
function petHat() { return localStorage.getItem("tt_pet_hat") || "none"; }   // A5 配件（Premium 裝扮）
function petHatSvg(i) { return (typeof PET_ART !== "undefined" && PET_ART.hat) ? PET_ART.hat(petHat(), i) : ""; }
// 裝扮選擇器：戴帽子在夥伴頭上。
// 免費版也能打開：自己掙來的（每月挑戰的登山頭巾）和以前換過的照樣能戴；用果實換新配件是 PRO 福利。
const FREE_HATS = new Set(["none", "bandana"]);
function openHatPicker() {
  if (document.querySelector('[data-ov="pethat"]')) return;
  const pro = typeof Premium !== "undefined" && Premium.isOn();
  const i = petStageIndex(totalKm()), cur = petHat(), owned = hatsOwned();
  const opts = PET_ART.HAT_IDS.map(id => {
    const has = owned.has(id), quest = id === "bandana";   // 登山頭巾：完成每月挑戰才拿得到，不能買
    const proLock = !pro && !FREE_HATS.has(id) && !has;   // 以前當會員時換到的照樣能戴；新換的才要 PRO
    return `<button class="hat-opt${id === cur ? " on" : ""}${has && !proLock ? "" : " locked"}${quest && !has ? " quest" : ""}" data-hat="${id}"><div class="hat-prev">${PET_ART.svg(i)}${PET_ART.hat(id, i)}</div><div class="hat-lbl">${ttT(PET_ART.HAT_LABEL[id])}</div>${proLock ? `<div class="hat-cost"><span class="pro-tag">PRO</span></div>` : has ? "" : quest ? `<div class="hat-cost hat-quest">${ic("flag")} <span>${ttT("每月挑戰")}</span></div>` : `<div class="hat-cost">${BERRY_SVG}${HAT_COST}</div>`}</button>`;
  }).join("");
  const ov = document.createElement("div"); ov.className = "pet-modal"; ov.dataset.ov = "pethat";
  ov.innerHTML = `<div class="pet-modal-card"><button class="sheet-close" id="hatClose" aria-label="${ttT("關閉")}">${ic("x")}</button><h2>${ic("sparkle")} ${ttT("幫夥伴裝扮")}</h2><p class="dex-intro">${ttT("用果實換新配件，換過的就一直是你的。")}</p><div class="hat-bal">${ttT("你有")} ${BERRY_SVG}<b>${berriesBalance()}</b></div><div class="hat-grid">${opts}</div></div>`;
  document.body.appendChild(ov);
  let _a11y = null;
  const close = () => { if (_a11y) _a11y(); ov.remove(); };
  if (typeof ttModalA11y === "function") _a11y = ttModalA11y(ov, close, { focus: "#hatClose" });
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  ov.querySelector("#hatClose").addEventListener("click", close);
  ov.querySelectorAll(".hat-opt").forEach(btn => btn.addEventListener("click", async () => {
    const id = btn.dataset.hat, own = hatsOwned();
    if (!FREE_HATS.has(id) && !own.has(id) && !_proGate()) return;   // 用果實換新配件：PRO（已擁有的照樣能戴）
    if (!own.has(id) && id === "bandana") { toast(ttT("完成一次每月挑戰就會解鎖，在夥伴頁看進度")); return; }
    if (!own.has(id)) {
      if (berriesBalance() < HAT_COST) { toast(`${ttT("果實還差")} ${HAT_COST - berriesBalance()}`); return; }
      const ok = typeof ttConfirm === "function" ? await ttConfirm(`${ttT("換上")}${ttSp()}${ttQuote(ttT(PET_ART.HAT_LABEL[id]))}${ttCJK() ? "？" : "?"}${ttParen(`${HAT_COST} ${ttT("顆果實")}`)}`, ttT("換上"), ttT("再想想")) : true;
      if (!ok) return;
      localStorage.setItem("tt_pet_berry_spent", String((+(localStorage.getItem("tt_pet_berry_spent") || 0)) + HAT_COST));
      own.add(id); localStorage.setItem("tt_pet_hats_owned", JSON.stringify([...own]));
      btn.classList.remove("locked"); const c = btn.querySelector(".hat-cost"); if (c) c.remove();
      const bal = ov.querySelector(".hat-bal b"); if (bal) bal.textContent = berriesBalance();
    }
    localStorage.setItem("tt_pet_hat", id);
    ov.querySelectorAll(".hat-opt").forEach(b => b.classList.toggle("on", b === btn));
    renderPet();
    ttBuzz(15);
  }));
}
// 供社群同步：寵物名字/等級/成長里程，讓好友看到你的進度
function petStats() {
  const km = totalKm(), i = petStageIndex(km), st = PET_STAGES[i];
  return { name: petName() || st.n, level: i + 1, stage: st.n, emoji: st.e, km: +km.toFixed(1) };
}
function petHatch() { let h = localStorage.getItem("tt_pet_hatch"); if (!h) { h = new Date().toISOString(); localStorage.setItem("tt_pet_hatch", h); } return h; }
// 「同行天數」從第一次真的出門健行算（以前從第一次打開夥伴頁算，沒出過門也在累積）
function petDaysTogether() {
  const recs = realRecords(); if (!recs.length) return 0;
  const first = recs.reduce((m, r) => (r.date && r.date < m ? r.date : m), recs[0].date);
  return daysSince(first) + 1;
}
function daysSince(iso) { const t = new Date(iso).getTime(); if (!isFinite(t)) return 0; return Math.max(0, Math.floor((Date.now() - t) / 864e5)); }   // 防護：孵化日異常/舊格式 → 回 0（不再顯示 NaN）
function weekIndex(d) { const dt = new Date(d); dt.setHours(0, 0, 0, 0); dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); return Math.round(dt / 6048e5); }
function weeksStreak() {
  const recs = realRecords(); if (!recs.length) return 0;
  const weeks = new Set(recs.map(r => weekIndex(r.date)));
  const now = weekIndex(Date.now());
  let w = weeks.has(now) ? now : now - 1, s = 0;
  while (weeks.has(w)) { s++; w--; }
  return s;
}
function petMood() {
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
  const d = new Date(); d.setHours(0, 0, 0, 0);
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
  const doy = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 864e5);
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
    ttBuzz(r.mile ? [120, 60, 120] : 40);
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
  const art = (typeof PET_ART !== "undefined") ? PET_ART.svg(i) : `<span style="font-size:70px">${st.e}</span>`;
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
  box.innerHTML = `<div class="pet-card${i >= 6 ? " final" : ""}" style="--habitat:${PET_BG[i]}">
    <div class="pet-habitat">${(typeof PET_ART !== "undefined" && PET_ART.habitat) ? PET_ART.habitat(i) : ""}<span class="pet-ff" style="left:16%;top:24%"></span><span class="pet-ff" style="left:78%;top:18%;animation-delay:2.1s;animation-duration:7.5s"></span><span class="pet-ff" style="left:60%;top:40%;animation-delay:3.4s;animation-duration:5.5s"></span></div>
    <div class="pet-stage">
      <div class="pet-bubble">${ttT(mood.t)}</div>
      <div id="petEmoji" class="pet-m-${mood.k || "content"}" role="button" tabindex="0" aria-label="${ttT("摸摸")} ${escHtml(nm || ttT(st.n))}">${art}${petHatSvg(i)}${petMoodFx(mood.k)}</div>
      <div class="pet-shadow"></div>
      <div class="pet-idline"><span class="pet-name">${escHtml(nm || ttT(st.n))}</span><span class="lv-chip lvt-${Math.min(i + 1, 7)} pet-lv-chip">Lv.${i + 1}</span></div>
      <div class="pet-tools"><button class="pet-tool" id="petDress">${ic("sparkle")}${ttT("裝扮")}</button>${(typeof Premium !== "undefined" && Premium.isOn()) ? `<button class="pet-tool" id="petRename">${ic("pencil")}${ttT("改名")}</button>` : ""}</div>
      <div class="pet-evo"><div class="pet-evo-top">${evoTop}</div>${prog}</div>
    </div>
    <div class="pet-meters">
      <div class="pet-meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${en == null ? 0 : en}" aria-label="${ttT("活力")}"><span>${ttT("活力")} <b>${en == null ? "—" : en}</b></span><div class="mtrack"><i class="m-en" style="width:${en == null ? 0 : en}%"></i></div></div>
      <div class="pet-meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${lovePct}" aria-label="${ttT("親密")}"><span>${ttT("親密")} <b>${h}/5</b></span><div class="mtrack"><i class="m-love" style="width:${lovePct}%"></i></div></div>
      <button class="pet-help" id="petHelp" aria-label="${ttT("活力和親密是什麼？")}">?</button>
    </div>
    <div class="pet-chips">
      <div class="pet-chip"><div class="cv">${km.toFixed(1)}<small> km</small></div><div class="cl">${ttT("成長里程")}</div></div>
      <div class="pet-chip"><div class="cv">${days}<small> ${ttT("天")}</small></div><div class="cl">${ttT("同行")}</div></div>
      <div class="pet-chip"><div class="cv">${streak}<small> ${ttT("週")}</small></div><div class="cl">${ttT("週週有走")}</div></div>
    </div>
    <div class="pet-acts">
      <button class="pet-btn feed" id="petFeed"${canFeed ? "" : " disabled"}>${BERRY_SVG}<span>${feedLbl}</span>${need > 0 || cd > 0 ? "" : `<b class="feed-bal">${berries}</b>`}</button>
      <button class="pet-btn" id="petDex">${ic("book")} ${ttT("手冊")}</button>
      <button class="pet-btn" id="petRec">${ic("compass")} ${ttT("去走")}</button>
    </div>
  </div>`;
  const em = $("#petEmoji");
  const poke = () => {
    em.classList.remove("tap"); void em.offsetWidth; em.classList.add("tap");
    ttBuzz(20);
    petBurst("❤️", 1);
    toast(petTapLine(mood.k));
  };
  if (em) { em.addEventListener("click", poke); em.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); poke(); } }); }
  $("#petDex").addEventListener("click", openPetDex);
  $("#petRec").addEventListener("click", petRecommend);
  $("#petFeed").addEventListener("click", feedPet);
  $("#petHelp").addEventListener("click", () => {
    if (typeof ttAlertBox === "function") ttAlertBox(ttT("活力：出門走路就會補滿，太久沒出門會慢慢掉。\n親密：餵食、完成每日任務會增加；親密滿 5 顆心時，餵食給的成長更多。\n兩個都不會讓夥伴退化，放心。"));
  });
  { const dr = $("#petDress"); if (dr) dr.addEventListener("click", openHatPicker); }
  const ren = $("#petRename");   // Premium：為夥伴命名
  if (ren) ren.addEventListener("click", () => {
    askInput({ title: ttT("幫你的山林夥伴取個名字"), value: petName() || ttT(st.n), max: 12 }).then(v => {
      if (v != null) { localStorage.setItem("tt_pet_name", v.trim().slice(0, 12)); renderPet(); }
    });
  });
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
      const d = new Date(); tag = cands[(d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate()) % cands.length];
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
  ov.innerHTML = `<div class="evolve-bg">${(A && PET_ART.habitat) ? PET_ART.habitat(newIdx) : ""}</div><div class="evolve-card">
    <div class="evolve-spark"></div>
    ${stageHtml}
    <div class="evolve-h">${ttT("進化了！")}</div>
    <div class="evolve-n">${escHtml(petName() || ttT(st.n))} <span class="lv-chip lvt-${Math.min(lv, 7)}">Lv.${lv}</span></div>
    <div class="evolve-d">${ttT(st.d)}</div>
    <button class="btn primary" id="evolveOk">${ttT("太棒了")}</button>
  </div>`;
  document.body.appendChild(ov);
  ttBuzz([40, 60, 30, 40, 120]);
  const close = () => ov.remove();
  ov.querySelector("#evolveOk").addEventListener("click", close);
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
}
// 走完後檢查是否進化（跨次也記住）
function checkPetEvolve() {
  const i = petStageIndex(totalKm());
  const prev = +(localStorage.getItem("tt_pet_stage") || 0);
  if (i !== prev) localStorage.setItem("tt_pet_stage", i);
  if (i > prev) { setTimeout(() => celebrateEvolve(PET_STAGES[i], i + 1), 800); try { if (typeof window !== "undefined" && window.scheduleCloudBackup) window.scheduleCloudBackup(); } catch (e) { /* */ } }   // 寵物進化也自動備份
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
