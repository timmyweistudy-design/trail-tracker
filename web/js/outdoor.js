// 戶外安全：原路返回、天黑倒數、求救卡。
// 台灣山域事故以「迷路」最多（約 37%），這三個功能都是為了「走錯了、天快黑了、需要求救」那一刻。
// 全部離線可用：日落用經緯度算（app.js sunsetAt），座標換算（toTWD97）也在本機。
// 由 record.js 的 Recorder.onUpdate 每次更新時呼叫 Outdoor.onUpdate(s, last)。
const Outdoor = (() => {
  const T = s => (typeof ttT === "function" ? ttT(s) : s);
  const $ = s => document.querySelector(s);

  // ───────── 原路返回 ─────────
  // 把這趟走過的軌跡當成路線，反過來帶你走回起點：偏離警告改拿它比對，畫面上顯示離起點還有多遠。
  let back = null;   // { line: [[lat,lon]...]（起點→目前，原順序）, layer, startedAt }
  function backSegs() { return back ? [back.line] : null; }
  function canBacktrack(s) { return s && (s.state === "running" || s.state === "paused") && s.track && s.track.length >= 2 && s.distanceKm >= 0.03; }
  function startBack() {
    const s = Recorder.snapshot();
    if (!canBacktrack(s)) { toast(T("還沒走多遠，記錄 30 公尺以上才能原路返回")); return; }
    const line = s.track.filter(p => p && p.lat != null).map(p => [p.lat, p.lon]);
    if (back && back.layer && recMap) recMap.removeLayer(back.layer);
    // 反過來畫一條紫色虛線：跟官方路線（綠）、匯入路線（橘）分得出來
    const layer = recMap ? L.polyline(line, { color: "#7a4fd1", weight: 5, dashArray: "2 9", lineCap: "round", opacity: .95 }).addTo(recMap) : null;
    back = { line, layer, startedAt: Date.now(), lastCalc: 0, remain: null };
    if (typeof hideOffRoute === "function") hideOffRoute();
    ttBuzz([60, 40, 60]);
    toast(T("開始原路返回：照著紫色虛線走回起點"));
    paintBack(s); syncButtons(s);
  }
  function endBack(msg) {
    if (!back) return;
    if (back.layer && recMap) { try { recMap.removeLayer(back.layer); } catch (e) { /* */ } }
    back = null;
    const hud = $("#backHud"); if (hud) { hud.hidden = true; hud.innerHTML = ""; }
    if (typeof hideOffRoute === "function") hideOffRoute();
    if (msg) toast(T(msg));
    syncButtons(Recorder.snapshot());
  }
  // 離起點還有多遠：把目前位置投影到原軌跡上，取「起點到投影點」的沿線距離（3 秒算一次就好）
  function paintBack(s) {
    const hud = $("#backHud"); if (!hud || !back) return;
    const last = s.track && s.track.length ? s.track[s.track.length - 1] : null;
    if (last && Date.now() - back.lastCalc > 3000) {
      back.lastCalc = Date.now();
      back.remain = typeof _distAlong === "function" ? _distAlong([last.lat, last.lon], back.line) : null;
    }
    const rm = back.remain;
    if (rm != null && rm < 40 && Date.now() - back.startedAt > 60000) { endBack("回到起點了，辛苦了"); ttBuzz([120, 60, 120, 60, 240], 2); return; }
    // 預計回到起點：用這趟到目前的平均移動速度
    const hrs = (s.elapsedMs || 0) / 3.6e6, v = hrs > 0.05 ? s.distanceKm / hrs : 3;
    const eta = rm != null ? new Date(Date.now() + (rm / 1000) / Math.max(1.2, v) * 3.6e6) : null;
    const ss = sunsetFor(s), late = eta && ss && eta > ss;
    hud.hidden = false;
    hud.innerHTML = `<span class="bh-ic">${ic("route")}</span><span class="bh-t"><b>${T("原路返回中")}</b>`
      + `<span>${rm != null ? `${T("離起點")} <b>${(rm / 1000).toFixed(rm < 1000 ? 2 : 1)}</b> km` : T("計算中…")}${eta ? ` · ${T("預計回到起點")} <b>${hhmm(eta)}</b>` : ""}</span>`
      + `${late ? `<em class="bh-late">${T("會在天黑後才到，頭燈先拿出來")}</em>` : ""}</span>`
      + `<button class="bh-x" id="backEnd">${T("結束")}</button>`;
    const x = hud.querySelector("#backEnd"); if (x) x.onclick = () => endBack("已結束原路返回");
  }

  // ───────── 天黑倒數 ─────────
  // 假設原路折返、回程花的時間跟去程一樣：最晚折返時間 T 滿足「T＋(T−出發)＝日落−20 分鐘」
  // → T＝(日落−20分＋出發)／2。出發時間用「現在−已記錄時間」，暫停不算。
  const BUFFER = 20 * 60000;
  let sunWarn = { soon: false, now: false, dark: false, day: "" };
  function sunsetFor(s) {
    if (window.__ttSunsetAt) return new Date(window.__ttSunsetAt);   // 測試面板：模擬日落時間
    const p = (s && s.track && s.track.length) ? s.track[s.track.length - 1] : (typeof myLoc !== "undefined" && myLoc) ? myLoc : null;
    if (!p) return null;
    return sunsetAt(p.lat, p.lon != null ? p.lon : p.lng, new Date());
  }
  function paintSun(s) {
    const hud = $("#sunHud"); if (!hud) return;
    if (!s || s.state === "idle" || s.sim === true) { hud.hidden = true; return; }
    const ss = sunsetFor(s); if (!ss) { hud.hidden = true; return; }
    const now = Date.now(), day = new Date().toDateString();
    if (sunWarn.day !== day) sunWarn = { soon: false, now: false, dark: false, day };
    const startEff = now - (s.elapsedMs || 0);
    const turn = new Date((ss.getTime() - BUFFER + startEff) / 2);
    let cls = "", line;
    if (now >= ss.getTime()) {
      cls = "dark";
      line = `<b>${T("天已經黑了")}</b><span>${T("慢慢走，注意腳下")}</span>`;
      if (!sunWarn.dark) { sunWarn.dark = true; toast(T("天黑了，頭燈拿出來，慢慢走")); ttBuzz([200, 100, 200], 2); }
    } else if (back) {
      line = `${T("日落")} <b>${hhmm(ss)}</b>`;
    } else if (now >= turn.getTime()) {
      cls = "warn";
      line = `<span>${T("日落")} <b>${hhmm(ss)}</b></span><b>${T("該往回走了")}</b>`;
      if (!sunWarn.now) { sunWarn.now = true; toast(T("現在往回走，天黑前回得到起點")); ttBuzz([200, 100, 200, 100, 200], 2); }
    } else {
      if (turn.getTime() - now < 15 * 60000) {
        cls = "warn";
        if (!sunWarn.soon) { sunWarn.soon = true; toast(`${T("再")} ${Math.max(1, Math.round((turn.getTime() - now) / 60000))} ${T("分鐘就該往回走了")}`); ttBuzz([150, 80, 150], 2); }
      }
      line = `<span>${T("日落")} <b>${hhmm(ss)}</b></span><span>${T("最晚往回走")} <b>${hhmm(turn)}</b></span>`;
    }
    const redBtn = cls === "dark" && themeMode() !== "dark" ? `<button class="sh-red" data-set-theme="dark">${T("切到深色")}</button>` : "";
    const html = `<span class="sh-ic">${ic(cls === "dark" ? "moon" : "sunset")}</span><span class="sh-t">${line}</span>${redBtn}`;
    hud.hidden = false;
    hud.className = "sun-hud" + (cls ? " " + cls : "");
    if (hud._h !== html) { hud._h = html; hud.innerHTML = html; }
    hud.title = T("依你走來的時間推算：原路折返、回程跟去程一樣久，再留 20 分鐘餘裕");
  }

  function syncButtons(s) {
    const b = $("#btnBacktrack"); if (!b) return;
    const show = !!s && (s.state === "running" || s.state === "paused");
    b.hidden = !show;
    b.classList.toggle("on", !!back);
    const lb = b.querySelector("span"); if (lb) lb.textContent = T(back ? "結束原路返回" : "原路返回");
  }

  function onUpdate(s) {
    if (!s) return;
    if (s.state === "idle") { if (back) endBack(); sunWarn = { soon: false, now: false, dark: false, day: "" }; }
    syncButtons(s);
    if (back && s.state !== "idle") paintBack(s);
    paintSun(s);
  }

  // ───────── 求救卡 ─────────
  // 一頁看完：座標（十進位、度分秒、TWD97）、海拔、精度、在哪條步道附近、離起點多遠；
  // 一鍵撥 112、把位置用簡訊傳給家人。打電話時照著念就好。
  let sosPos = null;
  function bestFix() {
    const s = Recorder.snapshot && Recorder.snapshot();
    const last = s && s.track && s.track.length ? s.track[s.track.length - 1] : null;
    // 軌跡點只存經緯度和時間；海拔取即時海拔曲線的最後一點，精度取記錄器目前的 GPS 精度
    const as = s && s.altSeries && s.altSeries.length ? s.altSeries[s.altSeries.length - 1].e : null;
    if (last && last.t && Date.now() - last.t < 60000) return { lat: last.lat, lon: last.lon, alt: as, acc: s.acc, at: last.t, src: "rec" };
    return null;
  }
  function sosText(p) {
    const t = toTWD97(p.lat, p.lon);
    return `${T("我需要協助")}\n${T("座標")}: ${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}\nTWD97: ${t.x}, ${t.y}`
      + (p.alt != null ? `\n${T("海拔")}: ${Math.round(p.alt)} m` : "")
      + (where() ? `\n${where()}` : "")
      + `\nhttps://maps.google.com/?q=${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
  }
  function where() {
    const nm = (typeof Recorder !== "undefined" && Recorder._trailName) || null;
    return nm ? `${T("步道")}: ${T(nm)}` : "";
  }
  function paintSos(ov) {
    const body = ov.querySelector(".sos-body"); if (!body) return;
    const p = sosPos;
    if (!p) { body.innerHTML = `<div class="sos-wait"><span class="spin"></span> ${T("定位中…")}</div>`; return; }
    const tw = toTWD97(p.lat, p.lon), age = Math.max(0, Math.round((Date.now() - p.at) / 1000));
    const s = Recorder.snapshot && Recorder.snapshot();
    const fromStart = s && s.state !== "idle" && s.track && s.track.length > 1 && typeof _distAlong === "function"
      ? _distAlong([p.lat, p.lon], s.track.map(q => [q.lat, q.lon])) : null;
    const wps = (typeof selectedTrailWps !== "undefined" && selectedTrailWps.length) ? selectedTrailWps : [];
    let near = null; for (const w of wps) { const d = haversine({ lat: p.lat, lon: p.lon }, { lat: w.lat, lon: w.lon }); if (!near || d < near.d) near = { w, d }; }
    body.innerHTML = `
      <div class="sos-coord">
        <div class="sos-k">${T("座標（經緯度）")}</div>
        <div class="sos-big">${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}</div>
        <div class="sos-sub sos-pair"><span>${toDMS(p.lat, "N", "S")}</span><span>${toDMS(p.lon, "E", "W")}</span></div>
        <div class="sos-k">TWD97 ${T("二度分帶")}</div>
        <div class="sos-mid sos-pair"><span>X ${tw.x}</span><span>Y ${tw.y}</span></div>
      </div>
      <div class="sos-grid">
        <div><span>${T("海拔")}</span><b>${p.alt != null ? Math.round(p.alt) + " m" : "—"}</b></div>
        <div><span>${T("精度")}</span><b>${p.acc != null ? "±" + Math.round(p.acc) + " m" : "—"}</b></div>
        <div><span>${T("定位時間")}</span><b>${age < 60 ? `${age} ${T("秒前")}` : hhmm(new Date(p.at))}</b></div>
      </div>
      ${where() || near || fromStart != null ? `<div class="sos-where">
        ${where() ? `<div>${ic("mountain")} <span>${escHtml(where())}</span></div>` : ""}
        ${near ? `<div>${ic("pin")} <span>${T("最近的地標")}</span> <b>${escHtml(near.w.name || "")}</b> <span>${Math.round(near.d)} m</span></div>` : ""}
        ${fromStart != null ? `<div>${ic("route")} <span>${T("沿你走來的路，離起點")}</span> <b>${(fromStart / 1000).toFixed(1)} km</b></div>` : ""}
      </div>` : ""}
      <a class="btn sos-call" href="tel:112">${ic("phone")} ${T("撥打 112")}</a>
      <div class="sos-acts">
        <a class="sos-mini" id="sosSms" href="sms:?&body=${encodeURIComponent(sosText(p))}">${ic("chat")}<span>${T("簡訊傳給家人")}</span></a>
        <button class="sos-mini" id="sosShare">${ic("share")}<span>${T("分享位置")}</span></button>
        <button class="sos-mini" id="sosRefresh">${ic("refresh")}<span>${T("重新定位")}</span></button>
      </div>
      <div class="sos-tip">${T("只要有任何一家電信的訊號就能撥 112。打通後先說「我在山上需要救援」，再照著念上面的座標。")}</div>`;
    body.querySelector("#sosShare").onclick = () => ttShareText(sosText(p), T("我需要協助"));
    body.querySelector("#sosRefresh").onclick = () => locate(ov, true);
  }
  function locate(ov, force) {
    const rec = !force && bestFix();
    if (rec) { sosPos = rec; paintSos(ov); return; }
    if (!navigator.geolocation) { if (!sosPos) ov.querySelector(".sos-body").innerHTML = `<div class="sos-wait">${T("此裝置不支援定位")}</div>`; return; }
    if (force) { const b = ov.querySelector("#sosRefresh"); if (b) { b.disabled = true; b.innerHTML = `<span class="spin"></span>`; } }
    navigator.geolocation.getCurrentPosition(pos => {
      if (!document.body.contains(ov)) return;
      const c = pos.coords;
      sosPos = { lat: c.latitude, lon: c.longitude, alt: c.altitude, acc: c.accuracy, at: pos.timestamp || Date.now() };
      paintSos(ov);
    }, () => {
      if (!document.body.contains(ov)) return;
      if (sosPos) { paintSos(ov); toast(T("這次沒抓到新位置，顯示的是上一次的")); }
      else ov.querySelector(".sos-body").innerHTML = `<div class="sos-wait">${T("抓不到定位：到開闊一點的地方，或確認定位權限有打開")}</div><button class="btn ghost" id="sosRetry">${T("再試一次")}</button>`;
      const r = ov.querySelector("#sosRetry"); if (r) r.onclick = () => locate(ov, true);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  function openSos() {
    if (document.querySelector('[data-ov="sos"]')) return;
    const ov = document.createElement("div"); ov.className = "pet-modal sos-modal"; ov.dataset.ov = "sos";
    ov.innerHTML = `<div class="pet-modal-card sos-card"><button class="sheet-close" id="sosClose" aria-label="${T("關閉")}">${ic("x")}</button>
      <h2>${ic("alert")} ${T("求救卡")}</h2><div class="sos-body"></div></div>`;
    document.body.appendChild(ov);
    let _a11y = null;
    const close = () => { if (_a11y) _a11y(); ov.remove(); };
    if (typeof ttModalA11y === "function") _a11y = ttModalA11y(ov, close, { focus: "#sosClose" });
    ov.querySelector("#sosClose").onclick = close;
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    sosPos = bestFix() || sosPos;
    paintSos(ov);
    locate(ov, !bestFix());
  }

  function init() {
    const bt = $("#btnBacktrack"); if (bt) bt.addEventListener("click", () => back ? endBack("已結束原路返回") : startBack());
    const sb = $("#btnSos"); if (sb) sb.addEventListener("click", openSos);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

  return { onUpdate, backSegs, isBacktracking: () => !!back, startBack, endBack, openSos, _turnAt: (ssMs, startMs) => new Date((ssMs - BUFFER + startMs) / 2) };
})();
if (typeof window !== "undefined") window.Outdoor = Outdoor;
