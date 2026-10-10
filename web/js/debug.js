// ===== 後台測試面板（debug）：延遲載入（只有開發者會用到，不讓每個人開 App 都多載 26 KB）；
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
    clearDebug() { ls.removeItem("tt_debug_km"); ls.removeItem("tt_debug_mood"); window.__psSpots = null; window.__ps = null; window.__hatSeasonAll = false; window.__petPropsAll = false; window.__toneAll = false; if (typeof petApplyTone === "function") petApplyTone(); window.__petDbg = false; if (typeof ttClock !== "undefined") ttClock.reset(); try { ls.setItem("tt_pet_diary", JSON.stringify(JSON.parse(ls.getItem("tt_pet_diary") || "[]").filter(x => !x.dbg))); ls.setItem("tt_pet_gifts", JSON.stringify(JSON.parse(ls.getItem("tt_pet_gifts") || "[]").filter(x => !x.dbg))); } catch (e) { /* */ } if (window.__ttSlow) api.slow(1); refresh(); return api.state(); },
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
    // ── 夥伴舞台與旅行（2026-10-04） ──
    // 強制時段／季節／天氣（window.__ps，pet-stage.js 讀）；null＝回到真實
    stage(k, v) { const cur = Object.assign({}, window.__ps || {}); if (k === null) window.__ps = null; else { cur[k] = v; window.__ps = cur; } refresh(); return window.__ps ? "舞台：" + JSON.stringify(window.__ps) : "舞台：跟真實時間／天氣"; },
    act(kind) { if (typeof PetStage === "undefined") return "沒有舞台"; PetStage.act(kind); return ""; },
    // ── 夥伴動畫（2026-10-07 收尾輪：調動畫用） ──
    mood(k) { if (k) ls.setItem("tt_debug_mood", k); else ls.removeItem("tt_debug_mood"); refresh(); return "心情：" + (k || "回到真實"); },
    react(kind) { if (typeof PetStage === "undefined") return "沒有舞台"; PetStage.react(kind); return ""; },
    spots(xs) { window.__psSpots = xs; return xs ? "下次餵食的落點（相對舞台中間 px；神龍是雲上的 x）：" + xs.join("、") : "落點：回到隨機"; },
    hat() { const ids = PET_ART.HAT_IDS, cur = ls.getItem("tt_pet_hat") || "none", nx = ids[(ids.indexOf(cur) + 1) % ids.length]; ls.setItem("tt_pet_hat", nx); refresh(); return "帽子：" + (PET_ART.HAT_LABEL && PET_ART.HAT_LABEL[nx] || nx); },
    // 慢動作：把 performance.now、setTimeout、所有 CSS／Web 動畫一起放慢（夥伴的逐格動畫都用 performance.now 算進度）
    slow(k) {
      const S = window.__ttSlow || (window.__ttSlow = { k: 1, pn: performance.now.bind(performance), st: window.setTimeout.bind(window), raf: 0 });
      const real = S.pn(); if (!S.on) { S.v0 = real; S.t0 = real; S.on = true; performance.now = () => S.v0 + (S.pn() - S.t0) * S.k; window.setTimeout = (f, ms, ...a) => S.st(f, (ms || 0) / S.k, ...a); }
      else { S.v0 = S.v0 + (real - S.t0) * S.k; S.t0 = real; }
      S.k = k; cancelAnimationFrame(S.raf);
      const loop = () => { document.getAnimations().forEach(a => { if (a.playbackRate !== S.k) a.playbackRate = S.k; }); if (S.k !== 1) S.raf = requestAnimationFrame(loop); };
      loop(); return `慢動作 ${k}×`;
    },
    // 錄影標籤（2026-10-08 修正案 A1／原 35）：左下角一直顯示「版本 · 第幾階 · 現在在做什麼 · 秒數」，螢幕錄影會錄進去，
    // 之後 scripts/pet-video.js 找到的跳格，打開那一格就看得到是哪一版、哪個動作階段，不用猜
    tag() {
      let el = document.getElementById("ttTag"); if (el) { el.remove(); cancelAnimationFrame(window.__ttTagRaf); return "錄影標籤：關"; }
      el = document.createElement("div"); el.id = "ttTag"; el.style.cssText = "position:fixed;left:6px;bottom:calc(70px + env(safe-area-inset-bottom));z-index:2000;background:rgba(0,0,0,.72);color:#ffe9a8;font:600 11px/1.3 ui-monospace,monospace;padding:3px 7px;border-radius:8px;pointer-events:none;white-space:nowrap";
      document.body.appendChild(el); api.ver(); const t0 = performance.now(); let last = "";
      const tick = () => { const b = document.querySelector(".ps-box"), ph = typeof PetStage !== "undefined" && PetStage.phase ? PetStage.phase() : "—";
        const txt = `${api._ver || "…"} · ${b ? "第 " + b.dataset.stage + " 階" : "不在夥伴頁"} · ${ph} · ${((performance.now() - t0) / 1000).toFixed(1)}s`;
        if (txt !== last) { el.textContent = last = txt; } window.__ttTagRaf = requestAnimationFrame(tick); };
      window.__ttTagRaf = requestAnimationFrame(tick); return "錄影標籤：開（左下角）";
    },
    // 效能浮標：右上角每秒的 fps、這一秒的長任務（>50ms）數與最長
    fps() {
      let el = document.getElementById("ttFps"); if (el) { el.remove(); cancelAnimationFrame(window.__ttFpsRaf); return "效能浮標：關"; }
      el = document.createElement("div"); el.id = "ttFps"; el.style.cssText = "position:fixed;top:calc(6px + env(safe-area-inset-top));right:6px;z-index:2000;background:rgba(0,0,0,.72);color:#bff5c0;font:600 11px/1.3 ui-monospace,monospace;padding:4px 7px;border-radius:8px;pointer-events:none";
      document.body.appendChild(el); let n = 0, t0 = performance.now(), lt = [];
      try { new PerformanceObserver(l => l.getEntries().forEach(e => lt.push(e.duration))).observe({ entryTypes: ["longtask"] }); } catch (e) { /* Safari 沒有 longtask */ }
      const tick = () => { n++; const t = performance.now(); if (t - t0 >= 1000) { el.textContent = `${Math.round(n * 1000 / (t - t0))} fps` + (lt.length ? ` · 長任務 ${lt.length}（${Math.round(Math.max(...lt))}ms）` : ""); n = 0; t0 = t; lt = []; } window.__ttFpsRaf = requestAnimationFrame(tick); };
      window.__ttFpsRaf = requestAnimationFrame(tick); return "效能浮標：開";
    },
    // 餵食效能紀錄（2026-10-07 寵物新一輪 #1：使用者錄影裡神龍 18～58 fps，要能在手機上自己量）：
    // 餵一次、記下每一格的間隔，依當下在做什麼分段（游／尾巴送／吃），結束時跳出：平均 fps、最慢 1% 的 fps、最慢一格、超過 33ms（掉到 30fps 以下）的格數
    feedPerf() {
      const box = document.querySelector(".ps-box"), f = document.getElementById("petFeed"); if (!box || !f) return "先切到夥伴頁";
      ttDebug.addBerries(10); ttDebug.resetFeed(); api.ver();
      const seg = {}, phase = () => box.classList.contains("walking") ? "游／走" : box.__chain ? "尾巴送果實" : "吃、嚼、等";
      let last = 0, started = false, raf = 0;
      const tick = t => { if (last) { const k = phase(), d = t - last; (seg[k] || (seg[k] = [])).push(d); (seg.all || (seg.all = [])).push(d); } last = t;
        if (box.classList.contains("feeding")) started = true; else if (started) return report(); raf = requestAnimationFrame(tick); };
      const stat = a => { const s = a.slice().sort((x, y) => x - y), sum = a.reduce((x, y) => x + y, 0), p99 = s[Math.floor(s.length * .99)] || 0;
        return `${Math.round(a.length * 1000 / sum)} fps（最慢 1%：${Math.round(1000 / p99)} fps，最慢一格 ${Math.round(s[s.length - 1])}ms，掉到 30fps 以下 ${a.filter(x => x > 34).length} 格／${a.length}）`; };
      const report = () => { cancelAnimationFrame(raf); const st = +box.dataset.stage;
        const lines = Object.keys(seg).filter(k => k !== "all").map(k => `${k}：${stat(seg[k])}`);
        const msg = `${api._ver || ""}\n第 ${st} 階 · 整段 ${stat(seg.all || [16])}\n` + lines.join("\n") + `\n（${navigator.userAgent.includes("iPhone") ? "iPhone" : "這台裝置"}；截圖傳給開發者對照）`;
        console.log("[feedPerf]", msg); if (typeof ttAlertBox === "function") ttAlertBox(msg); };
      setTimeout(() => { f.click(); raf = requestAnimationFrame(tick); }, 300);
      return "開始記錄：餵一次，結束時跳出結果";
    },
    resetHug() { ls.removeItem("tt_pet_hug_day"); return "今天可以再抱一次（親密 +2）"; },
    // 時間快轉（2026-10-08 修正案 A9）：撥夥伴的時鐘（ttClock，pet-stage.js），作息、冷卻、禮物、節日、紀念日一起跟著走；
    // 只存在這次開啟（sessionStorage），撥過之後寫的日記標 dbg。會先拿掉面板強制的時段／睡著，才看得到真實的作息
    clock(k) {
      if (typeof ttClock === "undefined") return "沒有時鐘";
      const at = (h, m) => { const d = ttClock.date(); d.setHours(h, m || 0, 0, 0); if (d.getTime() <= ttClock.now()) d.setDate(d.getDate() + 1); return d; };   // 下一個 h:m
      if (k === null) ttClock.reset();
      else if (k === "+8h") ttClock.shift(8 * 3600e3);
      else if (k === "+1d") ttClock.shift(864e5);
      else if (k === "fest") { const now = ttClock.now(), nx = Object.values(PET_FEST).flat().map(x => new Date(x + "T10:00:00")).filter(d => d.getTime() > now).sort((a, b) => a - b)[0]; if (!nx) return "日期表裡沒有下一個節日了"; ttClock.set(nx); }
      else if (k === "ann") { const h = new Date(petHatch()), d = [30, 100, 365].map(n => { const x = new Date(h.getFullYear(), h.getMonth(), h.getDate() + n, 10); return x; }).find(x => x.getTime() > ttClock.now()); if (!d) return "已經過了一年，改用「+1天」"; ttClock.set(d); }
      else { const [h, m] = k.split(":").map(Number); ttClock.set(at(h, m)); }
      if (window.__ps) { delete window.__ps.tod; delete window.__ps.asleep; delete window.__ps.fest; }
      refresh(); return api.clockTxt();
    },
    clockTxt() { if (typeof ttClock === "undefined" || !ttClock.offset()) return "時間：真實"; const d = ttClock.date(), o = ttClock.offset() / 3600e3; return `時間：${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}（${o > 0 ? "+" : ""}${o.toFixed(1)} 小時）`; },
    // 版本（2026-10-08 修正案 A1）：網頁版本（sw.js）＋原生 build。效能紀錄、錄影標籤都帶這個，錄影才對得到是哪一版
    async ver() {
      if (api._ver) return api._ver;
      let w = ""; try { w = typeof appVersion === "function" ? await appVersion() : ""; } catch (e) { /* */ }
      let n = "web"; try { const A = window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() && Capacitor.Plugins && Capacitor.Plugins.App; if (A) { const i = await A.getInfo(); n = `${Capacitor.getPlatform()} ${i.version}(${i.build})`; } } catch (e) { /* */ }
      return (api._ver = `${w || "?"} · ${n}`);
    },

    // 加「走過某條步道」的測試行程（dbg:true，清測試行程會一起清掉）→ 明信片、生物、地區配件、舞台裝飾都從這裡推
    addTrail(t, daysAgo) {
      if (!t) return "找不到符合的步道";
      const d = new Date(); d.setDate(d.getDate() - (daysAgo == null ? Math.floor(Math.random() * 60) : daysAgo)); d.setHours(9, 0, 0, 0);
      Store.addRecord({ id: "dbg" + Date.now() + Math.random().toString(36).slice(2, 6), date: d.toISOString(), dbg: true, note: "測試行程", trailId: t.id, trailName: t.name,
        distanceKm: +(t.length_km || 3).toFixed(1), elapsedMs: 2 * 3600e3, ascent: t.ascent || 100, descent: t.ascent || 100, steps: 4000, kcal: 200, track: [] });
      refresh(); return `＋明信片：${t.name}（${t.region || ""}）`;
    },
    allNew() { ls.setItem("tt_pj_seen", "[]"); refresh(); return "明信片都會標「新」"; },   // 測「新」小標
    addRandomTrail() { const pool = TRAILS.filter(t => t.region && isFinite(t.lat)); return api.addTrail(pool[Math.floor(Math.random() * pool.length)]); },
    // 某個主題的步道走兩趟 → 舞台出現那個裝飾（瀑布／海景／古道／森林／湖泊）
    addTheme(tag) { const pool = TRAILS.filter(t => tagsOf(t)[0] === tag && t.region); const t = pool[Math.floor(Math.random() * pool.length)]; api.addTrail(t, 1); return api.addTrail(t, 2) + "（走兩趟）"; },
    // 五個地區各走一條 → 五個地區配件全解鎖
    allRegions() {
      const R = { 北部: ["臺北市", "新北市", "宜蘭縣"], 中部: ["臺中市", "南投縣"], 南部: ["高雄市", "屏東縣", "嘉義縣"], 東部: ["花蓮縣", "臺東縣"], 離島: ["澎湖縣", "金門縣", "連江縣"] };
      const got = []; for (const [r, cs] of Object.entries(R)) { const t = TRAILS.find(x => cs.includes(x.region)); if (t) { api.addTrail(t); got.push(r); } }
      return "已走過：" + got.join("、") + "（去裝扮看地區配件）";
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
      if (!Array.isArray(seen)) localStorage.setItem("tt_badges_seen", JSON.stringify(list.filter(b => b.got).map(b => b.id)));   // 確保非首跑，才會 toast
      const got = new Set(JSON.parse(localStorage.getItem("tt_badges_got") || "[]")); got.add(next.id);
      localStorage.setItem("tt_badges_got", JSON.stringify([...got]));
      try { if (typeof achCheckUnlocks === "function") achCheckUnlocks(); renderBadges(); } catch (e) { /* */ }
      return "已解鎖：" + next.n;
    },
    // 解鎖一半（每隔一個），做「進行中」的畫面測試
    halfAch() {
      const list = petBadges(), got = new Set(JSON.parse(localStorage.getItem("tt_badges_got") || "[]"));
      list.forEach((b, i) => { if (i % 2 === 0) got.add(b.id); });
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
    // ───── 第一波：戶外安全 ─────
    // 模擬日落：記錄中（可開模擬）時，記錄頁上方的天黑倒數會照這個時間算
    sunset(min) { if (min == null) { delete window.__ttSunsetAt; return "日落時間恢復正常"; } window.__ttSunsetAt = Date.now() + min * 60000; return min > 0 ? `模擬 ${min} 分鐘後日落（開始記錄後看記錄頁上方）` : "模擬天已經黑了（開始記錄後看記錄頁上方）"; },
    openSos() { if (typeof Outdoor !== "undefined") Outdoor.openSos(); return ""; },
    // ───── 第二波 ─────
    peaksStamp(nb = 5, nx = 8) {
      if (typeof Peaks === "undefined") return "收集冊還沒載入";
      const g = Peaks.got(), at = new Date().toISOString();
      const pick = (list, n) => Peaks.LISTS[list].data.filter(p => !g[list + p[0]]).sort(() => Math.random() - .5).slice(0, n).forEach(p => { g[list + p[0]] = { at, rec: "dbg" }; });
      pick("b", nb); pick("x", nx);
      localStorage.setItem("tt_peaks", JSON.stringify(g)); localStorage.setItem("tt_peaks_scan", "1");
      return `蓋了百岳 ${nb}、小百岳 ${nx} 座（日期今天）`;
    },
    peaksReset() { ["tt_peaks", "tt_peaks_scan"].forEach(k => localStorage.removeItem(k)); return "收集冊清空（下次打開會從紀錄重新補蓋）"; },
    openPeaks() { if (typeof Peaks !== "undefined") Peaks.open(); return ""; },
    // 每月挑戰：補幾筆這個月的測試行程，剛好達標（可再按「領取」測頭巾解鎖）
    challengeDone() {
      if (typeof Challenge === "undefined") return "每月挑戰還沒載入";
      const p = Challenge.progress(), needKm = Math.max(0, p.g.km - p.km), needN = Math.max(1, p.g.trips - p.trips);
      for (let i = 0; i < needN; i++) Store.addRecord({ id: "dbg-mch-" + Date.now() + i, date: new Date(Date.now() - i * 3600e3).toISOString(), dbg: true, note: "挑戰測試", distanceKm: +(needKm / needN + 0.2).toFixed(2), elapsedMs: 3600e3, ascent: 100, steps: 4000, track: [] });
      refresh(); try { Challenge.render(); } catch (e) { /* */ }
      return "已補到達標，去夥伴頁按「領取」";
    },
    challengeReset() {
      ["tt_mch", "tt_mch_done"].forEach(k => localStorage.removeItem(k));
      try { const own = new Set(JSON.parse(localStorage.getItem("tt_pet_hats_owned")) || ["none"]); own.delete("bandana"); localStorage.setItem("tt_pet_hats_owned", JSON.stringify([...own])); if (localStorage.getItem("tt_pet_hat") === "bandana") localStorage.removeItem("tt_pet_hat"); } catch (e) { /* */ }
      Store.setRecords(Store.getRecords().filter(r => !String(r.id).startsWith("dbg-mch-")));
      refresh(); try { Challenge.render(); } catch (e) { /* */ }
      return "每月挑戰重置（目標重算、頭巾收回、測試行程刪掉）";
    },
    // 收藏步道路況有變：拿一條林業署步道當收藏，模擬它剛封閉
    condAlert() {
      const t = TRAILS.find(x => x.source === "forestry" && !x.condition) || TRAILS.find(x => x.source === "forestry");
      if (!t) return "找不到林業署步道";
      if (!Store.isFav(t.id)) Store.toggleFav(t.id);
      if (typeof announceCondChanges === "function") announceCondChanges([{ t, was: "", now: "暫停開放" }]);
      return "";
    },
    openSummit() { const t = TRAILS.find(x => (x.alt_high || 0) >= 3000 && x.lat) || TRAILS.find(x => (x.alt_high || 0) >= 1000); if (!t) return "找不到高山步道"; openDetail(t.id); setTimeout(() => { const b = document.querySelector('#detailNav button[data-tab="rt"]'); if (b) b.click(); }, 500); return "已開啟「" + t.name + "」→ 路線分頁看山頂天氣"; },
    openReport() { const t = TRAILS.find(x => x.source === "forestry"); if (typeof TrailReports !== "undefined" && t) TrailReports.openForm(t); return ""; },
    // ───── 第三波 ─────
    // 留守：示範模式（不碰雲端）。min>0＝幾分鐘後到時間；負數＝已經超時幾分鐘
    guard(min) {
      if (min == null) { localStorage.removeItem("tt_guard"); if (typeof Guardian !== "undefined") Guardian.paintHud(); return "留守示範清掉了"; }
      const rec = typeof Recorder !== "undefined" && Recorder.getState() !== "idle";
      localStorage.setItem("tt_guard", JSON.stringify({ at: Date.now() + min * 60000, gs: [{ id: "dbg", name: "阿梅" }], trail: "測試步道", planId: "dbg", on: true, dbg: true }));
      if (typeof Guardian !== "undefined") Guardian.paintHud();
      return (rec ? "" : "（記錄頁上方會出現留守小條）") + (min < 0 ? `模擬已超時 ${-min} 分鐘` : `模擬 ${min} 分鐘後到預計下山時間`);
    },
    guardPlan(status = "overdue") {
      if (typeof Guardian === "undefined") return "";
      Guardian.openPlan(null, [{ id: "dbg", owner_name: "阿梅", owner_avatar: null, trail_name: "金瓜寮魚蕨步道", expected_at: new Date(Date.now() - (status === "overdue" ? 50 : -90) * 60000).toISOString(), status, last_lat: 24.93512, last_lon: 121.69876, last_at: new Date(Date.now() - 40 * 60000).toISOString() }]);
      return "";
    },
    // 步道人氣：在目前開著的步道詳情畫一張範例人氣卡（沒開就先開一條）
    crowdPreview() {
      const show = () => { const t = typeof currentDetailTrail === "function" && currentDetailTrail(); if (!t || typeof TrailCrowd === "undefined") return; const g = Array(28).fill(0); g[21] = 4; g[25] = 3; g[20] = 2; g[5] = 1; g[11] = 1; TrailCrowd.load(t, { crowd: { hikers7: 12, hikers30: 40, year_hikers: 88, grid: g }, act: { hikers: 5, median_ms: 9e6, median_ascent: 480 } }); const b = document.getElementById("activityBox"); if (b) b.scrollIntoView({ block: "center" }); };
      if (!(typeof currentDetailTrail === "function" && currentDetailTrail())) { const t = TRAILS.find(x => x.source === "forestry"); openDetail(t.id); setTimeout(show, 900); } else show();
      return "範例資料（真的資料要等大家走完匿名回傳）";
    },
    story(y) { ensureScript("js/analytics.js").then(() => ensureScript("js/year-story.js")).then(() => { if (typeof YearStory !== "undefined") YearStory.open(y || new Date().getFullYear()); }); return ""; },
    storyBanner() {
      const on = localStorage.getItem("tt_story_force") !== "1";
      if (on) localStorage.setItem("tt_story_force", "1"); else localStorage.removeItem("tt_story_force");
      localStorage.removeItem("tt_story_x"); refresh();
      return on ? "年底故事橫幅：強制顯示（我的頁上方；今年要有 3 趟以上）" : "年底故事橫幅：恢復只在 12 月～1 月顯示";
    },
    async widget() {
      if (typeof NativeLive === "undefined") return "沒有原生橋接";
      const a = await NativeLive.check();
      if (!a.widget && !a.live) return "這裡不是 iOS App，或小工具還沒開通（ENABLE_WIDGETS）";
      const ok = await NativeLive.pushWidget(true);
      return `小工具資料${ok ? "已推送" : "推送失敗"}；即時動態${a.live ? "可用" : "被系統關掉了"}`;
    },
    // ───── 裝置／外觀 ─────
    notch() {
      const on = !document.documentElement.classList.contains("sim-notch");
      document.documentElement.classList.toggle("sim-notch", on);
      try { if (on) localStorage.setItem("tt_sim_notch", "1"); else localStorage.removeItem("tt_sim_notch"); } catch (e) { /* */ }
      simNotchMarks();
      return on ? "模擬動態島＋Home 條（iPhone 15 Pro）：打開各頁和彈窗檢查有沒有被擋" : "關掉動態島模擬";
    },
    theme() { const order = ["light", "dark", "sun"], cur = themeMode(), next = order[(order.indexOf(cur) + 1) % order.length]; setTheme(next); return "外觀：" + { light: "淺色", dark: "深色", sun: "陽光高對比" }[next]; },
    state() { return { 成長km: +totalKm().toFixed(2), 等級: petStageIndex(totalKm()) + 1, 果實: berriesBalance(), 愛心: petHearts(), 親密度: affinity(), 今日km: +todayKm().toFixed(1), 出行次數: realRecords().length, debug里程: debugKm() }; },
    panel() { toggleDebugPanel(); },
    help() { console.log("ttDebug 新功能：sunset(分) openSos() peaksStamp(百岳,小百岳) peaksReset() challengeDone() challengeReset() condAlert() openSummit() openReport() guard(分) guardPlan() crowdPreview() story(年) storyBanner() widget() notch() theme()");
      console.log("ttDebug 指令：\n addKm(n) setLevel(0-6) maxLevel() evolve()\n addBerries(n) setAffinity(0-100) resetFeed() addDays(n)\n addHike(km) clearHikes()  ← 推進成就/每日環/足跡圖\n unlockAch() unlockNextAch() halfAch() resetAch()  ← 解鎖全部/下一個/一半/重置成就\n openAch() resetAchSeen()  ← 開成就頁/清解鎖提示重測 toast\n resetQuests()  ← 重置每日任務\n clearAllRecords()  ← 清空所有行程\n clearDebug() resetPet() state() panel()"); return api.state(); },
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
  if (window.loadSocial) { try { await window.loadSocial(); } catch (e) { /* 社群模組沒載好也照樣判斷 */ } }   // 以前社群還沒載入時一律判定「不是開發者」
  if (!(await ttIsOwner())) { if (typeof toast === "function") toast("測試面板僅限開發者使用"); return; }
  p = document.createElement("div");
  p.id = "debugPanel"; p.className = "debug-panel";
  const closeAnd = fn => () => { const dp = document.getElementById("debugPanel"); if (dp) dp.remove(); return fn(); };
  // 看得到效果的夥伴按鈕：收起面板（面板會蓋住夥伴卡）→ 切到夥伴頁 → 把舞台捲到畫面中間 → 再做（2026-10-07 使用者：新的按鈕有些沒反應＝被面板擋住）
  const seePet = fn => closeAnd(() => { const tab = document.querySelector('.tab[data-view="pet"]'); if (tab && document.body.dataset.view !== "pet") tab.click();
    setTimeout(() => { const b = document.querySelector(".ps-box"); if (b) b.scrollIntoView({ block: "center", behavior: "smooth" }); setTimeout(fn, 450); }, 250); });
  const feedWith = xs => seePet(() => { ttDebug.spots(xs); ttDebug.addBerries(10); ttDebug.resetFeed(); setTimeout(() => { const f = document.getElementById("petFeed"); if (f) f.click(); }, 300); });
  const tourReset = () => { ["tt_onboarded_v2", "tt_tour_resume"].forEach(k => localStorage.removeItem(k)); };
  const SECTIONS = [
    ["夥伴", [
      ["+5km", () => ttDebug.addKm(5)], ["+20km", () => ttDebug.addKm(20)], ["進化➡", () => ttDebug.evolve()], ["神龍🐉", () => ttDebug.maxLevel()],
      ["+50🍓", () => ttDebug.addBerries(50)], ["❤️滿", () => ttDebug.setAffinity(100)], ["可再餵", () => ttDebug.resetFeed()], ["+30天", () => ttDebug.addDays(30)],
      ["重置🥚", () => ttDebug.resetPet()], ["清debug", () => ttDebug.clearDebug()],
    ]],
    // 2026-10-07 寵物新一輪：每一樣新東西都能在這裡直接試（不會寫進日記：測試期間的日記標 dbg、清 debug 一起刪）
    ["夥伴新功能（試玩用）", [
      ["😴睡著→點牠叫醒", seePet(() => ttDebug.stage("asleep", true))],
      ["🌲不在時做了什麼", seePet(() => { localStorage.setItem("tt_pet_seen", String(Date.now() - 5 * 3600e3)); window.__petLine = null; renderPet(); return ""; })],
      ["🥾健行感想", seePet(() => { localStorage.removeItem("tt_pet_recap"); Store.addRecord({ id: "dbg" + Date.now(), date: new Date().toISOString(), dbg: true, note: "測試行程", trailName: "測試", distanceKm: 12.3, elapsedMs: 4 * 3600e3, ascent: 820, steps: 9000, track: [] }); window.__petLine = null; renderPet(); return "（測試行程，清測試行程會一起清掉）"; })],
      ["🎁帶禮物回來", seePet(() => { localStorage.setItem("tt_pet_aff", "100"); localStorage.setItem("tt_pet_aff_t", new Date().toISOString()); localStorage.removeItem("tt_pet_gift_t"); window.__petGiftT = 0; renderPet(); return "親密設成滿、2.6 秒後牠帶東西回來"; })],
      ["🎂相遇第100天", seePet(() => { localStorage.setItem("tt_pet_hatch", new Date(Date.now() - 100 * 864e5).toISOString()); window.__petLine = null; renderPet(); return "相遇日改成 100 天前（重置🥚會還原）"; })],
      ["🍓好友送果實", seePet(() => { if (typeof petGiftBerries === "function") { ttDebug.addBerries(4); setTimeout(() => petGiftBerries(4), 300); } return ""; })],
      ["🦊朋友來串門子", seePet(() => { if (typeof PetStage !== "undefined" && PetStage.guest) PetStage.guest({ svg: PET_ART.svg(Math.floor(Math.random() * 7), "", "crown"), stay: 3600 }).then(ok => { if (!ok) toast("牠在忙或睡著，等一下再試"); }); return ""; })],   /* 原本的物種：測試用的訪客 */
      ["🌰玩松果", seePet(() => { const b = document.getElementById("petPlay"); if (b) b.click(); return ""; })],
      ["📷拍照", seePet(() => { if (typeof openPetPhoto === "function") openPetPhoto(); return ""; })],
      ["🎨配色全解鎖", () => { window.__toneAll = true; petApplyTone(); renderPet(); return "配色全解鎖（只在這次開 App 有效；清除測試資料會恢復）"; }],
      ["🎨換下一個配色", () => { const T = [["", "原色"], ["deep", "深林"], ["sea", "海風"], ["alpine", "高山"]], cur = T.findIndex(t => t[0] === (localStorage.getItem("tt_pet_tone") || "")), nx = T[(cur + 1) % T.length]; window.__toneAll = true; localStorage.setItem("tt_pet_tone", nx[0]); petApplyTone(); renderPet(); return `夥伴換成「${nx[1]}」配色（原色→深林→海風→高山）`; }],
      ["🎨配色對照表", () => { const i = petStageIndex(totalKm()), cur = petTone(), T = [["", "原色"], ["deep", "深林"], ["sea", "海風"], ["alpine", "高山"]];
        const cells = T.map(([k, l]) => { PET_ART.setTone(k); const u = PET_ART.own(() => PET_ART.dataUri(i, 160, petHat(), undefined, petAcc())); return `<div style="text-align:center"><img src="${u}" width="72" height="72" alt=""><div style="font-size:12px">${l}</div></div>`; }).join("");
        petApplyTone(); PET_ART.setTone(cur);
        ttChoice({ html: `<p><b>四種配色（目前：${(T.find(t => t[0] === cur) || T[0])[1]}）</b></p><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px">${cells}</div>` }, [{ label: "關閉", value: null }]); }],
      ["🏕擺設全解鎖", () => { localStorage.setItem("tt_pet_gifts", JSON.stringify(Object.keys(PET_GIFTS).map(id => ({ id, t: new Date().toISOString() })))); window.__petPropsAll = true; renderPet(); return Object.keys(PET_GIFTS).length + " 個小東西都有了；四個里程碑小物照真實條件（加里程／測試行程可達成）"; }],
      ["😵搖手機頭暈", seePet(() => ttDebug.react("dizzy"))], ["🤲來回摸", seePet(() => ttDebug.react("rub"))],
      ["🔄心情過場", seePet(() => { localStorage.setItem("tt_pet_mood_last", "x"); window.__petLine = null; renderPet(); return ""; })],
      ["🧹清空夥伴日記", () => { localStorage.removeItem("tt_pet_diary"); return "日記清空了（相遇、第一次出門會從資料重新算）"; }],
    ].map(([l, f]) => [l, (...a) => { window.__petDbg = true; return f(...a); }])],   // 按過這一組＝在測試：之後寫的日記、拿到的小東西都標 dbg
    ["夥伴動畫（調動畫用）", [
      ["🥚蛋", seePet(() => ttDebug.setLevel(0))], ["🐛毛毛蟲", seePet(() => ttDebug.setLevel(1))], ["🦋蝴蝶", seePet(() => ttDebug.setLevel(2))], ["🦊狐", seePet(() => ttDebug.setLevel(3))], ["🐯虎", seePet(() => ttDebug.setLevel(4))], ["🐲幼龍", seePet(() => ttDebug.setLevel(5))], ["🐉神龍", seePet(() => ttDebug.setLevel(6))],
      ["🍓看餵食", closeAnd(() => { ttDebug.addBerries(10); ttDebug.resetFeed(); document.querySelector('.tab[data-view="pet"]').click(); setTimeout(() => { const f = document.getElementById("petFeed"); if (f) { f.scrollIntoView({ block: "center" }); setTimeout(() => f.click(), 400); } }, 500); })],
      ["🐢0.25×", () => ttDebug.slow(.25)], ["🚶0.5×", () => ttDebug.slow(.5)], ["▶1×", () => ttDebug.slow(1)],
      ["😴睏", seePet(() => ttDebug.mood("sleepy"))], ["🙂普通", seePet(() => ttDebug.mood("content"))], ["😄開心", seePet(() => ttDebug.mood("happy"))], ["🥺想念", seePet(() => ttDebug.mood("longing"))], ["↺心情回真實", seePet(() => ttDebug.mood(null))],
      ["📍餵：左中右", feedWith([-62, 8, 66])], ["📍餵：都在後面", feedWith([-74, -50, -26])], ["📍餵：都在前面", feedWith([22, 46, 70])], ["📍餵：神龍雲上", feedWith([82, 108, 136])], ["📍餵：隨機", feedWith(null)],
      ["🤗抱抱", seePet(() => ttDebug.react("hug"))], ["✋摸頭", seePet(() => ttDebug.react("pat"))], ["🫳搔癢", seePet(() => ttDebug.react("tickle"))], ["🐾跳", seePet(() => ttDebug.act("hop"))], ["🙆伸懶腰", seePet(() => ttDebug.act("stretch"))], ["😮‍💨嘆氣", seePet(() => ttDebug.act("sigh"))], ["👀東張西望", seePet(() => ttDebug.act("look"))], ["✨專屬小動作", seePet(() => ttDebug.act("special"))], ["💦甩水", seePet(() => ttDebug.act("shake"))], ["🥶發抖", seePet(() => ttDebug.act("shiver"))], ["😌晒太陽", seePet(() => ttDebug.act("bask"))], ["🎆進化儀式", () => { if (typeof celebrateEvolve === "function") { const i = Math.max(1, petStageIndex(totalKm())); celebrateEvolve(petStageInfo(i), i + 1); } return ""; }],
      ["🎩換帽子", seePet(() => ttDebug.hat())], ["📈效能浮標", () => ttDebug.fps()], ["🏷錄影標籤", () => ttDebug.tag()], ["📊餵食效能紀錄", seePet(() => ttDebug.feedPerf())], ["🎯除錯標記", () => (typeof PetStage !== "undefined" && PetStage.debug() ? "餵食除錯標記：開（紅＝嘴、綠＝果實、藍＝腳掌、黃＝接觸點）" : "餵食除錯標記：關")],
    ]],
    ["夥伴舞台與旅行", [
      ["🌅清晨", () => ttDebug.stage("tod", "dawn")], ["☀白天", () => ttDebug.stage("tod", "day")], ["🌇黃昏", () => ttDebug.stage("tod", "dusk")], ["🌙夜晚", () => ttDebug.stage("tod", "night")], ["😴睡著", seePet(() => ttDebug.stage("asleep", true))], ["🏮新年", seePet(() => ttDebug.stage("fest", "ny"))], ["🎋端午", seePet(() => ttDebug.stage("fest", "db"))], ["🥮中秋", seePet(() => ttDebug.stage("fest", "ma"))], ["🎅季節配件當季", () => { window.__hatSeasonAll = !window.__hatSeasonAll; return "季節限定配件：" + (window.__hatSeasonAll ? "當季（可以拿）" : "照真實日期"); }], ["⏰醒著", () => ttDebug.stage("asleep", false)],
      ["🌸春", () => ttDebug.stage("season", "spring")], ["🌿夏", () => ttDebug.stage("season", "summer")], ["🍁秋", () => ttDebug.stage("season", "autumn")], ["❄冬", () => ttDebug.stage("season", "winter")],
      ["🎯餵食除錯標記", () => (typeof PetStage !== "undefined" && PetStage.debug() ? "餵食除錯標記：開（紅＝嘴、綠＝果實、藍＝腳掌、黃＝接觸點）" : "餵食除錯標記：關")], ["🌧下雨", () => ttDebug.stage("wx", "rain")], ["☁陰天", () => ttDebug.stage("wx", "cloud")], ["🌨下雪", () => ttDebug.stage("wx", "snow")], ["🌤晴", () => ttDebug.stage("wx", "")], ["🌬起風", () => ttDebug.stage("feel", "windy")], ["🧣寒流", () => ttDebug.stage("feel", "cold")], ["🥵好熱", () => ttDebug.stage("feel", "hot")], ["💭夢泡泡", seePet(() => { ttDebug.stage("asleep", true); setTimeout(() => PetStage.dream(), 400); return ""; })],
      ["↺回真實時間天氣", () => ttDebug.stage(null)],
      ["⏩清晨 6:30", seePet(() => ttDebug.clock("6:30"))], ["⏩黃昏 18:00", seePet(() => ttDebug.clock("18:00"))], ["⏩深夜 23:00", seePet(() => ttDebug.clock("23:00"))], ["⏩下個節日", seePet(() => ttDebug.clock("fest"))], ["⏩下個紀念日", seePet(() => ttDebug.clock("ann"))], ["⏩+8小時", seePet(() => ttDebug.clock("+8h"))], ["⏩+1天", seePet(() => ttDebug.clock("+1d"))], ["⏹真實時間", seePet(() => ttDebug.clock(null))],
      ["🐾跳一下", seePet(() => ttDebug.act("hop"))], ["🙆伸懶腰", seePet(() => ttDebug.act("stretch"))], ["👀東張西望", seePet(() => ttDebug.act("look"))], ["🤗今天可再抱", () => ttDebug.resetHug()],
      ["🍓看餵食動畫", closeAnd(() => { ttDebug.addBerries(10); ttDebug.resetFeed(); document.querySelector('.tab[data-view="pet"]').click(); setTimeout(() => { const f = document.getElementById("petFeed"); if (f) { f.scrollIntoView({ block: "center" }); setTimeout(() => f.click(), 500); } }, 600); })],
      ["✨看進化動畫", closeAnd(() => { const i = petStageIndex(totalKm()); celebrateEvolve(PET_STAGES[i], i + 1); })],
      ["📮＋明信片(隨機)", () => ttDebug.addRandomTrail()], ["🗾五區全走過", () => ttDebug.allRegions()],
      ["💧＋瀑布×2", () => ttDebug.addTheme("瀑布")], ["🌊＋海景×2", () => ttDebug.addTheme("海景")], ["🪨＋古道×2", () => ttDebug.addTheme("古道")], ["🌲＋森林×2", () => ttDebug.addTheme("森林")], ["🏞＋湖泊×2", () => ttDebug.addTheme("湖泊")],
      ["📮開明信片簿", closeAnd(() => PetJourney.openAlbum("cards"))], ["🗾開走過的縣市", closeAnd(() => PetJourney.openAlbum("regions"))], ["🖼開第一張明信片", closeAnd(() => { const w = PetJourney.walked(); if (!w.length) return "先按「＋明信片」"; PetJourney.openCard(w[0].t.id); })], ["🆕全部標成新的", () => ttDebug.allNew()],
      ["🗺地圖夥伴：小跑", () => { window.__recPet = "fast"; return "記錄中地圖上的夥伴會小跑（開模擬記錄看）"; }], ["🗺地圖夥伴：坐下", () => { window.__recPet = "rest"; return "記錄中地圖上的夥伴會坐下（開模擬記錄看）"; }], ["🗺地圖夥伴：喘", () => { window.__recPet = "climb"; return "記錄中地圖上的夥伴爬坡喘氣（開模擬記錄看）"; }], ["🗺地圖夥伴：恢復", () => { window.__recPet = null; return "地圖夥伴跟真實速度／休息"; }],
      ["🧹清測試步道", () => ttDebug.clearHikes()],
    ]],
    ["行程與成就", [
      ["＋行程3km", () => ttDebug.addHike(3)], ["＋行程10km", () => ttDebug.addHike(10)], ["清測試行程", () => ttDebug.clearHikes()],
      ["🏅解全成就", () => ttDebug.unlockAch()], ["🏅解下一個", () => ttDebug.unlockNextAch()], ["🏅解一半", () => ttDebug.halfAch()], ["🏅重置成就", () => ttDebug.resetAch()],
      ["🏅開成就頁", closeAnd(() => ttDebug.openAch())], ["🏅清解鎖提示", () => ttDebug.resetAchSeen()], ["📅重置每日任務", () => ttDebug.resetQuests()],
      ["🗑清所有行程", async () => { if (await ttConfirm("清空全部行程記錄？", "清空", "取消", { danger: true })) return ttDebug.clearAllRecords(); }],
    ]],
    ["第一波：安全", [
      ["🌇30分後日落", () => ttDebug.sunset(30)], ["🌙天已經黑", () => ttDebug.sunset(-1)], ["日落恢復", () => ttDebug.sunset(null)],
      ["🆘求救卡", closeAnd(() => ttDebug.openSos())],
    ]],
    ["第二波：資料", [
      ["⛰蓋5+8座章", () => ttDebug.peaksStamp(5, 8)], ["⛰清收集冊", () => ttDebug.peaksReset()], ["⛰開收集冊", closeAnd(() => ttDebug.openPeaks())],
      ["🚩挑戰達標", () => ttDebug.challengeDone()], ["🚩重置挑戰", () => ttDebug.challengeReset()],
      ["⚠收藏路況變了", () => ttDebug.condAlert()], ["🌡山頂天氣", closeAnd(() => ttDebug.openSummit())], ["📣回報路況", closeAnd(() => ttDebug.openReport())],
    ]],
    ["第三波", [
      ["🛡留守5分後到", () => ttDebug.guard(5)], ["🛡留守已超時", () => ttDebug.guard(-40)], ["🛡清留守", () => ttDebug.guard(null)],
      ["🛡留守人看到的", closeAnd(() => ttDebug.guardPlan("overdue"))], ["👥人氣範例", closeAnd(() => ttDebug.crowdPreview())],
      ["📖今年故事", closeAnd(() => ttDebug.story())], ["📖去年故事", closeAnd(() => ttDebug.story(new Date().getFullYear() - 1))], ["📖年底橫幅", () => ttDebug.storyBanner()],
      ["📱推小工具", () => ttDebug.widget()],
    ]],
    ["第四波", [
      ["🔎一句話搜尋", closeAnd(() => { const tab = document.querySelector('.tab[data-view="explore"]'); if (tab) tab.click(); setTimeout(() => { const i = document.getElementById("searchInput"); if (!i) return; i.value = "台北 3 小時內 有瀑布 不要太陡"; i.dispatchEvent(new Event("input", { bubbles: true })); }, 300); })],
      ["🐾拜訪夥伴範例", closeAnd(async () => { if (window.loadSocial) await window.loadSocial(); Pets.visit({ id: "demo", handle: "mei_trail", pet_name: "毛毛", pet_level: 5, total_km: 420 }, false, null); })],
      ["🏔山社", closeAnd(async () => { if (window.loadSocial) await window.loadSocial(); Clubs.open(); })],
      ["📄登山計畫書", closeAnd(() => Guardian.planDoc(TRAILS.find(x => (x.alt_high || 0) > 2500) || TRAILS[0]))],
      ["🧭附近步道（記錄中）", closeAnd(async () => {   // 假裝站在金瓜寮步道中段、記錄中，開「附近步道」
        const t = TRAILS.find(x => x.id === "forestry-004"); await ensureGeo(t.region); const s = geoOf(t)[0], q = s[Math.floor(s.length / 2)];
        document.querySelector('.tab[data-view="record"]').click(); recSnap = { track: [{ lat: q[0], lon: q[1] }] }; openNearRoutes();
      })],
      ["🔋低電量提醒", closeAnd(async () => {   // 模擬電量 25%、一小時掉 20%
        const real = NativeLive.battery; NativeLive.battery = async () => ({ level: 0.25, charging: false });
        const gs = Recorder.getState; Recorder.getState = () => "recording";
        _batt = { last: 0, asked: false, samples: [{ t: Date.now() - 3600e3, l: 0.45 }] };
        try { await checkBattery(); } finally { NativeLive.battery = real; Recorder.getState = gs; }
      })],
      ["📅揪團（免責提醒）", closeAnd(async () => { if (window.loadSocial) await window.loadSocial(); Events.open(); })],
      ["📊進階分析", closeAnd(() => ensureScript("js/analytics.js").then(() => openAnalytics()))], ["🗓年度回顧", closeAnd(() => ensureScript("js/analytics.js").then(() => openYearReview()))],   // analytics.js 延遲載入
      ["🧾結算頁範例", closeAnd(async () => {   // 一趟真的（非模擬）的金瓜寮：看收穫、移動時間、跟預估比、這趟的海拔
        const t = TRAILS.find(x => x.id === "forestry-004"); await ensureGeo(t.region);
        const pts = [].concat(...geoOf(t)); let tt = Date.now() - 3 * 3.6e6; const t0 = tt;
        const track = pts.map((q, i) => { tt += (i === Math.floor(pts.length / 2) ? 15 * 60000 : 150000); return { lat: q[0], lon: q[1], alt: 300, t: tt, acc: 6 }; });
        openTrackReview({ id: "dbg-sum", date: new Date(tt).toISOString(), trailName: t.name, trailId: t.id, distanceKm: 1.38, elapsedMs: tt - t0, ascent: 84, descent: 86, altHigh: 344, altLow: 284, altCorrected: true, kcal: 300, steps: 1950, track }, true);
      })],
    ]],
    ["裝置與外觀", [
      ["📱模擬動態島", () => ttDebug.notch()], ["🎨切外觀", () => ttDebug.theme()],
      // 模擬免費用戶：看非會員的畫面（PRO 標籤、升級面板、額度限制、社群入口）。切換後重新載入；再按一次恢復
      [window.TT_DEBUG_FREE ? "💎恢復會員畫面" : "👤模擬免費用戶", () => { try { if (window.TT_DEBUG_FREE) localStorage.removeItem("tt_debug_free"); else localStorage.setItem("tt_debug_free", "1"); } catch (e) { /* */ } location.reload(); }],
      ["🌐重看語言選擇", closeAnd(() => { localStorage.removeItem("tt_lang"); tourReset(); langGate(true); })],
    ]],
    ["管理", [
      ["🛡檢舉處理", closeAnd(() => ensureScript("js/admin.js").then(() => Admin.open("queue")))],
      ["🐞錯誤紀錄", closeAnd(() => ensureScript("js/admin.js").then(() => Admin.open("errors")))],
    ]],
    ["導覽", [
      ["🧭導覽(中)", closeAnd(() => { tourReset(); onboarding(true, { previewLang: "zh", startAt: 0 }); })],
      ["🧭導覽(英)", closeAnd(() => { tourReset(); onboarding(true, { previewLang: "en", startAt: 0 }); })],
      ["🧭重設情境導覽", closeAnd(() => { ["tt_coach_trail", "tt_coach_team", "tt_coach_record", "tt_coach_record_tools", "tt_coach_peaks", "tt_coach_soc_friends", "tt_coach_soc_explore", "tt_coach_soc_search", "tt_coach_soc_notif", "tt_coach_soc_me"].forEach(k => localStorage.removeItem(k)); toast("情境導覽已重設：重新打開步道／小隊／記錄／收集冊／社群各頁就會再出現"); })],
    ]],
  ];
  // 夥伴的按鈕依用途重新分組（2026-10-09 修正案 R9）：以前四組、超過 100 顆，調動畫時找不到；照按鈕名稱自動分，之後加新按鈕也會落到對的組
  { const isPet = t => /^夥伴/.test(t), seen = new Set(), all = [];
    SECTIONS.filter(([t]) => isPet(t)).forEach(([, bs]) => bs.forEach(b => { if (!seen.has(b[0])) { seen.add(b[0]); all.push(b); } }));
    const RULES = [
      ["夥伴：效能與錄影", /效能|錄影|除錯標記|0\.25×|0\.5×|▶1×/],
      ["夥伴：時間", /清晨|白天|黃昏|夜晚|睡著|醒著|⏩|⏹|真實時間/],
      ["夥伴：天氣、季節與節日", /新年|端午|中秋|^🌸春|^🌿夏|^🍁秋|^❄冬|下雨|陰天|下雪|^🌤晴|起風|寒流|好熱|夢泡泡|季節配件/],
      ["夥伴：收藏", /明信片|五區|瀑布|海景|古道|森林|湖泊|縣市|全部標成新|擺設|測試步道|配色/],
      ["夥伴：陪伴", /地圖夥伴|拍照|好友送果實|串門子|帶禮物|日記|相遇第|健行感想|不在時|音效/],
      ["夥伴：角色與心情", /^🥚蛋|毛毛蟲|^🦋|^🦊|^🐯|^🐲|^🐉神龍|睏|普通|開心|想念|心情|帽子|進化儀式/],
      ["夥伴：餵食與玩", /餵|玩松果/],
      ["夥伴：小動作", /抱抱|摸頭|搔癢|跳|伸懶腰|嘆氣|東張西望|專屬|甩水|發抖|晒太陽|頭暈|來回摸/],
    ];
    const groups = RULES.map(([t]) => [t, []]), data = ["夥伴：資料", []];
    all.forEach(b => { const k = RULES.findIndex(([, re]) => re.test(b[0])); (k >= 0 ? groups[k][1] : data[1]).push(b); });
    const rest = SECTIONS.filter(([t]) => !isPet(t));
    SECTIONS.splice(0, SECTIONS.length, ...[data, ...groups].filter(g => g[1].length), ...rest);
  }
  const stateTxt = () => { const st = ttDebug.state(); return `Lv${st.等級}·${st.成長km}km·🍓${st.果實}` + (typeof ttClock !== "undefined" && ttClock.offset() ? " · ⏩" + ttDebug.clockTxt().slice(3) : "") + (ttDebug._ver ? " · " + ttDebug._ver : ""); };
  p.innerHTML = `<div class="dbg-h">🛠 測試面板 <span id="dbgState"></span><button id="dbgClose" aria-label="關閉">✕</button></div><div class="dbg-body"></div>`;
  const body = p.querySelector(".dbg-body");
  let open = 0; try { open = +(sessionStorage.getItem("tt_dbg_open") || 0); } catch (e) { /* */ }
  SECTIONS.forEach(([title, btns], si) => {
    const d = document.createElement("details"); d.className = "dbg-sec"; if (si === open) d.open = true;
    d.innerHTML = `<summary>${title}<small>${btns.length}</small></summary><div class="dbg-grid"></div>`;
    d.addEventListener("toggle", () => { if (d.open) { try { sessionStorage.setItem("tt_dbg_open", String(si)); } catch (e) { /* */ } body.querySelectorAll(".dbg-sec").forEach(x => { if (x !== d) x.open = false; }); } });
    const grid = d.querySelector(".dbg-grid");
    btns.forEach(([t, fn]) => {
      const b = document.createElement("button"); b.textContent = t;
      b.onclick = () => { Promise.resolve(fn()).then(r => { if (typeof r === "string" && r && typeof toast === "function") toast(r); }).catch(() => { }).finally(() => { const s = document.getElementById("dbgState"); if (s) s.textContent = stateTxt(); }); };
      grid.appendChild(b);
    });
    body.appendChild(d);
  });
  p.querySelector("#dbgClose").onclick = () => p.remove();
  document.body.appendChild(p);
  document.getElementById("dbgState").textContent = stateTxt();
  ttDebug.ver().then(() => { const el = document.getElementById("dbgState"); if (el) el.textContent = stateTxt(); });
}
// 開啟方式（在 app.js）：網址 ?debug=1，或連點 header 標題 5 下 → 這支檔案才載入
