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
const PET_TAPS = ["要再去走走嗎？", "今天也一起爬山吧！", "我準備好出發了！", "下一座山在等我們～", "腳力越來越好囉！", "謝謝你帶我看風景 🌲"];
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
// 🍓 果實：每走 1 km 得 1 顆，餵食消耗
function berriesEarned() { return Math.floor(realTotalKm()); }
function berryBonus() { return +(localStorage.getItem("tt_pet_berry_bonus") || 0); }   // 每日任務等額外果實
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
const FEED_COOLDOWN = 8 * 3600e3;   // 餵食冷卻 8 小時
function feedCooldownMs() { return Math.max(0, FEED_COOLDOWN - (Date.now() - (+(localStorage.getItem("tt_pet_fed_t") || 0)))); }
function canFeedToday() { return berriesBalance() >= 3 && feedCooldownMs() === 0; }
function feedPet() {
  if (feedCooldownMs() > 0) { toast(`還在休息，約 ${Math.ceil(feedCooldownMs() / 3600e3)} 小時後可再餵 🍃`); return; }
  if (berriesBalance() < 3) { toast("果實不足，多走幾步才有果實 🍓"); return; }
  const heartsBefore = petHearts();
  localStorage.setItem("tt_pet_berry_spent", String((+(localStorage.getItem("tt_pet_berry_spent") || 0)) + 3));
  bumpAffinity(15);
  localStorage.setItem("tt_pet_fed_t", String(Date.now()));
  const gain = heartsBefore >= 5 ? 0.5 : 0.3;                  // 親密度滿時照顧獎勵更多
  localStorage.setItem("tt_pet_feedkm", String(+(feedBonusKm() + gain).toFixed(2)));
  if (navigator.vibrate) navigator.vibrate([20, 30, 20]);
  const em = $("#petEmoji"); if (em) { em.classList.remove("tap"); void em.offsetWidth; em.classList.add("tap"); }
  toast(`餵食成功！🍓 親密度上升、照顧 +${gain}km`);
  checkPetEvolve();
  renderPet();
}
function petStageIndex(km) { let i = 0; for (let k = 0; k < PET_STAGES.length; k++) if (km >= PET_STAGES[k].km) i = k; return i; }
function petName() { return localStorage.getItem("tt_pet_name") || ""; }
// 供社群同步：寵物名字/等級/成長里程，讓好友看到你的進度
function petStats() {
  const km = totalKm(), i = petStageIndex(km), st = PET_STAGES[i];
  return { name: petName() || st.n, level: i + 1, stage: st.n, emoji: st.e, km: +km.toFixed(1) };
}
function petHatch() { let h = localStorage.getItem("tt_pet_hatch"); if (!h) { h = new Date().toISOString(); localStorage.setItem("tt_pet_hatch", h); } return h; }
function daysSince(iso) { return Math.max(0, Math.floor((Date.now() - new Date(iso)) / 864e5)); }
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
  if (!last) return { e: "🌙", t: "等你帶牠出門走走" };
  const d = daysSince(last.date);
  if (d <= 1) return { e: "😊", t: "剛運動完，活力滿滿！" };
  if (d <= 4) return { e: "🙂", t: "狀態不錯，隨時能出發" };
  if (d <= 9) return { e: "🥺", t: "有點想念山林了…" };
  return { e: "😴", t: "好久沒出門，懶洋洋的" };
}
// 活力：越久沒出門越低，出門健行恢復（約 7 天歸零）
function energy() {
  const last = realRecords()[0]; if (!last) return 25;
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
  const cur = { d, km: todayKm(), asc: todayAscent(), trips: todayTrips() };
  if (hi && hi.d === d) {
    cur.km = Math.max(cur.km, +hi.km || 0);
    cur.asc = Math.max(cur.asc, +hi.asc || 0);
    cur.trips = Math.max(cur.trips, +hi.trips || 0);
  }
  try { localStorage.setItem("tt_quest_hi", JSON.stringify(cur)); } catch { /* ignore */ }
  return cur;
}
// 每日任務
function renderQuests() {
  const box = $("#petQuests"); if (!box) return;
  const p = questProgress();
  const km = p.km, asc = p.asc, trips = p.trips, streak = daysStreak();
  const quests = [
    { icon: "footprints", label: "今日出門健行", cur: trips, goal: 1, dec: 0 },
    { icon: "ruler", label: "今日里程 1.5 km", cur: km, goal: 1.5, dec: 1 },
    { icon: "mountain", label: "今日爬升 50 m", cur: asc, goal: 50, dec: 0 },
  ];
  const allDone = quests.every(q => q.cur >= q.goal);
  const claimed = localStorage.getItem("tt_quest_claim") === todayStr();
  box.innerHTML = `<div class="section-title">${ic("calendar")}每日任務${streak >= 2 ? ` <span class="streak-chip">${ic("flame")} 連續 ${streak} 天</span>` : ""}</div>
    <div class="quest-list">${quests.map(q => { const done = q.cur >= q.goal; return `<div class="quest ${done ? "done" : ""}"><span class="q-ic">${ic(q.icon)}</span><div class="q-body"><div class="q-l">${q.label}</div><div class="q-bar"><i style="width:${Math.min(100, q.cur / q.goal * 100).toFixed(0)}%"></i></div></div><span class="q-chk">${done ? "✓" : (q.dec ? q.cur.toFixed(q.dec) : Math.round(q.cur))}</span></div>`; }).join("")}</div>
    <button class="btn ${allDone && !claimed ? "primary" : "ghost"}" id="qClaim"${allDone && !claimed ? "" : " disabled"}>${claimed ? "今日獎勵已領 ✓" : (allDone ? "領取 +5 🍓" : "完成全部任務可領 🍓")}</button>`;
  const cb = $("#qClaim");
  if (cb && allDone && !claimed) cb.addEventListener("click", () => {
    addBerryBonus(5); localStorage.setItem("tt_quest_claim", todayStr()); bumpAffinity(5);
    toast("每日任務完成！+5 🍓"); confetti && confetti(); renderQuests(); renderPet();
  });
}
function renderPet() {
  const box = $("#petCard");
  if (!box) return;
  const km = totalKm(), i = petStageIndex(km), st = PET_STAGES[i], next = PET_STAGES[i + 1];
  const nm = petName(), mood = petMood(), days = daysSince(petHatch()), streak = weeksStreak(), en = energy();
  const berries = berriesBalance(), h = petHearts(), bonus = feedBonusKm(), canFeed = canFeedToday(), cd = feedCooldownMs();
  let prog = "", sub;
  if (next) {
    const pct = Math.max(2, Math.min(100, Math.round((km - st.km) / (next.km - st.km) * 100)));
    sub = `再 <b>${(next.km - km).toFixed(1)}</b> km 進化成 ${next.e} ${next.n}`;
    prog = `<div class="pet-bar"><i style="width:${pct}%"></i></div>`;
  } else sub = "已是最終型態 ✨ 繼續同行！";
  box.innerHTML = `<div class="pet-card${i >= 6 ? " final" : ""}" style="background:${PET_BG[i]}">
    <div class="pet-emoji" id="petEmoji" role="img" aria-label="${st.n}">${st.e}</div>
    <div class="pet-info">
      <div class="pet-name">${nm || st.n}<span class="lv-chip lvt-${Math.min(i + 1, 7)} pet-lv-chip">Lv.${i + 1}</span>${(typeof Premium !== "undefined" && Premium.isOn()) ? `<button class="pet-edit" id="petRename" title="命名" aria-label="命名">${ic("pencil")}</button>` : ""}</div>
      <div class="pet-mood">${mood.e} ${mood.t}　<span class="pet-hearts">${"❤️".repeat(h)}${"🤍".repeat(5 - h)}</span></div>
      <div class="pet-energy"><span class="pe-l">活力 ${en}</span><div class="pe-bar"><i style="width:${en}%"></i></div></div>
      <div class="pet-sub">${nm ? st.n + "・" : ""}已走 <b>${km.toFixed(1)}</b> km${bonus > 0 ? `（含照顧 +${bonus.toFixed(1)}）` : ""}・同行 <b>${days}</b> 天${streak >= 2 ? `・<span class="inline-ic">${ic("flame")}</span>連續${streak}週` : ""}</div>
      <div class="pet-sub" style="opacity:.9">${sub}</div>
      ${prog}
      <div class="pet-care">
        <span class="pet-berry">🍓 ${berries}</span>
        <button class="pet-btn feed" id="petFeed"${canFeed ? "" : " disabled"}>${cd > 0 ? `🍃 ${Math.ceil(cd / 3600e3)} 小時後可餵` : "🍖 餵食 (3🍓)"}</button>
      </div>
      <div class="pet-btns">
        <button class="pet-btn" id="petDex">${ic("book")} 夥伴手冊</button>
        <button class="pet-btn" id="petRec">${ic("compass")} 帶我去走</button>
      </div>
    </div>
  </div>`;
  const em = $("#petEmoji");
  if (em) em.addEventListener("click", () => {
    em.classList.remove("tap"); void em.offsetWidth; em.classList.add("tap");
    if (navigator.vibrate) navigator.vibrate(20);
    toast(PET_TAPS[Math.floor(Math.random() * PET_TAPS.length)]);
  });
  $("#petDex").addEventListener("click", openPetDex);
  $("#petRec").addEventListener("click", petRecommend);
  $("#petFeed").addEventListener("click", feedPet);
  const ren = $("#petRename");   // Premium：為夥伴命名
  if (ren) ren.addEventListener("click", () => {
    askInput({ title: "幫你的山林夥伴取個名字", value: petName() || st.n, max: 12 }).then(v => {
      if (v != null) { localStorage.setItem("tt_pet_name", v.trim().slice(0, 12)); renderPet(); }
    });
  });
}


