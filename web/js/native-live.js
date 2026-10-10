// iOS 原生：記錄中的鎖定畫面／動態島（Live Activity）＋主畫面小工具的資料。
// 原生端是 ios/App/App/TrailLivePlugin.swift（JS 名稱 TrailLive），小工具擴充要在 Codemagic 開 ENABLE_WIDGETS 才會編進去
// （步驟：docs/ios-widgets.md）。沒有這個外掛（網頁、Android、還沒開小工具的 iOS）時這裡什麼都不做。
const NativeLive = (() => {
  const T = s => (typeof ttT === "function" ? ttT(s) : s);
  let P = null, avail = null, active = false, lastSent = 0, lastSig = "", lastWidgetSig = "", lastPetSig = "", busy = false;
  function plugin() {
    if (P) return P;
    const C = window.Capacitor;
    if (!C || !C.isNativePlatform || !C.isNativePlatform() || C.getPlatform && C.getPlatform() !== "ios") return null;
    try { P = C.registerPlugin ? C.registerPlugin("TrailLive") : (C.Plugins && C.Plugins.TrailLive) || null; } catch (e) { P = null; }
    return P;
  }
  async function check() {
    if (avail) return avail;
    const p = plugin(); if (!p) return (avail = { live: false, widget: false });
    try { avail = await p.available(); } catch (e) { avail = { live: false, widget: false }; }   // 原生沒有這個外掛 → 不支援
    return avail;
  }
  // 電量：iOS 走原生外掛（舊版 App 沒這個方法就回 null）；其他瀏覽器有 Battery API 就用（Android Chrome、桌機）；都沒有回 null
  async function battery() {
    const p = plugin();
    if (p && p.battery) { try { const r = await p.battery(); if (r && r.level >= 0) return { level: +r.level, charging: !!r.charging }; } catch (e) { /* 舊版原生沒有 */ } }
    if (navigator.getBattery) { try { const b = await navigator.getBattery(); return { level: b.level, charging: b.charging }; } catch (e) { /* */ } }
    return null;
  }
  function liveState(s) {
    const alt = s.altSeries && s.altSeries.length ? s.altSeries[s.altSeries.length - 1].e : 0;
    return {
      km: Math.round((s.distanceKm || 0) * 100) / 100,
      ascent: Math.round(s.ascent || 0),
      altitude: Math.round(alt || 0),
      startedAt: Date.now() - (s.elapsedMs || 0),   // 扣掉暫停的計時起點：鎖定畫面的系統計時器自己走
      paused: s.state === "paused",
      elapsed: Math.round((s.elapsedMs || 0) / 1000),
      // 夥伴的狀態（第三版 R14）：鎖定畫面／動態島畫夥伴的靜態圖＋小記號——休息（暫停或停下來）、爬坡喘、走
      mood: s.state === "paused" || document.body.classList.contains("rec-resting") ? "rest" : document.body.classList.contains("rec-climb") ? "pant" : "walk",
    };
  }
  // 每 5 秒看一次記錄狀態；里程、爬升、暫停有變才送（最快 15 秒一次，省電）
  async function tick() {
    if (busy || typeof Recorder === "undefined") return;
    busy = true;
    try {
      const s = Recorder.snapshot();
      if (s.state === "idle") {
        if (active) { active = false; lastSig = ""; try { await plugin().end(liveState(Object.assign({}, s, { state: "paused" }))); } catch (e) { /* */ } pushWidget(true); }
        return;
      }
      if (s.sim) return;   // 模擬不上鎖定畫面
      const a = await check(); if (!a.live) return;
      const st = liveState(s);
      if (!active) {
        const name = (Recorder._trailName && Recorder._trailName !== "自由路線") ? T(Recorder._trailName) : T("自由路線");
        const labels = { km: T("公里"), up: T("爬升"), alt: T("海拔"), rec: T("記錄中"), paused: T("暫停"), walk: T("夥伴跟著走"), rest: T("夥伴在休息"), pant: T("夥伴喘口氣") };
        try { const r = await plugin().start(Object.assign({ trail: name, labels }, st)); active = !!(r && r.ok); } catch (e) { active = false; }
        lastSent = Date.now(); lastSig = `${st.km}|${st.ascent}|${st.paused}|${st.mood}`;
        return;
      }
      const sig = `${st.km}|${st.ascent}|${st.paused}|${st.mood}`;
      const pausedChanged = lastSig.split("|")[2] !== String(st.paused);
      if (sig !== lastSig && (pausedChanged || Date.now() - lastSent > 15000)) {
        lastSig = sig; lastSent = Date.now();
        try { await plugin().update(st); } catch (e) { /* */ }
      }
    } finally { busy = false; }
  }

  // ───────── 主畫面小工具 ─────────
  function weekKm() {
    const now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));   // 這週一
    return (typeof realRecords === "function" ? realRecords() : []).filter(r => new Date(r.date) >= start).reduce((s, r) => s + (r.distanceKm || 0), 0);
  }
  function hikedToday() {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return (typeof realRecords === "function" ? realRecords() : []).some(r => new Date(r.date) >= d);
  }
  // 小工具的夥伴圖（第三版 R14）：戴著現在的帽子＋配件、自己的配色；睡覺時間另外一張閉眼的
  function petPng(pose) {
    return new Promise(res => {
      if (typeof PET_ART === "undefined" || !PET_ART.dataUri || typeof petStageIndex !== "function") return res(null);
      const hat = typeof petHat === "function" ? petHat() : undefined, acc = typeof petAcc === "function" ? petAcc() : undefined, i = petStageIndex(totalKm());
      const uri = PET_ART.own ? PET_ART.own(() => PET_ART.dataUri(i, 240, hat, pose, acc)) : PET_ART.dataUri(i, 240, hat, pose, acc);
      const im = new Image();
      im.onload = () => { try { const c = document.createElement("canvas"); c.width = c.height = 240; c.getContext("2d").drawImage(im, 0, 0, 240, 240); res(c.toDataURL("image/png").split(",")[1]); } catch (e) { res(null); } };
      im.onerror = () => res(null);
      im.src = uri;
    });
  }
  // 節日（R14）：未來一年的節日、前後一天都算，連同那一句一起交給小工具（App 沒開也會到那天就掛燈籠）
  function festDays() {
    if (typeof PET_FEST === "undefined" || typeof PET_FEST_LINE === "undefined") return [];
    const out = [], now = Date.now(), pad = n => String(n).padStart(2, "0"), ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    for (const k in PET_FEST) for (const day of PET_FEST[k]) {
      const c = new Date(day + "T12:00:00"); if (c.getTime() < now - 2 * 864e5 || c.getTime() > now + 366 * 864e5) continue;
      for (const o of [-1, 0, 1]) { const d = new Date(c.getTime() + o * 864e5); out.push({ d: ymd(d), k, t: T(PET_FEST_LINE[k]) }); }
    }
    return out;
  }
  async function pushWidget(force) {
    const a = await check(); if (!a.widget) return false;
    const ps = typeof petStats === "function" ? petStats() : null;
    let goal = null, month = 0;
    try { if (typeof Challenge !== "undefined") { const p = Challenge.progress(); goal = p.g.km; month = Math.round(p.km * 10) / 10; } } catch (e) { /* */ }
    const data = {
      streak: typeof daysStreak === "function" ? daysStreak() : 0,
      weekKm: Math.round(weekKm() * 10) / 10,
      monthKm: month, goalKm: goal,
      petName: ps ? ps.name : "", petLevel: ps ? ps.level : 1,
      hikedToday: hikedToday(),
      // 夥伴現在在做什麼（2026-10-07 寵物新一輪 #6）：每個時段一句，小工具照當下的時間挑（App 沒開時也會跟著時間換）；今天走過了白天那句換成走完的感覺
      petStatus: { night: T("呼呼大睡中"), dawn: T("剛起床，伸個懶腰"), day: hikedToday() ? T("腳還熱熱的，好開心") : T("在等你出門"), dusk: T("看著夕陽發呆"), eve: T("在窩裡等你回家") },
      locked: !(isPro()),   // 主畫面小工具是 PRO 福利；鎖定畫面的記錄卡片（Live Activity）免費
      sleep: typeof PetStage !== "undefined" && PetStage.sleepWin ? PetStage.sleepWin() : [22, 6], sleepOff: typeof PetStage !== "undefined" && PetStage.sleepWin ? !PetStage.sleepWin() : false,
      fest: festDays(),
      labels: { streak: T("連續"), days: T("天"), week: T("本週"), challenge: T("本月挑戰"), done: T("今天走過了"), nudge: T("今天出門走走吧"), locked: T("PRO 會員專屬小工具"), unlock: T("打開 App 升級") },
    };
    const sig = JSON.stringify(data);
    const petSig = ps ? [ps.level, typeof petStageIndex === "function" ? petStageIndex(totalKm()) : 0, typeof petHat === "function" ? petHat() : "", typeof petAcc === "function" ? petAcc() : "", typeof petTone === "function" ? petTone() : ""].join("|") : "";   // 換帽子、配件、配色也要重畫
    if (!force && sig === lastWidgetSig && petSig === lastPetSig) return false;
    const args = { data: sig };
    if (petSig !== lastPetSig) { const [png, zz] = await Promise.all([petPng(), petPng("sleep")]); if (png) args.pet = png; if (zz) args.petSleep = zz; }
    try { await plugin().setWidget(args); lastWidgetSig = sig; lastPetSig = petSig; return true; } catch (e) { return false; }
  }

  function init() {
    if (!plugin()) return;   // 不是 iOS App：整個不啟動
    setInterval(tick, 5000);
    setTimeout(() => pushWidget(true), 3000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") pushWidget(false); });   // 回主畫面時小工具剛好是最新的
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  return { tick, pushWidget, check, battery, _liveState: liveState, _reset: () => { P = null; avail = null; active = false; lastSig = ""; lastWidgetSig = ""; lastPetSig = ""; } };
})();
if (typeof window !== "undefined") window.NativeLive = NativeLive;
