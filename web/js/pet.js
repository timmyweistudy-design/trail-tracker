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
const FEED_COOLDOWN = 8 * 3600e3;   // 餵食冷卻 8 小時
function feedCooldownMs() { return Math.max(0, FEED_COOLDOWN - (Date.now() - (+(localStorage.getItem("tt_pet_fed_t") || 0)))); }
function canFeedNow() { return berriesBalance() >= 3 && feedCooldownMs() === 0; }   // 「現在能不能餵」（看 8h 冷卻，非每日）
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
  toast(`餵食成功！🍓 親密度上升、照顧 +${gain}km`);
  checkPetEvolve();
  renderPet();
  const em = $("#petEmoji"); if (em) { void em.offsetWidth; em.classList.add("tap"); }   // 開心扭動
  petBurst("❤️", 1);   // 跳一個紅色愛心
}
function petStageIndex(km) { let i = 0; for (let k = 0; k < PET_STAGES.length; k++) if (km >= PET_STAGES[k].km) i = k; return i; }
function petName() { return localStorage.getItem("tt_pet_name") || ""; }
function petHat() { return localStorage.getItem("tt_pet_hat") || "none"; }   // A5 配件（Premium 裝扮）
function petHatSvg(i) { return (typeof PET_ART !== "undefined" && PET_ART.hat) ? PET_ART.hat(petHat(), i) : ""; }
// Premium 裝扮選擇器：戴帽子在夥伴頭上
function openHatPicker() {
  if (typeof Premium !== "undefined" && Premium.gate && !Premium.gate()) return;   // 非會員→開升級面板
  if (document.querySelector('[data-ov="pethat"]')) return;
  const i = petStageIndex(totalKm()), cur = petHat();
  const opts = PET_ART.HAT_IDS.map(id => `<button class="hat-opt${id === cur ? " on" : ""}" data-hat="${id}"><div class="hat-prev">${PET_ART.svg(i)}${PET_ART.hat(id, i)}</div><div class="hat-lbl">${ttT(PET_ART.HAT_LABEL[id])}</div></button>`).join("");
  const ov = document.createElement("div"); ov.className = "pet-modal"; ov.dataset.ov = "pethat";
  ov.innerHTML = `<div class="pet-modal-card"><button class="sheet-close" id="hatClose" aria-label="${ttT("關閉")}">✕</button><h2>${ic("sparkle")} ${ttT("幫夥伴裝扮")}</h2><p class="dex-intro">${ttT("選一件配件戴在你的山林夥伴頭上。")}</p><div class="hat-grid">${opts}</div></div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  ov.querySelector("#hatClose").addEventListener("click", close);
  ov.querySelectorAll(".hat-opt").forEach(btn => btn.addEventListener("click", () => {
    localStorage.setItem("tt_pet_hat", btn.dataset.hat);
    ov.querySelectorAll(".hat-opt").forEach(b => b.classList.toggle("on", b === btn));
    renderPet();
    if (navigator.vibrate) navigator.vibrate(15);
  }));
}
// 供社群同步：寵物名字/等級/成長里程，讓好友看到你的進度
function petStats() {
  const km = totalKm(), i = petStageIndex(km), st = PET_STAGES[i];
  return { name: petName() || st.n, level: i + 1, stage: st.n, emoji: st.e, km: +km.toFixed(1) };
}
function petHatch() { let h = localStorage.getItem("tt_pet_hatch"); if (!h) { h = new Date().toISOString(); localStorage.setItem("tt_pet_hatch", h); } return h; }
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
  if (!last) return { e: "🌙", t: "等你帶牠出門走走", k: "sleepy" };
  const d = daysSince(last.date);
  if (d <= 1) return { e: "😊", t: "剛運動完，活力滿滿！", k: "happy" };
  if (d <= 4) return { e: "🙂", t: "狀態不錯，隨時能出發", k: "content" };
  if (d <= 9) return { e: "🥺", t: "有點想念山林了…", k: "longing" };
  return { e: "😴", t: "好久沒出門，懶洋洋的", k: "sleepy" };
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
  // #7 連續達成獎勵：基礎 +5，連續每多一天 +1（上限 +5），到 3/7/14/30 天再給里程碑大獎
  const reward = questReward(streak);
  const nextMile = QUEST_MILES.find(m => m.day > streak);
  const streakChip = streak >= 2 ? ` <span class="streak-chip">${ic("flame")} ${ttT("連續")} ${streak} ${ttT("天")}</span>` : "";
  const btnLabel = claimed ? ttT("今日獎勵已領 ✓") : (allDone ? `${ttT("領取")} +${reward.total} 🍓` : ttT("完成全部任務可領 🍓"));
  const mileHint = (!claimed && nextMile) ? `<div class="quest-mile">${ic("flame")} ${ttT("下個連續里程碑")}：${nextMile.day} ${ttT("天")} +${nextMile.bonus} 🍓</div>` : "";
  box.innerHTML = `<div class="section-title">${ic("calendar")}每日任務${streakChip}</div>
    <div class="quest-list">${quests.map(q => { const done = q.cur >= q.goal; return `<div class="quest ${done ? "done" : ""}"><span class="q-ic">${ic(q.icon)}</span><div class="q-body"><div class="q-l">${q.label}</div><div class="q-bar"><i style="width:${Math.min(100, q.cur / q.goal * 100).toFixed(0)}%"></i></div></div><span class="q-chk">${done ? "✓" : (q.dec ? q.cur.toFixed(q.dec) : Math.round(q.cur))}</span></div>`; }).join("")}</div>
    <button class="btn ${allDone && !claimed ? "primary" : "ghost"}" id="qClaim"${allDone && !claimed ? "" : " disabled"}>${btnLabel}</button>${mileHint}`;
  const cb = $("#qClaim");
  if (cb && allDone && !claimed) cb.addEventListener("click", () => {
    const r = questReward(daysStreak());
    addBerryBonus(r.total); localStorage.setItem("tt_quest_claim", todayStr()); bumpAffinity(5);
    toast(`${ttT(r.mile ? "連續達成獎勵！" : "每日任務完成！")} +${r.total} 🍓`);
    if (navigator.vibrate) navigator.vibrate(r.mile ? [120, 60, 120] : 40);
    confetti && confetti(); renderQuests(); renderPet();
  });
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
  const nm = petName(), mood = petMood(), days = daysSince(petHatch()), streak = weeksStreak(), en = energy();
  const berries = berriesBalance(), h = petHearts(), canFeed = canFeedNow(), cd = feedCooldownMs();
  const art = (typeof PET_ART !== "undefined") ? PET_ART.svg(i) : `<span style="font-size:70px">${st.e}</span>`;
  let evoTop, prog = "";
  if (next) {
    const pct = Math.max(2, Math.min(100, Math.round((km - st.km) / (next.km - st.km) * 100)));
    const nextArt = (typeof PET_ART !== "undefined") ? PET_ART.svg(i + 1) : st.e;
    evoTop = `<span><b>${(next.km - km).toFixed(1)}</b> km → ${ttT("進化")}</span><span class="pet-evo-next">${nextArt}<span>${next.n}</span></span>`;
    prog = `<div class="pet-track"><i style="width:${pct}%"></i></div>`;
  } else evoTop = `<span>${ttT("已達最終型態")} ✨</span>`;
  const lovePct = Math.round(h / 5 * 100);
  box.innerHTML = `<div class="pet-card${i >= 6 ? " final" : ""}" style="--habitat:${PET_BG[i]}">
    <div class="pet-habitat">${(typeof PET_ART !== "undefined" && PET_ART.habitat) ? PET_ART.habitat(i) : ""}<span class="pet-ff" style="left:16%;top:24%"></span><span class="pet-ff" style="left:78%;top:18%;animation-delay:2.1s;animation-duration:7.5s"></span><span class="pet-ff" style="left:60%;top:40%;animation-delay:3.4s;animation-duration:5.5s"></span></div>
    <div class="pet-stage">
      <div class="pet-bubble">${mood.e} ${mood.t}</div>
      <div id="petEmoji" class="pet-m-${mood.k || "content"}" role="img" aria-label="${st.n}">${art}${petHatSvg(i)}${petMoodFx(mood.k)}</div>
      <div class="pet-shadow"></div>
      <div class="pet-idline"><span class="pet-name">${nm || st.n}</span><span class="lv-chip lvt-${Math.min(i + 1, 7)} pet-lv-chip">Lv.${i + 1}</span><button class="pet-edit" id="petDress" title="${ttT("裝扮")}" aria-label="${ttT("裝扮")}">${ic("sparkle")}</button>${(typeof Premium !== "undefined" && Premium.isOn()) ? `<button class="pet-edit" id="petRename" title="命名" aria-label="命名">${ic("pencil")}</button>` : ""}</div>
      <div class="pet-evo"><div class="pet-evo-top">${evoTop}</div>${prog}</div>
    </div>
    <div class="pet-meters">
      <div class="pet-meter"><span>${ttT("活力")} ${en}</span><div class="mtrack"><i class="m-en" style="width:${en}%"></i></div></div>
      <div class="pet-meter"><span>${ttT("親密")}</span><div class="mtrack"><i class="m-love" style="width:${lovePct}%"></i></div></div>
    </div>
    <div class="pet-chips">
      <div class="pet-chip"><div class="cv">${km.toFixed(1)}<small> km</small></div><div class="cl">${ttT("累計里程")}</div></div>
      <div class="pet-chip"><div class="cv">${days}<small> ${ttT("天")}</small></div><div class="cl">${ttT("同行")}</div></div>
      <div class="pet-chip"><div class="cv">${streak}<small> ${ttT("週")}</small></div><div class="cl">${streak >= 2 ? "🔥 " : ""}${ttT("連續")}</div></div>
    </div>
    <div class="pet-acts">
      <button class="pet-btn feed" id="petFeed"${canFeed ? "" : " disabled"}>${cd > 0 ? `🍃 ${cd >= 3600e3 ? `${Math.ceil(cd / 3600e3)} ${ttT("小時後可餵")}` : `${Math.ceil(cd / 6e4)} ${ttT("分鐘後可餵")}`}` : `🍖 ${ttT("餵食")} · 🍓${berries}`}</button>
      <button class="pet-btn" id="petDex">${ic("book")} ${ttT("手冊")}</button>
      <button class="pet-btn" id="petRec">${ic("compass")} ${ttT("去走")}</button>
    </div>
  </div>`;
  const em = $("#petEmoji");
  if (em) em.addEventListener("click", () => {
    em.classList.remove("tap"); void em.offsetWidth; em.classList.add("tap");
    if (navigator.vibrate) navigator.vibrate(20);
    petBurst("❤️", 1);
    toast(PET_TAPS[Math.floor(Math.random() * PET_TAPS.length)]);
  });
  $("#petDex").addEventListener("click", openPetDex);
  $("#petRec").addEventListener("click", petRecommend);
  $("#petFeed").addEventListener("click", feedPet);
  { const dr = $("#petDress"); if (dr) dr.addEventListener("click", openHatPicker); }
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
  "千里健行": "dist", "萬米爬升": "climb", "環島達人": "explore", "超馬腳力": "challenge", "兩百次山旅": "trips",
  // B 批新增
  "破曉行者": "time", "十萬步": "trips", "假日山友": "time", "兩百K": "dist",
  "走遍五縣": "explore", "拔升五百": "climb", "四季行者": "time",
  "凌晨出擊": "time", "離島山旅": "explore", "四年一會": "time",
};
// 成就徽章：成就樹，強調長期累積（拿掉一鍵可解的收藏類）
// petBadges 快取：資料未變就重用（一次開頁會被叫多次）；簽章涵蓋紀錄/終身/解鎖/完成數
let _pbCache = null, _pbKey = "";
function _pbSig() {
  const L = (typeof Store !== "undefined" && Store.life) ? Store.life() : {};
  const recN = (typeof Store !== "undefined" && Store.getRecords) ? Store.getRecords().length : 0;
  const done = (typeof Store !== "undefined" && Store.doneCount) ? Store.doneCount() : 0;
  return `${recN}|${L.km || 0}|${L.trips || 0}|${L.asc || 0}|${L.steps || 0}|${done}|${localStorage.getItem("tt_badges_got") || ""}|${localStorage.getItem("tt_ach_maxkm") || 0}|${localStorage.getItem("tt_ach_maxasc") || 0}|${localStorage.getItem("tt_ach_island") || 0}`;
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
  const done = (typeof Store.doneCount === "function") ? Store.doneCount() : 0;
  const wk = weeksStreak(), dstreak = (typeof daysStreak === "function") ? daysStreak() : 0;
  // 縣市探索＋難度征服：只算「真實走過/手動完成」的步道（done），非一鍵收藏
  const doneTrails = (typeof TRAILS !== "undefined" && Array.isArray(TRAILS) && typeof Store !== "undefined" && Store.trailLog) ? TRAILS.filter(t => { try { return (Store.trailLog(t.id) || {}).done; } catch (e) { return false; } }) : [];
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
    island = doneTrails.some(t => ["澎湖縣", "金門縣", "連江縣"].includes(t.region)) || recs.some(r => (r.track || []).some(p => {
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
    { e: "🏔️", n: "聖母峰高度", got: asc >= 8848, d: "總爬升 8848 m（一座聖母峰）", p: [asc, 8848, "m"], t: 5 },
    { e: "🌏", n: "走遍十縣", got: counties >= 10, d: "完成 10 個縣市", p: [counties, 10, "縣"], t: 5 },
    { e: "🎯", n: "步道收藏家", got: done >= 20, d: "完成 20 條步道", p: [done, 20, "條"], t: 5 },
    { e: "❄️", n: "月月不休", got: dstreak >= 30, d: "連續 30 天健行", p: [dstreak, 30, "天"], t: 5 },
    // 傳說
    { e: "👑", n: "千里健行", got: km >= 1000, d: "總里程 1000 km", p: [km, 1000, "km"], t: 6 },
    { e: "🌋", n: "萬米爬升", got: asc >= 10000, d: "總爬升 10000 m", p: [asc, 10000, "m"], t: 6 },
    { e: "🗺️", n: "環島達人", got: counties >= 20, d: "完成 20 個縣市", p: [counties, 20, "縣"], t: 6 },
    { e: "🦿", n: "超馬腳力", got: maxOne >= 42, d: "單次步行 ≥ 42 km", p: [maxOne, 42, "km"], t: 6 },
    { e: "⭐", n: "兩百次山旅", got: n >= 200, d: "累積 200 次出行", p: [n, 200, "次"], t: 6 },
    { e: "🍀", n: "四年一會", got: leap, d: "在閏日 2/29 記錄一次", t: 6, hidden: true },
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
  const gotNames = list.filter(b => b.got).map(b => b.n);
  let seen = null, dates = {};
  try { seen = JSON.parse(localStorage.getItem("tt_badges_seen")); } catch (e) { /* */ }
  try { dates = JSON.parse(localStorage.getItem("tt_badges_date")) || {}; } catch (e) { /* */ }
  const now = new Date().toISOString();
  if (!Array.isArray(seen)) {            // 首次：靜默初始化，不洗版
    for (const nm of gotNames) if (!dates[nm]) dates[nm] = now;
    try { localStorage.setItem("tt_badges_seen", JSON.stringify(gotNames)); localStorage.setItem("tt_badges_date", JSON.stringify(dates)); } catch (e) { /* */ }
    return;
  }
  const seenSet = new Set(seen);
  const fresh = list.filter(b => b.got && !seenSet.has(b.n));
  for (const b of fresh) if (!dates[b.n]) dates[b.n] = now;
  try { localStorage.setItem("tt_badges_seen", JSON.stringify(gotNames)); localStorage.setItem("tt_badges_date", JSON.stringify(dates)); } catch (e) { /* */ }
  if (!fresh.length) return;
  // #19 解鎖獎勵：依階層送果實給寵物
  const reward = fresh.reduce((s, b) => s + (ACH_REWARD[b.t] || 0), 0);
  if (reward > 0 && typeof addBerryBonus === "function") addBerryBonus(reward);
  fresh.slice(0, 3).forEach((b, i) => setTimeout(() => { try { toast(`🏆 ${ttT("解鎖成就")}：${ttT(b.n)}　+${ACH_REWARD[b.t] || 0}🍓`); } catch (e) { /* */ } }, 700 + i * 1700));
  if (fresh.length > 3) setTimeout(() => { try { toast(`🏆 ${ttT("又解鎖")} ${fresh.length - 3} ${ttT("項成就")}　+${reward}🍓`); } catch (e) { /* */ } }, 700 + 3 * 1700);
  if (typeof refreshAchTree === "function") refreshAchTree();
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
  try { const d = JSON.parse(localStorage.getItem("tt_badges_date") || "{}")[name]; if (d) { const t = new Date(d); return `${t.getFullYear()}/${String(t.getMonth() + 1).padStart(2, "0")}/${String(t.getDate()).padStart(2, "0")}`; } } catch (e) { /* */ }
  return "";
}
// 隱藏彩蛋：未達成前只露「？？？」，達成後正常揭曉
function _achHidden(b) { return !!b.hidden && !b.got; }
function _achName(b) { return _achHidden(b) ? "？？？" : ttT(b.n); }
function _achEmo(b) { return _achHidden(b) ? "❓" : b.e; }
function _achDesc(b) { return _achHidden(b) ? ttT("神秘成就，達成後揭曉") : ttT(b.d); }
// 成就資料＋步道 HTML（共用給夥伴頁精簡入口與全螢幕成就步道）
function buildAchTree() {
  const list = petBadges(), got = list.filter(b => b.got).length;
  const nextUp = list.filter(b => !b.got && b.p && b.p[1] > 0)
    .map(b => ({ b, ratio: Math.min(1, b.p[0] / b.p[1]) }))
    .sort((a, b) => b.ratio - a.ratio).slice(0, 3);
  const fmt = (v, u) => u === "km" ? v.toFixed(1) : String(Math.round(v));
  const catOf = b => ACH_CAT[b.c] || ACH_CAT.trips;
  const hereNm = nextUp[0] ? nextUp[0].b.n : null;   // 最接近解鎖＝「你在這」
  const nextHtml = nextUp.length ? `<div class="ach-next-h">${ttT("即將解鎖")}</div><div class="ach-next">${nextUp.map(({ b, ratio }) => {
    const [cur, goal, unit] = b.p, cat = catOf(b);
    return `<div class="anx" style="--c:${cat.col}"><span class="anx-e ach-emo">${b.e}</span><div class="anx-body"><div class="anx-top"><b>${ttT(b.n)}</b><span class="anx-remain">${fmt(cur, unit)} / ${goal} ${ttT(unit)}</span></div><div class="anx-bar"><i style="width:${(ratio * 100).toFixed(0)}%"></i></div></div></div>`;
  }).join("")}</div>` : "";
  const CHK = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`;
  const pctOf = b => b.got ? 100 : (b.p && b.p[1] ? Math.min(100, Math.round(b.p[0] / b.p[1] * 100)) : 0);
  const statOf = b => b.got ? ttT("已達成") : (b.p ? `${fmt(b.p[0], b.p[2])} / ${b.p[1]} ${ttT(b.p[2])}` : b.d);
  const tiers = ACH_TIERS.map((name, i) => {
    const bs = list.filter(b => b.t === i + 1);
    const g = bs.filter(b => b.got).length;
    const prevCleared = i === 0 || list.filter(b => b.t === i).every(b => b.got);
    return { name, i, bs, g, prevCleared };
  });
  let side = 0;
  const treeHtml = tiers.map(tr => `
    <div class="ach-seg${tr.g === tr.bs.length ? " cleared" : ""}${tr.prevCleared ? "" : " tier-locked"}">
      <div class="ach-marker"><span class="ach-emblem">${ic(ACH_TIER_IC[tr.i])}</span></div>
      <div class="ach-seg-name"><b>${tr.name}</b><span>${tr.g}/${tr.bs.length}</span></div>
      ${tr.bs.map(b => {
    const cat = catOf(b), s = (side++ % 2) ? "right" : "left";
    return `<div class="ach-stop ${s} ${b.got ? "got" : "locked"}${b.n === hereNm ? " here" : ""}" style="--c:${cat.col};--pct:${pctOf(b)}">
          <div class="ach-dot"><div class="ach-dot-in">${ic(cat.i)}</div>${b.got ? `<span class="ach-check">${CHK}</span>` : ""}</div>
          <div class="ach-lbl"><b>${b.n}</b><span class="ach-lbl-d">${statOf(b)}</span></div>
        </div>`;
  }).join("")}
    </div>`).join("");
  return { got, total: list.length, nextHtml, treeHtml };
}
// 夥伴頁的成就入口（精簡）：進度條＋「查看成就步道」按鈕開全螢幕頁；下方保留「即將解鎖」
function renderBadges() {
  const box = $("#petBadges"); if (!box) return;
  const { got, total, nextHtml } = buildAchTree();
  const pct = Math.round(got / total * 100);
  box.innerHTML = `<div class="section-title">${ic("medal")}${ttT("成就步道")} <span class="badge-count">${got} / ${total}</span></div>
    <button class="ach-entry" id="achOpen" aria-label="${ttT("查看成就步道")}">
      <div class="ach-entry-bar"><i style="width:${pct}%"></i></div>
      <div class="ach-entry-row"><span class="ach-entry-lbl">${ttT("點擊查看成就步道")}</span><span class="ach-entry-go">${ic("compass")}</span></div>
    </button>
    ${nextHtml}`;
  const bt = $("#achOpen"); if (bt) bt.addEventListener("click", openAchTree);
}
// —— 成就山景輔助 ——
function _achCat(b) { return ACH_CAT[b.c] || ACH_CAT.trips; }
function _achPct(b) { return b.got ? 100 : (b.p && b.p[1] ? Math.min(100, Math.round(b.p[0] / b.p[1] * 100)) : 0); }
function _achFmt(v, u) { return u === "km" ? v.toFixed(1) : String(Math.round(v)); }
function _achStat(b) { return b.got ? ttT("已達成") : (b.p ? `${_achFmt(b.p[0], b.p[2])} / ${b.p[1]} ${ttT(b.p[2])}` : b.d); }
const _ACH_CHK = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`;
const _ACH_LOCK = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;
const _ACH_BIRD = `<svg viewBox="0 0 26 12" class="ach-bird-svg" aria-hidden="true"><path d="M1 8 Q6 1.5 13 7 Q20 1.5 25 8" fill="none" stroke="#5a6b7a" stroke-width="2" stroke-linecap="round"/></svg>`;
// 場景動態：飛鳥＋蝴蝶（HTML 疊層，CSS 動畫）
function _achFauna(p, night) {
  let s = `<span class="ach-bird v1">${_ACH_BIRD}</span><span class="ach-bird v2">${_ACH_BIRD}</span>`;
  if (p === 2 || p === 4) s += `<span class="ach-bird v3">${_ACH_BIRD}</span>`;
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
// —— 五段攀登：一頁一段海拔（0 山腳啟程 → 4 雲上傳說），一頁頁往上爬 ——
const ACH_NPG = 5, PAGE_W = 360, PAGE_H = 660, PAGE_PAD = 48;
// 把 N 顆成就平均分到 5 段海拔（可變數量，每頁 6–9 顆都行）
function _achRange(p, N) { return [Math.round(p * N / ACH_NPG), Math.round((p + 1) * N / ACH_NPG)]; }
function _achPageOf(idx, N) { for (let p = 0; p < ACH_NPG; p++) { const [s, e] = _achRange(p, N); if (idx >= s && idx < e) return p; } return ACH_NPG - 1; }
const ACH_PG_IC = ["footprints", "leaf", "mountain", "trophy", "crown"];
const ACH_PG_TITLE = ["啟程", "入山", "登高", "攻頂", "傳說"];   // 皆為既有 i18n 詞條
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
function _pine(x, y, s, night) {
  const c = night ? ["#22381f", "#2b4a2a", "#356038"] : ["#2c5a30", "#3c7338", "#4c8a46"], tk = night ? "#33281a" : "#5f452a";
  return _swayWrap(`<g transform="translate(${x} ${y}) scale(${s})"><rect x="-2" y="-13" width="4" height="14" fill="${tk}"/><path d="M0 -47 L-13 -21 L13 -21Z" fill="${c[0]}"/><path d="M0 -37 L-15 -9 L15 -9Z" fill="${c[1]}"/><path d="M0 -27 L-17 3 L17 3Z" fill="${c[2]}"/></g>`, x, 4.6);
}
function _leafTree(x, y, s, night) {
  const c = night ? ["#2a4a2c", "#325a34", "#3c6a3c"] : ["#3f7d40", "#57974f", "#6aad5c"], tk = night ? "#33281a" : "#6b4d2e";
  return _swayWrap(`<g transform="translate(${x} ${y}) scale(${s})"><rect x="-2.5" y="-17" width="5" height="18" fill="${tk}"/><circle cx="-10" cy="-25" r="11" fill="${c[0]}"/><circle cx="11" cy="-26" r="11" fill="${c[2]}"/><circle cx="0" cy="-33" r="14" fill="${c[1]}"/><circle cx="0" cy="-24" r="12" fill="${c[2]}"/></g>`, x, 5.4);
}
function _bush(x, y, s, night) {
  const c = night ? ["#2c4a2e", "#345a34"] : ["#4a8546", "#5c9a52"];
  return `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="-7" cy="-4" rx="10" ry="8" fill="${c[0]}"/><ellipse cx="7" cy="-4" rx="10" ry="8" fill="${c[1]}"/><ellipse cx="0" cy="-9" rx="11" ry="9" fill="${c[0]}"/></g>`;
}
function _grass(x, y, s, night) {
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
  const rnd = _sr(seed); let d = `M-10 ${(y + 60).toFixed(1)} L-10 ${y.toFixed(1)}`;
  for (let x = 0; x <= 360; x += 30) d += ` L${x} ${(y - rnd() * amp).toFixed(1)}`;
  return `<path d="${d} L372 ${y.toFixed(1)} L372 ${(y + 60).toFixed(1)} Z" fill="${col}"/>`;
}
function _cloud(x, y, s, col, op) {
  return `<g opacity="${op}"><ellipse cx="${x}" cy="${y}" rx="${(30 * s).toFixed(1)}" ry="${(12 * s).toFixed(1)}" fill="${col}"/><ellipse cx="${(x - 15 * s).toFixed(1)}" cy="${(y + 4 * s).toFixed(1)}" rx="${(19 * s).toFixed(1)}" ry="${(9 * s).toFixed(1)}" fill="${col}"/><ellipse cx="${(x + 17 * s).toFixed(1)}" cy="${(y + 4 * s).toFixed(1)}" rx="${(17 * s).toFixed(1)}" ry="${(8 * s).toFixed(1)}" fill="${col}"/></g>`;
}
// 山面散佈：依海拔選植被/岩石/雪，避開步道走廊，近處大遠處小（畫家排序）
function _achScatter(p, ry, night) {
  const band = p / 4, topY = _achPgTopY(p), rnd = _sr(p * 131 + 7);
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
function _achPgSVG(p, night) {
  const g = p < 4 ? ACH_GRD[night ? "n" : "d"][p] : ACH_GRD[night ? "n" : "d"][3];
  const snow = night ? "#c2ccd8" : "#f3f6ef", contour = p === 3 ? (night ? "#2c333d" : "#8fa0ae") : (night ? "#000" : "#3f5a34");
  const gid = `apg${p}`;
  const defs = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${g[0]}"/><stop offset=".55" stop-color="${g[1]}"/><stop offset="1" stop-color="${g[2]}"/></linearGradient></defs>`;
  let far2 = "", bg = "", surf = "", peak = "", cloudsea = "", fg = "";
  if (p < 4) {
    const ry = [-0.06, -0.04, 0.2, 0.4][p] * PAGE_H;
    // 天空側（露天時）：多層遠山＋雲＋飛鳥（登高＝藍霧綠嶺、攻頂＝雪白冷峰）
    if (p === 2) {
      far2 += _range(ry - 46, 40, night ? "#3a4b60" : "#c3d4de", 40);
      far2 += _range(ry - 22, 58, night ? "#33455a" : "#aec5d3", 55);
      far2 += _range(ry - 2, 42, night ? "#33503a" : "#8caf6a", 91);
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
    surf = _achScatter(p, ry, night);
    // 每頁英雄小物
    if (p === 0) surf = _achArch(night) + surf;               // 山腳木造登山口
    if (p === 3) surf += _achFlagpole(90, ry + 60, night) + _achFlagpole(286, ry + 120, night);  // 攻頂旗杆
    // 前景框：底部草叢/岩緣/雪堆加深縱深
    fg = _achFg(p, night);
  } else {
    // 雲上傳說：整片雲海騰雲駕霧，無尖峰——只有雲
    const cc = night ? ["#c4cfdc", "#cdd6e2", "#b6c3d3", "#aab8ca"] : ["#eef4fa", "#fbfdff", "#e3edf6", "#d6e4f1"];
    const band = 1, topY = _achPgTopY(4);
    // 高空薄雲＋飛鳥
    far2 += _cloud(70, 196, 1.2, cc[0], .66) + _cloud(300, 150, 1.0, cc[1], .6) + _cloud(184, 108, .8, cc[0], .46);
    far2 += _bird(150, 176, 1) + _bird(176, 168, .85) + _bird(120, 150, .8);
    // 每個成就下方一朵浮雲（像踩在雲上）
    for (let j = 0; j < 6; j++) { const u = 0.085 + j * 0.166; cloudsea += _cloud(_achUX(u, band), _achUY(u, topY) + 16, 1.0, cc[1], .95); }
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
    mist = `<defs><linearGradient id="mist${p}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mc}" stop-opacity="${op}"/><stop offset="1" stop-color="${mc}" stop-opacity="0"/></linearGradient></defs><rect x="-2" y="0" width="364" height="${h}" fill="url(#mist${p})"/>`;
  }
  return `<svg class="ach-page-mtn" viewBox="0 0 ${PAGE_W} ${PAGE_H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${defs}${far2}${bg}${surf}${peak}${cloudsea}${mist}${fg}${_achPgTrail(p, night)}</svg>`;
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
  const rows = shown.map(({ b, i }) => {
    const cat = _achCat(b), pct = _achPct(b), date = b.got ? achUnlockDate(b.n) : "", hid = _achHidden(b);
    const right = b.got ? (date || ttT("已達成")) : (hid ? "？" : (b.p ? `${_achFmt(b.p[0], b.p[2])}/${b.p[1]}` : ttT("尚未達成")));
    return `<button class="ach-lrow ${b.got ? "got" : "locked"}" data-i="${i}" style="--c:${cat.col}">
      <span class="ach-lemo ach-emo">${_achEmo(b)}</span>
      <span class="ach-lbody"><span class="ach-lname">${_achName(b)}${b.got ? ` <span class="ach-lchk">${_ACH_CHK}</span>` : ""}</span><span class="ach-ldesc">${_achDesc(b)}</span>${b.p && !hid ? `<span class="ach-lbar"><i style="width:${pct}%"></i></span>` : ""}</span>
      <span class="ach-lright">${right}</span></button>`;
  }).join("");
  box.innerHTML = `<div class="ach-fchips">${chips}</div><div class="ach-lrows">${rows || `<div class="ach-lempty">${ttT("這個類別還沒有成就")}</div>`}</div>`;
  box.querySelector(".ach-fchips").addEventListener("click", e => { const c = e.target.closest(".ach-fchip"); if (c) { box.dataset.filter = c.dataset.c; renderAchList(ov); } });
  box.querySelector(".ach-lrows").addEventListener("click", e => { const r = e.target.closest(".ach-lrow"); if (r) { const b = list[+r.dataset.i]; if (b) showAchDetail(b); } });
}
// #3 單一成就分享圖卡（canvas，不需外部套件）
function shareAchievement(b) {
  try {
    const W = 540, H = 680, c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d"), cat = _achCat(b);
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#20402c"); g.addColorStop(1, "#12251a");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = "rgba(224,177,90,.10)"; x.lineWidth = 1.5;
    for (let yy = 90; yy < H; yy += 48) { x.beginPath(); for (let xx = 0; xx <= W; xx += 12) x.lineTo(xx, yy + Math.sin((xx / W) * 6.28) * 10); x.stroke(); }
    x.textAlign = "center";
    const ccx = W / 2, ccy = 208, r = 96;
    x.beginPath(); x.arc(ccx, ccy, r, 0, 7); x.fillStyle = "#f6f1e4"; x.fill();
    x.lineWidth = 9; x.strokeStyle = cat.col; x.stroke();
    x.font = "90px sans-serif"; x.fillStyle = "#333"; x.fillText(b.e, ccx, ccy + 32);
    if (b.got) { x.beginPath(); x.arc(ccx + 66, ccy + 62, 22, 0, 7); x.fillStyle = "#e0b15a"; x.fill(); x.strokeStyle = "#fff"; x.lineWidth = 4; x.beginPath(); x.moveTo(ccx + 56, ccy + 62); x.lineTo(ccx + 63, ccy + 70); x.lineTo(ccx + 77, ccy + 54); x.stroke(); }
    x.fillStyle = "#f3efe4"; x.font = "700 42px 'TaipeiSans', sans-serif"; x.fillText(ttT(b.n), W / 2, 358);
    x.fillStyle = cat.col; x.font = "700 21px 'TaipeiSans', sans-serif"; x.fillText(ttT(ACH_CATNAME[b.c] || ""), W / 2, 392);
    x.fillStyle = "rgba(243,239,228,.85)"; x.font = "400 19px sans-serif"; x.fillText(ttT(b.d), W / 2, 438);
    const date = b.got ? achUnlockDate(b.n) : "";
    x.fillStyle = "#e0b15a"; x.font = "600 18px 'TaipeiSans', sans-serif";
    x.fillText(b.got ? (date ? ttT("解鎖於") + " " + date : ttT("已達成")) : (b.p ? `${_achFmt(b.p[0], b.p[2])} / ${b.p[1]} ${ttT(b.p[2])}` : ttT("尚未達成")), W / 2, 484);
    const sc = achScore();
    x.fillStyle = "rgba(255,255,255,.08)"; roundRect(x, W / 2 - 155, 528, 310, 62, 14); x.fill();
    x.fillStyle = "#fff"; x.font = "700 24px 'TaipeiSans', sans-serif"; x.fillText(`${sc.got}/${sc.total} ${ttT("成就")} · ${ttT(sc.rank)}`, W / 2, 567);
    x.fillStyle = "#e0b15a"; x.font = "700 19px 'TaipeiSans', sans-serif"; x.fillText(ttT("循徑拾光 · Gather the Trail"), W / 2, H - 30);
    c.toBlob(async (blob) => {
      if (!blob) { toast(ttT("產生圖片失敗")); return; }
      const file = new File([blob], "gather-the-trail-achievement.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: ttT("解鎖成就") }); return; } catch (e) { /* */ } }
      const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast(ttT("已存成圖片"));
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
    <div class="ach3d-d-top"><div class="ach3d-d-dot" style="--c:${hid ? "var(--ink-faint)" : cat.col};--pct:${hid ? 0 : pct}"><div class="ach-dot-in ach-emo">${_achEmo(b)}</div></div>
      <div><div class="ach3d-d-name">${_achName(b)}${b.got ? ` <span class="ach3d-d-badge">${_ACH_CHK}</span>` : ""}</div><div class="ach3d-d-cat" style="color:${hid ? "var(--ink-faint)" : cat.col}">${hid ? "" : ic(cat.i) + " "}${ttT(catName)}${date ? ` · ${ttT("解鎖於")} ${date}` : ""}</div></div></div>
    <div class="ach3d-d-desc">${_achDesc(b)}</div>
    ${b.p && !hid ? `<div class="ach3d-d-prog"><div class="ach3d-d-bar" style="--c:${cat.col}"><i style="width:${pct}%"></i></div><span>${_achFmt(b.p[0], b.p[2])} / ${b.p[1]} ${ttT(b.p[2])}</span></div>` : `<div class="ach3d-d-prog"><span>${b.got ? ttT("已達成") : ttT("尚未達成")}</span></div>`}
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
        <div class="ach-rankrow"><span class="ach-rankchip">${ic(ACH_TIER_IC[sc.rankIdx])} ${ttT(sc.rank)}</span><span class="ach-scorechip">${ttT("成就分數")} <b>${sc.score}</b></span></div></div>
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
    if (listMode) renderAchList(ov);
  });
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  _achInitClimb(ov);
}
// 五段攀登控制器：頁 0 山腳 → 頁 4 雲上；上下切換、開場落在「你在這」那頁
function _achInitClimb(ov) {
  if (!ov) return;
  const root = ov.querySelector("#ach3d"), skyEl = ov.querySelector(".ach-climb-sky");
  if (!root) return;
  const list = petBadges(), sky = _achSky();
  const nextUp = list.filter(b => !b.got && b.p && b.p[1] > 0).map(b => ({ b, r: Math.min(1, b.p[0] / b.p[1]) })).sort((a, b) => b.r - a.r);
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
  const N = list.length;
  const herePage = _achPageOf(Math.max(0, list.findIndex(b => b.n === hereNm)), N);
  const dotsEl = ov.querySelector(".ach-pgdots"), navEl = ov.querySelector(".ach-pgnav");
  // 右側海拔圓點（下＝啟程、上＝傳說；標出你目前進度那頁）
  dotsEl.innerHTML = Array.from({ length: ACH_NPG }, (_, i) => `<button class="ach-pgdot${i === herePage ? " ishere" : ""}" data-pg="${i}" aria-label="${ttT(ACH_PG_TITLE[i])}"></button>`).reverse().join("");
  // 建一頁 .ach-page 元素（含節點）
  function buildPage(p) {
    const band = p / 4, topY = _achPgTopY(p);
    const [s, e] = _achRange(p, N);
    const pageBadges = list.slice(s, e);
    const mainB = pageBadges.filter(b => !b.hidden), hiddenB = pageBadges.filter(b => b.hidden);
    const cnt = Math.max(1, mainB.length);
    const px = x => (x / PAGE_W * 100).toFixed(2) + "%", py = y => (y / PAGE_H * 100).toFixed(2) + "%";
    const mainNodes = mainB.map((b, j) => { const u = 0.06 + (j + 0.5) / cnt * 0.88; return { b, x: _achUX(u, band), y: _achUY(u, topY), spur: false }; });
    // 隱藏成就：從主幹道另闢支線；用避讓演算法選離所有節點最遠的落點，任何一條都不擋到其他成就
    let spurs = "";
    // 支線配色：預設同山徑的褐色；傳說頁(雲徑)改用雲白／金，讓傳說隱藏成就的岔路和主幹道顏色一致
    const spurCol = (p === 4)
      ? { body: sky.night ? "#aebdd6" : "#fbecc0", dash: sky.night ? "#dfe6f2" : "#fffdf3", dot: sky.night ? "#c7d2e4" : "#f2d98f" }
      : { body: sky.night ? "#54462d" : "#a98a54", dash: sky.night ? "#b7a074" : "#fff3d6", dot: sky.night ? "#7a6748" : "#9a7a44" };
    const occupied = mainNodes.map(n => ({ x: n.x, y: n.y }));
    const hiddenNodes = hiddenB.map((b, hi) => {
      const ua = Math.max(0.2, Math.min(0.8, 0.34 + hi * 0.3));
      const ax = _achUX(ua, band), ay = _achUY(ua, topY);
      let best = null;
      for (const side of [1, -1]) for (const dy of [-38, -56, -18]) {
        const hx = Math.max(40, Math.min(320, ax + side * 84)), hy = ay + dy;
        const md = occupied.reduce((m, p) => Math.min(m, Math.hypot(hx - p.x, hy - p.y)), 1e9);
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
    const headL = p === 0 ? `<div class="ach-head" style="left:${px(_achUX(0, band))};top:${py(_achUY(0, topY) + 26)}">${ic("footprints")}<b>${ttT("啟程")}</b></div>` : "";
    const peakL = p === 4 ? `<div class="ach-peak" style="left:50%;top:${py(150 - 66)}">${ic("crown")}<b>${ttT("傳說")}</b></div>` : "";
    const hikerL = here ? `<div class="ach-hiker" style="left:${px(here.x)};top:${py(here.y - 40)}"><span class="ach-hiker-b">${ttT("你在這")}</span><span class="ach-hiker-pin">${ic("footprints")}</span></div>` : "";
    const el = document.createElement("div"); el.className = "ach-page";
    el.innerHTML = `${_achPgSVG(p, sky.night)}
        <svg class="ach-spurs" viewBox="0 0 ${PAGE_W} ${PAGE_H}" preserveAspectRatio="none" aria-hidden="true">${spurs}</svg>
        ${_achFauna(p, sky.night)}
        <div class="ach-pgtag">${ic(ACH_PG_IC[p])} ${ttT(ACH_PG_TITLE[p])}<i>${gotN}/${pageBadges.length}</i></div>
        ${peakL}${headL}${hikerL}
        <div class="ach-climb-marks"></div>`;
    const mc = el.querySelector(".ach-climb-marks");
    nodes.forEach((n, i) => {
      const cat = _achCat(n.b), b = document.createElement("button");
      b.className = `ach3d-mk ${n.b.got ? "got" : "locked"}${n.b.n === hereNm ? " here" : ""}${n.spur ? " spur" : ""}`;
      b.style.left = px(n.x); b.style.top = py(n.y);
      b.style.setProperty("--i", i);   // 由下(0)往上(5)依序浮現
      b.style.setProperty("--c", cat.col); b.style.setProperty("--pct", _achPct(n.b));
      b.setAttribute("aria-label", `${_achName(n.b)} · ${n.b.got ? ttT("已達成") : ttT("尚未達成")}`);   // 無障礙
      b.innerHTML = `<span class="ach-dot"><span class="ach-dot-in ach-emo">${_achEmo(n.b)}</span>${n.b.got ? `<span class="ach-check">${_ACH_CHK}</span>` : `<span class="ach-lock">${_ACH_LOCK}</span>`}</span>`;   // 各徽章專屬 emoji＋鎖頭暗示
      b.addEventListener("click", e => { e.stopPropagation(); showAchDetail(n.b); });
      mc.appendChild(b);
    });
    return el;
  }
  // 膠捲軌道：五頁預先建好堆疊（上＝傳說、下＝啟程），拖動只做 transform → 60fps
  root.innerHTML = `<div class="ach-track" id="achTrack"></div><button class="ach-jump" id="achJump" hidden>${ic("footprints")} ${ttT("你在這")}</button>`;
  const track = root.querySelector("#achTrack"), jump = root.querySelector("#achJump");
  for (let p = ACH_NPG - 1; p >= 0; p--) track.appendChild(buildPage(p));
  const page0El = track.lastElementChild;   // 山腳頁（最後 append＝最下）
  let cur = 0, dragging = false, startY = 0, drag = 0, moved = 0, cheered = false;
  function place(anim) { track.classList.toggle("anim", !!anim); track.style.setProperty("--d", ACH_NPG - 1 - cur); track.style.setProperty("--drag", drag + "px"); }
  function hideDetail() { const d = ov.querySelector(".ach3d-detail.show"); if (d) d.classList.remove("show"); }
  function chrome() {
    dotsEl.querySelectorAll(".ach-pgdot").forEach(d => d.classList.toggle("on", +d.dataset.pg === cur));
    navEl.innerHTML = `<button class="ach-pgbtn" data-go="down" ${cur === 0 ? "disabled" : ""} aria-label="${ttT("回下方")}"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
      <span class="ach-pgnav-t">${ttT(ACH_PG_TITLE[cur])}</span>
      <button class="ach-pgbtn up" data-go="up" ${cur === ACH_NPG - 1 ? "disabled" : ""} aria-label="${ttT("繼續往上")}">${ttT("繼續往上")} ${_ACH_UP}</button>`;
    jump.hidden = (cur === herePage);
    ov.dataset.pg = String(cur);
    if (cur === ACH_NPG - 1 && allGot && !cheered) { cheered = true; _achCelebrate(root, sky.night); }
  }
  function go(t) { t = Math.max(0, Math.min(ACH_NPG - 1, t)); drag = 0; if (t === cur) { place(true); return; } cur = t; hideDetail(); place(true); chrome(); }
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
  ov.addEventListener("keydown", e => { if (e.key === "ArrowUp") { e.preventDefault(); go(cur + 1); } else if (e.key === "ArrowDown") { e.preventDefault(); go(cur - 1); } });
  dotsEl.addEventListener("click", e => { const d = e.target.closest(".ach-pgdot"); if (d) go(+d.dataset.pg); });
  navEl.addEventListener("click", e => { const b = e.target.closest(".ach-pgbtn"); if (b) go(b.dataset.go === "up" ? cur + 1 : cur - 1); });
  jump.addEventListener("click", () => go(herePage));
  // 定位山腳＋播開場動畫（從山腳往上看）
  place(false); chrome();
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
function refreshAchTree() { const ov = document.querySelector('[data-ov="achtree"]'); if (ov) _achInitClimb(ov); }
// 夥伴手冊：進化圖鑑 + 成就徽章
function openPetDex() {
  if (document.querySelector('[data-ov="petdex"]')) return;   // 防連點疊層
  const km = totalKm(), reached = petStageIndex(km), next = PET_STAGES[reached + 1];
  const stages = PET_STAGES.map((s, i) => {
    const unlocked = i <= reached, isNow = i === reached;
    return `<div class="dex-row${unlocked ? "" : " locked"}${isNow ? " now" : ""}">
      <div class="dex-e">${unlocked && typeof PET_ART !== "undefined" ? PET_ART.svg(i) : (unlocked ? s.e : "❔")}</div>
      <div class="dex-body">
        <div class="dex-h"><b>${unlocked ? s.n : "？？？"}</b><span class="lv-chip lvt-${Math.min(i + 1, 7)}">Lv.${i + 1}</span>${isNow ? `<span class="dex-now">目前</span>` : ""}</div>
        <div class="dex-k">${i === 0 ? "起始型態" : `成長里程 ${s.km} km 解鎖`}</div>
        <div class="dex-d">${unlocked ? s.d : "繼續健行，解鎖牠的樣貌與故事…"}</div>
      </div>
    </div>`;
  }).join("");
  const tip = next ? `再走 <b>${(next.km - km).toFixed(1)}</b> km 進化成 ${next.n}` : "已達最終型態 ✨ 與你繼續同行";
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
  const A = typeof PET_ART !== "undefined";
  const newIdx = lv - 1, prevIdx = Math.max(0, lv - 2);
  // 變身序列：舊角色抖動→白光爆閃→新角色現身
  const stageHtml = A
    ? `<div class="evolve-stage"><div class="evolve-from">${PET_ART.svg(prevIdx)}</div><div class="evolve-flash"></div><div class="evolve-to">${PET_ART.svg(newIdx)}</div></div>`
    : `<div class="evolve-emoji">${st.e}</div>`;
  ov.innerHTML = `<div class="evolve-card">
    <div class="evolve-spark"></div>
    ${stageHtml}
    <div class="evolve-h">進化！</div>
    <div class="evolve-n">${petName() || st.n} <span class="lv-chip lvt-${Math.min(lv, 7)}">Lv.${lv}</span></div>
    <div class="evolve-d">${st.d}</div>
    <button class="btn primary" id="evolveOk">太棒了</button>
  </div>`;
  document.body.appendChild(ov);
  if (navigator.vibrate) navigator.vibrate([40, 60, 30, 40, 120]);
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
  if (Recorder.getState && Recorder.getState() !== "idle") { box.style.display = "none"; return; }
  const last = realRecords()[0];
  if (!last) { box.style.display = "none"; return; }
  box.style.display = "block";
  let html = `<div class="ridle-row"><span class="inline-ic">${ic("pin")}</span> 上次：${last.trailName || "自由路線"}・<b>${(last.distanceKm || 0).toFixed(2)}</b> km</div>`;
  // #4 臨門提醒：離下一個成就還差多少
  try {
    const nu = petBadges().filter(b => !b.got && b.p && b.p[1] > 0).map(b => ({ b, r: Math.min(1, b.p[0] / b.p[1]) })).sort((a, b) => b.r - a.r)[0];
    if (nu && nu.r >= 0.35) {   // 已接近才提醒，免洗版
      const [cur, goal, unit] = nu.b.p, remain = goal - cur;
      const rtxt = unit === "km" ? remain.toFixed(1) : String(Math.ceil(remain));
      html += `<div class="ridle-row ridle-ach"><span class="ach-emo">${nu.b.e}</span> ${ttT("再")} <b>${rtxt} ${ttT(unit)}</b> ${ttT("解鎖")}「${ttT(nu.b.n)}」</div>`;
    }
  } catch (e) { /* */ }
  box.innerHTML = html;
}
// 我的足跡熱力圖：所有真實軌跡疊在一張地圖上
async function openFootprintMap() {
  if (document.querySelector('[data-ov="footmap"]')) return;   // 防連點疊層
  if (typeof ttBusy === "function" && ttBusy("footmap")) return;   // 同步鎖：讀封存的空窗期連點也擋
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