// 夥伴推薦一條主題
function petRecommend() {
  const picks = [["tag:瀑布", "瀑布"], ["tag:古道", "古道"], ["tag:海景", "海景"], ["tag:森林", "森林"], ["family", "親子友善"], ["tag:湖泊", "湖泊"]];
  const [f, label] = picks[Math.floor(Math.random() * picks.length)];
  document.querySelector('.tab[data-view="explore"]').click();
  activeFilters = new Set([f]); activeRegions.clear(); curQuery = ""; $("#searchInput").value = "";
  syncFilterUI(); syncRegionUI(); updateFilterDot(); render();
  toast(`夥伴想去走「${label}」！`);
}
// 成就徽章
function petBadges() {
  const recs = realRecords();
  const n = recs.length;
  const km = recs.reduce((s, r) => s + (r.distanceKm || 0), 0);
  const asc = recs.reduce((s, r) => s + (r.ascent || 0), 0);
  const maxOne = recs.reduce((m, r) => Math.max(m, r.distanceKm || 0), 0);
  const hrs = recs.map(r => new Date(r.date).getHours());
  const early = hrs.some(h => h < 7), night = hrs.some(h => h >= 19);
  const done = (typeof Store.doneCount === "function") ? Store.doneCount() : 0;
  const favCount = TRAILS.filter(t => Store.isFav(t.id)).length;
  const wk = weeksStreak(), dstreak = (typeof daysStreak === "function") ? daysStreak() : 0;
  const list = [
    { e: "👣", n: "初心者", got: n >= 1, d: "完成第一次記錄" },
    { e: "🥾", n: "常客", got: n >= 10, d: "累積 10 次出行" },
    { e: "🎒", n: "老山友", got: n >= 30, d: "累積 30 次出行" },
    { e: "🧗", n: "山痴", got: n >= 100, d: "累積 100 次出行" },
    { e: "📏", n: "50K", got: km >= 50, d: "總里程 50 km" },
    { e: "💯", n: "百K俱樂部", got: km >= 100, d: "總里程 100 km" },
    { e: "🚀", n: "300K", got: km >= 300, d: "總里程 300 km" },
    { e: "🏆", n: "縱橫五百", got: km >= 500, d: "總里程 500 km" },
    { e: "⛰️", n: "爬升新手", got: asc >= 1000, d: "總爬升 1000 m" },
    { e: "🦅", n: "爬升大師", got: asc >= 3000, d: "總爬升 3000 m" },
    { e: "🗻", n: "玉山高度", got: asc >= 3952, d: "總爬升 3952 m（一座玉山）" },
    { e: "🏔️", n: "聖母峰高度", got: asc >= 8848, d: "總爬升 8848 m（一座聖母峰）" },
    { e: "🏃", n: "健行馬拉松", got: maxOne >= 10, d: "單次步行 ≥ 10 km" },
    { e: "🥇", n: "半馬腳力", got: maxOne >= 21, d: "單次步行 ≥ 21 km" },
    { e: "✅", n: "踏遍五徑", got: done >= 5, d: "完成 5 條步道" },
    { e: "🗺️", n: "步道收藏家", got: done >= 20, d: "完成 20 條步道" },
    { e: "⭐", n: "收藏迷", got: favCount >= 10, d: "收藏 10 條步道" },
    { e: "🌅", n: "早起鳥", got: early, d: "清晨 7 點前出發" },
    { e: "🌙", n: "夜行者", got: night, d: "晚間 7 點後出發" },
    { e: "📅", n: "連續一週", got: dstreak >= 7, d: "連續 7 天健行" },
    { e: "🔥", n: "四週堅持", got: wk >= 4, d: "連續 4 週都有走" },
  ];
  // 成就一旦解鎖就永久保留：舊紀錄被容量保護裁掉（最多存 100 筆）時，重算會低於門檻，
  // 所以把解鎖過的名字存進 tt_badges_got，顯示時取聯集。
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem("tt_badges_got")) || []; } catch { /* ignore */ }
  const got = new Set(saved);
  let changed = false;
  for (const b of list) {
    if (b.got && !got.has(b.n)) { got.add(b.n); changed = true; }
    if (got.has(b.n)) b.got = true;
  }
  if (changed) try { localStorage.setItem("tt_badges_got", JSON.stringify([...got])); } catch { /* ignore */ }
  return list;
}
// 成就勳章專區（夥伴頁）
function renderBadges() {
  const box = $("#petBadges"); if (!box) return;
  const list = petBadges(), got = list.filter(b => b.got).length;
  box.innerHTML = `<div class="section-title">${ic("medal")}成就勳章 <span class="badge-count">${got} / ${list.length}</span></div>
    <div class="ach-grid">${list.map(b => `<div class="ach${b.got ? "" : " locked"}"><div class="ach-e">${b.got ? b.e : "🔒"}</div><div class="ach-n">${b.n}</div><div class="ach-d">${b.d}</div></div>`).join("")}</div>`;
}
// 夥伴手冊：進化圖鑑 + 成就徽章
function openPetDex() {
  if (document.querySelector('[data-ov="petdex"]')) return;   // 防連點疊層
  const km = totalKm(), reached = petStageIndex(km), next = PET_STAGES[reached + 1];
  const stages = PET_STAGES.map((s, i) => {
    const unlocked = i <= reached, isNow = i === reached;
    return `<div class="dex-row${unlocked ? "" : " locked"}${isNow ? " now" : ""}">
      <div class="dex-e">${unlocked ? s.e : "❔"}</div>
      <div class="dex-body">
        <div class="dex-h"><b>${unlocked ? s.n : "？？？"}</b><span class="lv-chip lvt-${Math.min(i + 1, 7)}">Lv.${i + 1}</span>${isNow ? `<span class="dex-now">目前</span>` : ""}</div>
        <div class="dex-k">${i === 0 ? "起始型態" : `成長里程 ${s.km} km 解鎖`}</div>
        <div class="dex-d">${unlocked ? s.d : "繼續健行，解鎖牠的樣貌與故事…"}</div>
      </div>
    </div>`;
  }).join("");
  const tip = next ? `再走 <b>${(next.km - km).toFixed(1)}</b> km 進化成 ${next.e} ${next.n}` : "已達最終型態 ✨ 與你繼續同行";
  const ov = document.createElement("div");
  ov.className = "pet-modal"; ov.dataset.ov = "petdex";
  ov.innerHTML = `<div class="pet-modal-card">
    <button class="sheet-close" id="petDexClose" aria-label="關閉">✕</button>
    <h2>夥伴手冊</h2>
    <p class="dex-intro">你的夥伴會隨著累積的<b>成長里程</b>一階階進化 —— 走路的里程、餵食、每日任務與好友送的果實，都會讓牠成長。</p>
    <div class="dex-tip"><span class="inline-ic">${ic("footprints")}</span> ${tip}</div>
    <div class="dex-sec">進化圖鑑（共 ${PET_STAGES.length} 階）</div>
    <div class="dex-list">${stages}</div>
    <p class="dex-foot">💡 想看成就勳章？回「夥伴」頁往下捲就有。</p>
  </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  ov.querySelector("#petDexClose").addEventListener("click", close);
}
// 全螢幕進化慶祝
function celebrateEvolve(st, lv) {
  if (document.querySelector('[data-ov="evolve"]')) return;   // 防連點疊層
  const ov = document.createElement("div");
  ov.className = "evolve-ov"; ov.dataset.ov = "evolve";
  ov.innerHTML = `<div class="evolve-card">
    <div class="evolve-spark"></div>
    <div class="evolve-emoji">${st.e}</div>
    <div class="evolve-h">進化！</div>
    <div class="evolve-n">${petName() || st.n} <span class="lv-chip lvt-${Math.min(lv, 7)}">Lv.${lv}</span></div>
    <div class="evolve-d">${st.d}</div>
    <button class="btn primary" id="evolveOk">太棒了</button>
  </div>`;
  document.body.appendChild(ov);
  if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
  const close = () => ov.remove();
  ov.querySelector("#evolveOk").addEventListener("click", close);
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
}
// 走完後檢查是否進化（跨次也記住）
function checkPetEvolve() {
  const i = petStageIndex(totalKm());
  const prev = +(localStorage.getItem("tt_pet_stage") || 0);
  if (i !== prev) localStorage.setItem("tt_pet_stage", i);
  if (i > prev) setTimeout(() => celebrateEvolve(PET_STAGES[i], i + 1), 800);
}
// 記錄頁待機面板（未開始記錄時顯示夥伴/上次/推薦）
function renderRecIdle() {
  const box = $("#recIdle"); if (!box) return;
  if (Recorder.getState && Recorder.getState() !== "idle") { box.style.display = "none"; return; }
  const last = realRecords()[0];
  if (!last) { box.style.display = "none"; return; }
  box.style.display = "block";
  box.innerHTML = `<div class="ridle-row"><span class="inline-ic">${ic("pin")}</span> 上次：${last.trailName || "自由路線"}・<b>${(last.distanceKm || 0).toFixed(2)}</b> km</div>`;
}
// 我的足跡熱力圖：所有真實軌跡疊在一張地圖上
async function openFootprintMap() {
  if (document.querySelector('[data-ov="footmap"]')) return;   // 防連點疊層
  const recs = (await Store.allFull()).filter(r => isFootRec(r) && r.track && r.track.length > 1);
  if (!recs.length) { toast("還沒有可顯示的軌跡，先去走一條吧"); return; }
  const ov = document.createElement("div");
  ov.className = "foot-modal"; ov.dataset.ov = "footmap";
  ov.innerHTML = `<button class="lb-close" id="footClose" aria-label="關閉">✕</button><div id="footMap"></div><div class="foot-cap">我的足跡 · ${recs.length} 段軌跡</div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  $("#footClose").addEventListener("click", close);
  setTimeout(() => {
    const m = L.map("footMap", { zoomControl: true });
    baseTopo().addTo(m);
    const all = [];
    recs.forEach(r => {
      const pts = r.track.map(p => [p.lat, p.lon]);
      L.polyline(trackSegments(r.track).map(s => s.map(p => [p.lat, p.lon])), { color: "#e8893b", weight: 5, opacity: .35 }).addTo(m);   // 疊加＝熱力（gap 分段）
      all.push(...pts);
    });
    if (all.length) m.fitBounds(all, { padding: [30, 30] });
    m.invalidateSize();
  }, 90);
}
// 每日目標環
function todayKm() { const d = todayStr(); return realRecords().filter(r => localDay(r.date) === d).reduce((s, r) => s + (r.distanceKm || 0), 0); }
// （每日目標環已依使用者要求移除；todayKm 仍供每日任務使用）
