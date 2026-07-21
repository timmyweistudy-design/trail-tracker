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
const ACH_CAT_OF = {
  "初心者": "trips", "週末山友": "trips", "早起鳥": "time", "夜行者": "time",
  "常客": "trips", "50K": "dist", "爬升新手": "climb", "週週不斷": "streak",
  "老山友": "trips", "百K俱樂部": "dist", "爬升大師": "climb", "連續一週": "streak", "健行馬拉松": "challenge", "走遍三縣": "explore",
  "山痴": "trips", "300K": "dist", "玉山高度": "climb", "半馬腳力": "challenge", "挑戰征服": "challenge", "四週堅持": "streak",
  "縱橫五百": "dist", "聖母峰高度": "climb", "走遍十縣": "explore", "步道收藏家": "explore", "月月不休": "streak",
  "千里健行": "dist", "萬米爬升": "climb", "環島達人": "explore", "超馬腳力": "challenge", "兩百次山旅": "trips",
};
// 成就徽章：成就樹，強調長期累積（拿掉一鍵可解的收藏類）
function petBadges() {
  const recs = realRecords();
  const n = recs.length;
  const km = recs.reduce((s, r) => s + (r.distanceKm || 0), 0);
  const asc = recs.reduce((s, r) => s + (r.ascent || 0), 0);
  const maxOne = recs.reduce((m, r) => Math.max(m, r.distanceKm || 0), 0);
  const hrs = recs.map(r => new Date(r.date).getHours());
  const early = hrs.some(h => h < 7), night = hrs.some(h => h >= 19);
  const done = (typeof Store.doneCount === "function") ? Store.doneCount() : 0;
  const wk = weeksStreak(), dstreak = (typeof daysStreak === "function") ? daysStreak() : 0;
  // 縣市探索＋難度征服：只算「真實走過/手動完成」的步道（done），非一鍵收藏
  const doneTrails = (typeof TRAILS !== "undefined") ? TRAILS.filter(t => Store.trailLog(t.id).done) : [];
  const counties = new Set(doneTrails.map(t => t.region).filter(Boolean)).size;
  const hardDone = doneTrails.filter(t => (t.difficulty || 0) >= 4).length;
  // t: 階層(1–6)；p: [目前值, 門檻, 單位] 供進度提示；布林型（早起/夜行）不設 p
  const list = [
    // 啟程
    { e: "👣", n: "初心者", got: n >= 1, d: "完成第一次記錄", p: [n, 1, "次"], t: 1 },
    { e: "🥾", n: "週末山友", got: n >= 3, d: "累積 3 次出行", p: [n, 3, "次"], t: 1 },
    { e: "🌅", n: "早起鳥", got: early, d: "清晨 7 點前出發", t: 1 },
    { e: "🌙", n: "夜行者", got: night, d: "晚間 7 點後出發", t: 1 },
    // 入山
    { e: "🎒", n: "常客", got: n >= 10, d: "累積 10 次出行", p: [n, 10, "次"], t: 2 },
    { e: "📏", n: "50K", got: km >= 50, d: "總里程 50 km", p: [km, 50, "km"], t: 2 },
    { e: "⛰️", n: "爬升新手", got: asc >= 1000, d: "總爬升 1000 m", p: [asc, 1000, "m"], t: 2 },
    { e: "🔥", n: "週週不斷", got: wk >= 2, d: "連續 2 週都有走", p: [wk, 2, "週"], t: 2 },
    // 登高
    { e: "🏕️", n: "老山友", got: n >= 30, d: "累積 30 次出行", p: [n, 30, "次"], t: 3 },
    { e: "💯", n: "百K俱樂部", got: km >= 100, d: "總里程 100 km", p: [km, 100, "km"], t: 3 },
    { e: "🦅", n: "爬升大師", got: asc >= 3000, d: "總爬升 3000 m", p: [asc, 3000, "m"], t: 3 },
    { e: "📅", n: "連續一週", got: dstreak >= 7, d: "連續 7 天健行", p: [dstreak, 7, "天"], t: 3 },
    { e: "🏃", n: "健行馬拉松", got: maxOne >= 10, d: "單次步行 ≥ 10 km", p: [maxOne, 10, "km"], t: 3 },
    { e: "🧭", n: "走遍三縣", got: counties >= 3, d: "完成 3 個縣市的步道", p: [counties, 3, "縣"], t: 3 },
    // 縱走
    { e: "🧗", n: "山痴", got: n >= 100, d: "累積 100 次出行", p: [n, 100, "次"], t: 4 },
    { e: "🚀", n: "300K", got: km >= 300, d: "總里程 300 km", p: [km, 300, "km"], t: 4 },
    { e: "🗻", n: "玉山高度", got: asc >= 3952, d: "總爬升 3952 m（一座玉山）", p: [asc, 3952, "m"], t: 4 },
    { e: "🥇", n: "半馬腳力", got: maxOne >= 21, d: "單次步行 ≥ 21 km", p: [maxOne, 21, "km"], t: 4 },
    { e: "⚔️", n: "挑戰征服", got: hardDone >= 5, d: "完成 5 條挑戰級以上步道", p: [hardDone, 5, "條"], t: 4 },
    { e: "🗓️", n: "四週堅持", got: wk >= 4, d: "連續 4 週都有走", p: [wk, 4, "週"], t: 4 },
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
  return list;
}
// 成就勳章專區（夥伴頁）
function renderBadges() {
  const box = $("#petBadges"); if (!box) return;
  const list = petBadges(), got = list.filter(b => b.got).length;
  // #8 下一個成就進度：挑最接近解鎖（且尚未解鎖、有量化門檻）的前 3 個，給進度條與「還差多少」
  const nextUp = list.filter(b => !b.got && b.p && b.p[1] > 0)
    .map(b => ({ b, ratio: Math.min(1, b.p[0] / b.p[1]) }))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3);
  const fmt = (v, u) => u === "km" ? v.toFixed(1) : String(Math.round(v));
  const catOf = b => ACH_CAT[b.c] || ACH_CAT.trips;
  const hereNm = nextUp[0] ? nextUp[0].b.n : null;   // 最接近解鎖＝「你在這」
  const nextHtml = nextUp.length ? `<div class="ach-next-h">${ttT("即將解鎖")}</div><div class="ach-next">${nextUp.map(({ b, ratio }) => {
    const [cur, goal, unit] = b.p, cat = catOf(b);
    return `<div class="anx" style="--c:${cat.col}"><span class="anx-e">${ic(cat.i)}</span><div class="anx-body"><div class="anx-top"><b>${b.n}</b><span class="anx-remain">${fmt(cur, unit)} / ${goal} ${ttT(unit)}</span></div><div class="anx-bar"><i style="width:${(ratio * 100).toFixed(0)}%"></i></div></div></div>`;
  }).join("")}</div>` : "";
  // 步道路徑：一條中央蜿蜒步道，成就是路上左右交錯的停靠點；階層以紋章當「檢查點」
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
  box.innerHTML = `<div class="section-title">${ic("medal")}成就樹 <span class="badge-count">${got} / ${list.length}</span></div>
    ${nextHtml}
    <div class="ach-trail">${treeHtml}</div>`;
}
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
  box.innerHTML = `<div class="ridle-row"><span class="inline-ic">${ic("pin")}</span> 上次：${last.trailName || "自由路線"}・<b>${(last.distanceKm || 0).toFixed(2)}</b> km</div>`;
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
