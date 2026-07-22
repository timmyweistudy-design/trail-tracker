// ===== 後台測試面板（debug）：從 app.js 拆出。載入順序在 app.js 之後，所有全域皆已就緒；
// 只在使用者互動(按鈕/5連點/?debug=1)時呼叫 app 全域，無載入期依賴。 =====
// ---------- 後台測試（debug） ----------
window.ttDebug = (() => {
  const ls = localStorage;
  const refresh = () => { try { renderPet(); renderStats(); renderHistory(); render(); } catch (e) { /* */ } };
  const api = {
    addKm(n = 5) { ls.setItem("tt_debug_km", String(+(debugKm() + (+n)).toFixed(2))); checkPetEvolve(); refresh(); return api.state(); },
    setLevel(i) {
      i = Math.max(0, Math.min(PET_STAGES.length - 1, +i));
      const recs = realRecords().reduce((s, r) => s + (r.distanceKm || 0), 0);
      ls.setItem("tt_debug_km", String(+(PET_STAGES[i].km - feedBonusKm() + petBase() - recs).toFixed(2)));
      ls.setItem("tt_pet_stage", String(i)); refresh(); return api.state();
    },
    maxLevel() { return api.setLevel(PET_STAGES.length - 1); },
    evolve() { const i = petStageIndex(totalKm()); if (i < PET_STAGES.length - 1) api.addKm(PET_STAGES[i + 1].km - totalKm() + 0.1); return api.state(); },
    addBerries(n = 30) { ls.setItem("tt_pet_berry_spent", String((+(ls.getItem("tt_pet_berry_spent") || 0)) - (+n))); refresh(); return api.state(); },
    setAffinity(n = 100) { ls.setItem("tt_pet_aff", String(Math.max(0, Math.min(100, +n)))); ls.setItem("tt_pet_aff_t", new Date().toISOString()); refresh(); return api.state(); },
    resetFeed() { ls.removeItem("tt_pet_fed_t"); refresh(); return "可再餵食"; },   // 冷卻 key 是 tt_pet_fed_t（原本刪錯 key 所以沒用）
    addDays(n = 10) { const h = new Date(petHatch()); h.setDate(h.getDate() - (+n)); ls.setItem("tt_pet_hatch", h.toISOString()); refresh(); return api.state(); },
    clearDebug() { ls.removeItem("tt_debug_km"); refresh(); return api.state(); },
    resetPet() {
      ls.setItem("tt_pet_base", String(realTotalKm())); ls.setItem("tt_pet_hatch", new Date().toISOString());
      ls.setItem("tt_pet_stage", "0"); ls.setItem("tt_pet_berry_spent", String(berriesEarned()));
      ["tt_pet_name", "tt_pet_feedkm", "tt_pet_aff", "tt_pet_aff_t", "tt_pet_fed_t", "tt_pet_hat"].forEach(k => ls.removeItem(k));   // B2/B3：清真正的冷卻鍵 tt_pet_fed_t＋帽子（原本清死鍵 tt_pet_fed）
      refresh(); return "已重置寵物 🥚";
    },
    // 加一筆「真實」測試行程（推進成就統計/每日環/足跡圖/徽章/親密度，今天日期）
    addHike(km = 3) {
      km = +km;
      const n = Math.max(3, Math.round(km * 30));
      let lat = 25.02 + Math.random() * .04, lon = 121.5 + Math.random() * .06;
      const dd = (km * 1000) / n / 111000, track = [];
      for (let i = 0; i < n; i++) { lat += dd * 0.7; lon += dd * 0.5; track.push({ lat, lon, t: Date.now() - (n - i) * 1000 }); }
      Store.addRecord({
        id: "dbg" + Date.now(), date: new Date().toISOString(), dbg: true, note: "測試行程",
        distanceKm: km, distance3DKm: km, steps: Math.round(km * 1350), kcal: Math.round(km * 60),
        elapsedMs: Math.round(km * 12 * 60000), ascent: Math.round(km * 45), descent: Math.round(km * 35), track,
      });
      bumpAffinity(8); checkPetEvolve(); refresh(); return api.state();
    },
    clearHikes() { const kept = Store.getRecords().filter(r => !r.dbg); Store.setRecords(kept); refresh(); return "已清除測試行程"; },
    // 一鍵解鎖全部成就：灌入足以滿足成就樹全部 30 個徽章的測試資料
    unlockAch() {
      const recs = [];
      for (let i = 0; i < 200; i++) {                       // 200 筆連續天 → 出行次數(至200)/連續天數(至30)/週數/假日山友/十萬步
        const d = new Date(); d.setDate(d.getDate() - i);
        if (i === 1) d.setHours(5, 0, 0, 0);                // 清晨5點 → 早起鳥＋破曉行者
        else if (i === 2) d.setHours(20, 0, 0, 0);          // 夜間 → 夜行者
        else if (i === 4) d.setHours(3, 0, 0, 0);           // 凌晨3點 → 凌晨出擊(隱藏)
        else d.setHours(12, 0, 0, 0);
        const km = i === 0 ? 42 : 6;                        // 一筆 42km → 超馬/半馬/馬拉松；總里程 ≈ 1236km → 千里健行
        const asc = i === 0 ? 1200 : 60;                    // i0 單次爬升1200 → 一日千升；總爬升仍破萬(→萬米爬升/聖母峰)
        recs.push({
          id: "dbg-ach-" + i, date: d.toISOString(), dbg: true, note: "成就測試",
          distanceKm: km, distance3DKm: km, steps: Math.round(km * 1350), kcal: Math.round(km * 60),
          elapsedMs: Math.round(km * 12 * 60000), ascent: asc, descent: 50,
          track: [{ lat: 24, lon: 121, t: d.getTime() }],
        });
      }
      // 四季行者：補 4 個不同季節的孤立紀錄（不打斷上面的連續天數鏈）
      [0, 3, 6, 9].forEach((mo, k) => recs.push({
        id: "dbg-ach-season-" + k, date: new Date(new Date().getFullYear() - 2, mo, 15, 12, 0, 0).toISOString(), dbg: true, note: "成就測試",
        distanceKm: 6, distance3DKm: 6, steps: 8000, kcal: 360, elapsedMs: 4320000, ascent: 60, descent: 50, track: [{ lat: 23.57, lon: 119.56, t: 0 }],   // 澎湖座標 → 離島山旅(隱藏)
      }));
      recs.push({   // 閏日 2/29/2024 → 四年一會(傳說隱藏)
        id: "dbg-ach-leap", date: new Date(2024, 1, 29, 12, 0, 0).toISOString(), dbg: true, note: "成就測試",
        distanceKm: 6, distance3DKm: 6, steps: 8000, kcal: 360, elapsedMs: 4320000, ascent: 60, descent: 50, track: [{ lat: 24, lon: 121, t: 0 }],
      });
      const kept = Store.getRecords().filter(r => !String(r.id).startsWith("dbg-ach-"));
      Store.setRecords(recs.concat(kept));
      // 縣市探索：每個縣市各挑一條完成 → counties 拉到 20+（環島達人）
      const all = (typeof TRAILS !== "undefined" ? TRAILS : []);
      const byRegion = {};
      for (const t of all) { if (t.region && !byRegion[t.region]) byRegion[t.region] = t.id; }
      Object.values(byRegion).forEach(id => Store.setTrailLog(id, { done: true }));
      // 難度征服：完成 6 條挑戰級以上（difficulty≥4）→ 挑戰征服
      all.filter(t => (t.difficulty || 0) >= 4).slice(0, 6).forEach(t => Store.setTrailLog(t.id, { done: true }));
      // 補足完成 20 條（步道收藏家）：不足就再補一般步道
      let doneN = all.filter(t => Store.trailLog(t.id).done).length;
      for (const t of all) { if (doneN >= 22) break; if (!Store.trailLog(t.id).done) { Store.setTrailLog(t.id, { done: true }); doneN++; } }
      checkPetEvolve(); refresh(); try { renderBadges(); if (typeof refreshAchTree === "function") refreshAchTree(); } catch (e) { /* */ }
      return "已解鎖全部成就 🏅";
    },
    // 重置成就：清掉解鎖用的測試行程/完成紀錄，並清空永久解鎖名單(tt_badges_got)→ 徽章真的會重新上鎖
    resetAch() {
      const kept = Store.getRecords().filter(r => !String(r.id).startsWith("dbg-ach-"));
      Store.setRecords(kept);
      localStorage.removeItem("tt_log");
      // 關鍵：這些不清，徽章會靠「永久解鎖名單/持久化最大值」一直亮著
      ["tt_badges_got", "tt_badges_seen", "tt_badges_date", "tt_ach_maxkm", "tt_ach_maxasc", "tt_ach_island"].forEach(k => localStorage.removeItem(k));
      checkPetEvolve(); refresh(); try { renderBadges(); if (typeof refreshAchTree === "function") refreshAchTree(); } catch (e) { /* */ }
      return "已重置成就（完成/測試行程/永久解鎖名單/最大值/解鎖提示已清空）";
    },
    // 直接開成就步道頁（省得切到夥伴頁再點）
    openAch() { try { if (typeof openAchTree === "function") openAchTree(); } catch (e) { /* */ } return "已開啟成就頁"; },
    // 解鎖「下一個最接近」的成就：實測解鎖 toast＋果實獎勵＋自動揭曉隱藏彩蛋
    unlockNextAch() {
      const list = petBadges(), cand = list.filter(b => !b.got);
      if (!cand.length) return "已全部解鎖 🏅";
      const next = cand.map(b => ({ b, r: (b.p && b.p[1]) ? Math.min(1, b.p[0] / b.p[1]) : 0 })).sort((a, b) => b.r - a.r)[0].b;
      let seen; try { seen = JSON.parse(localStorage.getItem("tt_badges_seen")); } catch (e) { /* */ }
      if (!Array.isArray(seen)) localStorage.setItem("tt_badges_seen", JSON.stringify(list.filter(b => b.got).map(b => b.n)));   // 確保非首跑，才會 toast
      const got = new Set(JSON.parse(localStorage.getItem("tt_badges_got") || "[]")); got.add(next.n);
      localStorage.setItem("tt_badges_got", JSON.stringify([...got]));
      try { if (typeof achCheckUnlocks === "function") achCheckUnlocks(); renderBadges(); } catch (e) { /* */ }
      return "已解鎖：" + next.n;
    },
    // 解鎖一半（每隔一個），做「進行中」的畫面測試
    halfAch() {
      const list = petBadges(), got = new Set(JSON.parse(localStorage.getItem("tt_badges_got") || "[]"));
      list.forEach((b, i) => { if (i % 2 === 0) got.add(b.n); });
      localStorage.setItem("tt_badges_got", JSON.stringify([...got]));
      try { renderBadges(); if (typeof refreshAchTree === "function") refreshAchTree(); } catch (e) { /* */ }
      return "已解鎖約一半（測試進行中狀態）";
    },
    // 清掉解鎖提示紀錄：下次跨門檻/解下一個會「重新跳 toast」
    resetAchSeen() {
      ["tt_badges_seen", "tt_badges_date"].forEach(k => localStorage.removeItem(k));
      return "已清空解鎖提示紀錄（下次解鎖會重新跳 toast）";
    },
    // 重置每日任務：清掉今日領獎旗標 + 移除今天的行程，讓三項任務進度歸零可重測
    resetQuests() {
      localStorage.removeItem("tt_quest_claim");
      const ds = todayStr();
      const kept = Store.getRecords().filter(r => (r.date || "").slice(0, 10) !== ds);
      Store.setRecords(kept);
      checkPetEvolve(); refresh(); try { renderQuests(); } catch (e) { /* */ }
      return "已重置今日任務";
    },
    // 重置所有行程記錄：清空全部行程（真實＋測試），並把寵物成長基準重設，避免里程變負
    clearAllRecords() {
      Store.clearRecords();
      localStorage.setItem("tt_pet_base", "0");
      localStorage.removeItem("tt_pet_feedkm");
      checkPetEvolve(); refresh(); try { renderBadges(); if (typeof refreshAchTree === "function") refreshAchTree(); } catch (e) { /* */ }
      return "已清空所有行程記錄";
    },
    state() { return { 成長km: +totalKm().toFixed(2), 等級: petStageIndex(totalKm()) + 1, 果實: berriesBalance(), 愛心: petHearts(), 親密度: affinity(), 今日km: +todayKm().toFixed(1), 出行次數: realRecords().length, debug里程: debugKm() }; },
    panel() { toggleDebugPanel(); },
    help() { console.log("ttDebug 指令：\n addKm(n) setLevel(0-6) maxLevel() evolve()\n addBerries(n) setAffinity(0-100) resetFeed() addDays(n)\n addHike(km) clearHikes()  ← 推進成就/每日環/足跡圖\n unlockAch() unlockNextAch() halfAch() resetAch()  ← 解鎖全部/下一個/一半/重置成就\n openAch() resetAchSeen()  ← 開成就頁/清解鎖提示重測 toast\n resetQuests()  ← 重置每日任務\n clearAllRecords()  ← 清空所有行程\n clearDebug() resetPet() state() panel()"); return api.state(); },
  };
  return api;
})();
// DEBUG 測試面板只開放給開發者本人（以登入 Email 驗證）
const TT_OWNER_EMAIL = "gatherthetrail@gmail.com";
async function ttIsOwner() {
  try {
    const c = (typeof Supa !== "undefined" && Supa.client) ? Supa.client() : null;
    if (!c) return false;
    const { data } = await c.auth.getUser();
    return !!(data && data.user && (data.user.email || "").toLowerCase() === TT_OWNER_EMAIL);
  } catch (e) { return false; }
}
async function toggleDebugPanel() {
  let p = document.getElementById("debugPanel");
  if (p) { p.remove(); return; }
  if (!(await ttIsOwner())) { if (typeof toast === "function") toast("測試面板僅限開發者使用"); return; }
  p = document.createElement("div");
  p.id = "debugPanel"; p.className = "debug-panel";
  const btns = [
    ["+5km", () => ttDebug.addKm(5)], ["+20km", () => ttDebug.addKm(20)],
    ["進化➡", () => ttDebug.evolve()], ["神龍🐉", () => ttDebug.maxLevel()],
    ["+50🍓", () => ttDebug.addBerries(50)], ["❤️滿", () => ttDebug.setAffinity(100)],
    ["可再餵", () => ttDebug.resetFeed()], ["+30天", () => ttDebug.addDays(30)],
    ["＋行程3km", () => ttDebug.addHike(3)], ["＋行程10km", () => ttDebug.addHike(10)],
    ["清測試行程", () => ttDebug.clearHikes()], ["清debug", () => ttDebug.clearDebug()],
    ["🏅解全成就", () => ttDebug.unlockAch()], ["🏅解下一個", () => ttDebug.unlockNextAch()],
    ["🏅解一半", () => ttDebug.halfAch()], ["🏅重置成就", () => ttDebug.resetAch()],
    ["🏅開成就頁", () => ttDebug.openAch()], ["🏅清解鎖提示", () => ttDebug.resetAchSeen()],
    ["📅重置每日任務", () => ttDebug.resetQuests()],
    ["🗑清所有行程", async () => { if (await ttConfirm("清空全部行程記錄？")) ttDebug.clearAllRecords(); }],
    ["重置🥚", () => ttDebug.resetPet()],
    ["🌐重看語言選擇", () => { try { localStorage.removeItem("tt_lang"); localStorage.removeItem("tt_onboarded_v2"); } catch (e) { /* */ } const dp = document.getElementById("debugPanel"); if (dp) dp.remove(); langGate(true); }],
    ["🧭導覽(中)", () => { try { localStorage.removeItem("tt_onboarded_v2"); localStorage.removeItem("tt_tour_resume"); } catch (e) { /* */ } const dp = document.getElementById("debugPanel"); if (dp) dp.remove(); onboarding(true, { previewLang: "zh", startAt: 0 }); }],
    ["🧭導覽(英)", () => { try { localStorage.removeItem("tt_onboarded_v2"); localStorage.removeItem("tt_tour_resume"); } catch (e) { /* */ } const dp = document.getElementById("debugPanel"); if (dp) dp.remove(); onboarding(true, { previewLang: "en", startAt: 0 }); }],
    ["🧭重設情境導覽", () => { try { ["tt_coach_trail", "tt_coach_team", "tt_coach_record", "tt_coach_soc_friends", "tt_coach_soc_explore", "tt_coach_soc_search", "tt_coach_soc_notif", "tt_coach_soc_me"].forEach(k => localStorage.removeItem(k)); } catch (e) { /* */ } const dp = document.getElementById("debugPanel"); if (dp) dp.remove(); toast("情境導覽已重設：重新打開步道／小隊／記錄／社群各頁就會再出現"); }],
  ];
  p.innerHTML = `<div class="dbg-h">🛠 測試面板 <span id="dbgState"></span><button id="dbgClose">✕</button></div><div class="dbg-grid"></div>`;
  const grid = p.querySelector(".dbg-grid");
  btns.forEach(([t, fn]) => { const b = document.createElement("button"); b.textContent = t; b.onclick = () => { Promise.resolve(fn()).then(r => { if (typeof r === "string" && typeof toast === "function") toast(r); }).catch(() => { }); document.getElementById("dbgState").textContent = `Lv${ttDebug.state().等級}·${ttDebug.state().成長km}km`; }; grid.appendChild(b); });
  p.querySelector("#dbgClose").onclick = () => p.remove();
  document.body.appendChild(p);
  document.getElementById("dbgState").textContent = `Lv${ttDebug.state().等級}·${ttDebug.state().成長km}km`;
}
// 開啟方式：網址 ?debug=1，或連點 header 標題 5 下
if (new URLSearchParams(location.search).get("debug") === "1") setTimeout(toggleDebugPanel, 400);
(function () {
  const brand = document.querySelector(".brand"); if (!brand) return;
  let n = 0, tm;
  brand.addEventListener("click", () => { n++; clearTimeout(tm); tm = setTimeout(() => n = 0, 1200); if (n >= 5) { n = 0; toggleDebugPanel(); } });
})();
