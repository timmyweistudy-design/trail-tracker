// 行程結算頁：軌跡重播、坡度著色、破紀錄、速度比較、分享圖卡、改名/刪除（從 record.js 拆出，2026-10-01）。
// 在 record.js 之後載入；用到 record.js 的 hikePhotos、hikePhotosRecId、_shotUrls 等全域。
// 行程軌跡回顧 / 結束總結
let trackMap = null, trackLayer = null, trackAnim = null, trackReplayLayer = null, trackPts = null, trackSegsLL = null, trackStats = null;
const _hav = (a, b) => haversine({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] });
// 結算頁滑行重播：marker 沿軌跡滑行、路線同步畫出（約8秒）
// ── 軌跡坡度著色 ──
// 用 DEM 地形（與爬升校正同一份資料）算每段坡度，依級距上色：緩坡→綠，陡坡→磚紅。
// 色階刻意跟品牌同調（森綠→琥珀→磚紅），並與難度分級的語彙一致：越紅越硬。
const SLOPE_STEPS = [
  { max: 5, color: "#3f7d52", label: "0–5%" },      // 平緩
  { max: 12, color: "#8aa63c", label: "5–12%" },    // 微上坡
  { max: 20, color: "#e0a92a", label: "12–20%" },   // 有感
  { max: 30, color: "#e07b39", label: "20–30%" },   // 陡
  { max: Infinity, color: "#c0472b", label: "30%+" },   // 很陡
];
const slopeColor = g => (SLOPE_STEPS.find(s => Math.abs(g) < s.max) || SLOPE_STEPS[4]).color;

// 取每段軌跡的地形剖面（DEM），並壓掉量化毛刺——顏色才不會一格一格亂跳
async function slopeProfiles(segs) {
  const out = [];
  for (const seg of segs) {
    if (!seg || seg.length < 3) continue;
    const raw = await Elevation.profile(seg.map(p => ({ lat: p[0], lon: p[1] })));
    if (!raw) continue;
    const med3 = (x, y, z) => Math.max(Math.min(x, y), Math.min(Math.max(x, y), z));
    let elev = raw.map((e, i) => (i > 0 && i < raw.length - 1) ? med3(raw[i - 1], e, raw[i + 1]) : e);
    elev = elev.map((e, i) => (i > 0 && i < elev.length - 1) ? (elev[i - 1] + e + elev[i + 1]) / 3 : e);
    out.push({ seg, elev });
  }
  return out;
}
// 把剖面畫成坡度色帶。色帶長度依縮放調整：縮小看趨勢（長色帶）、放大看細節（短色帶）——
// 固定長度的話，之字坡在縮小時每個色帶只剩幾像素，整條路線會讀成一串碎珠。
function renderSlope(map, layer, profiles) {
  layer.clearLayers();
  const lat = map.getCenter().lat;
  const mpp = 40075016.686 * Math.cos(lat * Math.PI / 180) / Math.pow(2, map.getZoom() + 8);   // 每像素幾公尺
  const minRun = Math.max(60, mpp * 22);   // 每個色帶至少約 22 px 才看得出是色帶
  for (const { seg, elev } of profiles) {
    const chunks = [];
    let a = 0, accum = 0;
    for (let i = 1; i < seg.length; i++) {
      accum += _hav(seg[i - 1], seg[i]);
      if (accum < minRun && i < seg.length - 1) continue;
      const grade = accum >= 1 ? ((elev[i] - elev[a]) / accum) * 100 : 0;
      chunks.push({ a, b: i, color: slopeColor(grade) });
      a = i; accum = 0;
    }
    // 白色外框線（製圖慣例的 casing）：彩色段疊在上面，整體讀起來是一條連續路線
    L.polyline(seg, { color: "#fffdf8", weight: 8, opacity: .8, lineCap: "round", lineJoin: "round" }).addTo(layer);
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      while (i + 1 < chunks.length && chunks[i + 1].color === c.color) { c.b = chunks[++i].b; }
      // 端點用平角：圓端點在縮小檢視時會鼓成一顆顆
      L.polyline(seg.slice(c.a, c.b + 1), { color: c.color, weight: 6, opacity: 1, lineCap: "butt", lineJoin: "round" }).addTo(layer);
    }
  }
}
// 公里標記樁：沿軌跡每整公里插一個小圓標。縮太小就不畫（會擠成一團看不清）。
function renderKmMarks(map, layer, segs) {
  if (map.getZoom() < 13) return;
  let acc = 0, next = 1000;
  for (const seg of segs) {
    for (let i = 1; i < seg.length; i++) {
      const d = _hav(seg[i - 1], seg[i]);
      while (acc + d >= next) {                       // 這一小段內跨過整公里 → 內插出位置
        const r = (next - acc) / (d || 1);
        const ll = [seg[i - 1][0] + (seg[i][0] - seg[i - 1][0]) * r, seg[i - 1][1] + (seg[i][1] - seg[i - 1][1]) * r];
        L.marker(ll, { icon: L.divIcon({ className: "km-mark", html: `<b>${next / 1000}</b>`, iconSize: [20, 20], iconAnchor: [10, 10] }), interactive: false }).addTo(layer);
        next += 1000;
      }
      acc += d;
    }
  }
}
// 地圖左下角的坡度圖例（只在真的畫出著色軌跡時顯示）
function addSlopeLegend(map) {
  if (map._slopeLegend) return;
  const c = L.control({ position: "bottomleft" });
  c.onAdd = () => {
    const d = L.DomUtil.create("div", "slope-legend");
    d.innerHTML = `<b>${ttT("坡度")}</b>` + SLOPE_STEPS.map(s => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join("");
    L.DomEvent.disableClickPropagation(d);
    return d;
  };
  c.addTo(map);
  map._slopeLegend = c;
}

function playTrackReplay(pts, segLL) {
  // 換一筆行程/重播 → 先清掉上一次的坡度圖層與縮放監聽，否則舊行程的彩色軌跡會留在地圖上
  if (slopeLayer && trackMap) { trackMap.removeLayer(slopeLayer); slopeLayer = null; }
  if (slopeZoomHandler && trackMap) { trackMap.off("zoomend", slopeZoomHandler); slopeZoomHandler = null; }
  if (trackAnim) { clearInterval(trackAnim); trackAnim = null; }
  if (!trackMap || !pts || pts.length < 2) return;
  if (trackReplayLayer) trackMap.removeLayer(trackReplayLayer);
  trackReplayLayer = L.layerGroup().addTo(trackMap);
  const finalLL = (segLL && segLL.length) ? segLL : pts;   // 完整顯示時依 gap 分段，暫停跳段不連直線
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + _hav(pts[i - 1], pts[i]));
  const total = cum[cum.length - 1] || 1;
  const grow = L.polyline([pts[0]], { color: "#2f7d4f", weight: 5 }).addTo(trackReplayLayer);
  const dot = L.circleMarker(pts[0], { radius: 7, color: "#fff", weight: 3, fillColor: "#e8893b", fillOpacity: 1 }).addTo(trackReplayLayer);
  const fullBounds = L.polyline(pts).getBounds();
  // 系統設定「減少動態」→ 直接顯示完整路線，不播放動畫
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    grow.setLatLngs(finalLL);
    L.circleMarker(pts[pts.length - 1], { radius: 6, color: "#fff", weight: 2, fillColor: "#d2542e", fillOpacity: 1 }).addTo(trackReplayLayer);
    trackMap.fitBounds(fullBounds, { padding: [24, 24] });
    paintSlope(finalLL, grow);
    return;
  }
  trackMap.setView(pts[0], 16);                  // 鏡頭拉近到起點，跟著走
  // 即時數字跑動的小牌子（疊在地圖左上）
  let live = document.getElementById("replayLive");
  if (!live) { live = document.createElement("div"); live.id = "replayLive"; live.className = "replay-live"; }
  trackMap.getContainer().appendChild(live);
  live.style.display = "";
  // 底部進度條
  let bar = document.getElementById("replayBar");
  if (!bar) { bar = document.createElement("div"); bar.id = "replayBar"; bar.className = "replay-bar"; bar.innerHTML = "<i></i>"; }
  trackMap.getContainer().appendChild(bar);
  const barFill = bar.firstChild;
  const totMs = (trackStats && trackStats.ms) || 0;
  const DURATION = 8000, interval = 25, frames = Math.round(DURATION / interval);
  let f = 0, idx = 0;
  trackAnim = setInterval(() => {
    f++;
    const d = Math.min(total, total * f / frames);
    while (idx < pts.length - 2 && cum[idx + 1] <= d) idx++;     // 推進到含距離 d 的線段
    const segLen = cum[idx + 1] - cum[idx];
    const r = segLen > 0 ? (d - cum[idx]) / segLen : 0;
    const cur = [pts[idx][0] + (pts[idx + 1][0] - pts[idx][0]) * r,
                 pts[idx][1] + (pts[idx + 1][1] - pts[idx][1]) * r];
    grow.setLatLngs(pts.slice(0, idx + 1).concat([cur]));
    dot.setLatLng(cur);
    trackMap.panTo(cur, { animate: false });      // 鏡頭跟著腳步滑行＝重走這條路
    const frac = f / frames;
    // 里程依重播比例換算「統計里程」：直接用簡化後的軌跡幾何算會比下方統計少一截，看起來像數字打架
    const kmNow = trackStats && trackStats.km ? trackStats.km * (d / total) : d / 1000;
    live.innerHTML = `<span class="rl-tag">${ttT("重播")}</span><b>${kmNow.toFixed(2)}</b> km　·　${fmtTime(totMs * frac)}`;
    barFill.style.width = (frac * 100) + "%";
    if (f >= frames || d >= total) {
      clearInterval(trackAnim); trackAnim = null;
      grow.setLatLngs(finalLL);
      L.circleMarker(pts[pts.length - 1], { radius: 6, color: "#fff", weight: 2, fillColor: "#d2542e", fillOpacity: 1 }).addTo(trackReplayLayer);
      live.innerHTML = `<span class="rl-tag">${ttT("全程")}</span><b>${(trackStats ? trackStats.km : d / 1000).toFixed(2)}</b> km　·　${fmtTime(totMs)}`;
      trackMap.flyToBounds(fullBounds, { padding: [24, 24], duration: 0.8 });   // 走完拉遠看全程
      paintSlope(finalLL, grow);   // 走完才上色：重播中維持單色綠線，看得清楚走到哪
    }
  }, interval);
}
// 重播結束 → 把單色綠線換成依坡度上色的軌跡（DEM 拿不到就維持綠線，不影響任何既有行為）
let slopeLayer = null, slopeZoomHandler = null;
async function paintSlope(segs, plainLine) {
  if (!_pro()) return;   // PRO：坡度著色＋公里樁；非會員維持單色綠線
  if (typeof Elevation === "undefined" || !Elevation.profile || !trackMap || !Array.isArray(segs) || !segs.length) return;
  const owner = trackReplayLayer;
  const profiles = await slopeProfiles(Array.isArray(segs[0][0]) ? segs : [segs]);
  if (!profiles.length || owner !== trackReplayLayer) return;   // 拿不到地形，或期間使用者切了別的行程 → 放棄
  if (plainLine) plainLine.remove();
  if (slopeLayer) trackMap.removeLayer(slopeLayer);
  slopeLayer = L.layerGroup().addTo(trackMap);
  const draw = () => {
    renderSlope(trackMap, slopeLayer, profiles);
    renderKmMarks(trackMap, slopeLayer, profiles.map(p => p.seg));   // 公里樁疊在色帶上
  };
  draw();
  if (slopeZoomHandler) trackMap.off("zoomend", slopeZoomHandler);
  slopeZoomHandler = draw;
  trackMap.on("zoomend", slopeZoomHandler);   // 縮放後重畫：色帶長度跟著縮放走
  addSlopeLegend(trackMap);
}
// 存照片到相簿：優先系統分享單（iOS/Android 可「儲存影像」），否則下載
async function saveImageFile(file) { return saveBlob(file, file.name || ("循徑拾光_" + Date.now() + ".jpg"), ""); }   // 共用存圖（App 內走長按預覽）
// #1 個人紀錄突破：把這趟和過往的健行紀錄（排除自己）比，回傳打破的項目
function personalBestBreaks(rec) {
  const km = rec.distanceKm || 0;
  const out = [];
  if (km < 0.3) return out;                         // 太短不列入
  const others = Store.getRecords().filter(r => isFootRec(r) && r.id !== rec.id);
  if (!others.length) { out.push({ e: "🌱", label: "首次健行紀錄！" }); return out; }
  const maxKm = Math.max(...others.map(r => r.distanceKm || 0));
  const maxAsc = Math.max(...others.map(r => r.ascent || 0));
  const maxMs = Math.max(...others.map(r => r.elapsedMs || 0));
  if (km > maxKm) out.push({ e: "📏", label: "最長距離" });
  if ((rec.ascent || 0) > maxAsc && (rec.ascent || 0) > 0) out.push({ e: "⛰️", label: "最多爬升" });
  if ((rec.elapsedMs || 0) > maxMs) out.push({ e: "⏱️", label: "最久時間" });
  if (km >= 1 && rec.elapsedMs > 0) {               // 配速越小越快，需 ≥1km 才有意義
    const pace = (rec.elapsedMs / 1000) / km;
    const op = others.filter(r => (r.distanceKm || 0) >= 1 && r.elapsedMs > 0).map(r => (r.elapsedMs / 1000) / r.distanceKm);
    if (op.length && pace < Math.min(...op)) out.push({ e: "⚡", label: "最快配速" });
  }
  return out;
}
// #2 速度：直觀呈現「這次 vs 你平常」，一句話講清楚快多少慢多少
// PRO 判定（多處共用）：未載入 Premium 模組時當作非會員，避免免費版意外看到 PRO 內容
function _pro() { return typeof Premium !== "undefined" && Premium.isOn(); }
// PRO 閘門：非會員→開升級面板並回 false。Premium 模組沒載入時同樣擋住（fail-closed），
// 不可以寫成 `typeof Premium !== "undefined" && !Premium.gate()`——那在模組載入失敗時會短路成放行。
function _proGate() {
  if (typeof Premium === "undefined") return false;
  return Premium.gate();
}
function speedHtml(rec) {
  if (rec.sim) return "";   // 模擬時間是壓縮的，速度無意義 → 不顯示
  if (!_pro()) return "";   // 分段速度／速度趨勢：PRO
  const km = rec.distanceKm || 0;
  if (!(rec.elapsedMs > 0) || km < 0.1) return "";
  const cur = km / (rec.elapsedMs / 3.6e6);
  const past = Store.getRecords().filter(r => isFootRec(r) && r.id !== rec.id && r.elapsedMs > 0 && (r.distanceKm || 0) > 0);
  const usual = past.length ? past.reduce((s, r) => s + r.distanceKm, 0) / (past.reduce((s, r) => s + r.elapsedMs, 0) / 3.6e6) : 0;
  const max = Math.max(cur, usual, 0.1);
  const bar = (v, cls) => `<div class="spd-row ${cls}"><span class="spd-lbl">${cls === "cur" ? ttT("這次") : ttT("平常")}</span><div class="spd-bar"><i style="width:${Math.round(v / max * 100)}%"></i></div><b>${v.toFixed(1)}</b></div>`;
  let line = "";
  if (usual > 0) {
    const d = (cur - usual) / usual * 100;
    line = Math.abs(d) < 5 ? ttT("和你平常差不多") : (d > 0 ? `${ttT("比平常快")} ${Math.round(d)}%` : `${ttT("比平常慢")} ${Math.round(-d)}%`);
  }
  return `<div class="section-title">${ic("clock")}${ttT("速度")}<span class="split-unit">km/h</span></div>
    <div class="spd-cmp">${bar(cur, "cur")}${usual > 0 ? bar(usual, "usual") : ""}</div>
    ${line ? `<div class="spd-line">${line}</div>` : ""}`;
}
// #18 Premium 高峰時刻轉換：只在「真的破紀錄」且非會員時，7 天最多推一次（節制、不洗版）
function _maybePremiumUpsell(bk) {
  try {
    if (!bk || !bk.length) return "";
    if (typeof Premium === "undefined" || Premium.isOn()) return "";
    const last = +(localStorage.getItem("tt_upsell_last") || 0);
    if (Date.now() - last < 7 * 864e5) return "";
    localStorage.setItem("tt_upsell_last", String(Date.now()));
    return `<div class="track-upsell" id="trackUpsell">
      <button class="tu-x" id="tuDismiss" aria-label="${ttT("關閉")}">${ic("x")}</button>
      <div class="tu-h">${ic("sparkle")} ${ttT("這一刻，值得更多")}</div>
      <div class="tu-b">${ttT("升級 PRO：進階分析・無限離線地圖・專屬主題・3D 地形")}</div>
      <button class="btn primary tu-go" id="tuUpgrade">${ttT("升級 PRO")}</button>
    </div>`;
  } catch (e) { return ""; }
}
function openTrackReview(rec, isNew) {
  if (!rec) return;
  _shotUrls.forEach(u => URL.revokeObjectURL(u)); _shotUrls = [];   // 回收上一份結算的照片 URL
  const km = rec.distanceKm || 0, t3 = rec.distance3DKm;
  const bk = (isNew && isFootRec(rec)) ? personalBestBreaks(rec) : [];   // 破紀錄清單（慶祝＋#18 升級卡共用）
  $("#trackBody").innerHTML = `
    <h2>${escHtml(rec.trailName || "自由路線")}</h2>
    <div class="track-date">${new Date(rec.date).toLocaleString(ttLocale(), { month: "numeric", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" })}</div>
    ${bk.length ? `<div class="pb-burst">${bk.map(b => `<span class="pb-badge">${b.e} <b>${b.label === "首次健行紀錄！" ? ttT(b.label) : `${ttT("破紀錄")}·${ttT(b.label)}`}</b></span>`).join("")}</div>` : ""}
    ${_maybePremiumUpsell(bk)}
    <div class="kv">
      <div class="item"><div class="l">${ttT("距離")}</div><div class="v">${km.toFixed(2)} km</div></div>
      <div class="item"><div class="l">${ttT("時間")}</div><div class="v">${fmtDur(rec.elapsedMs)}</div></div>
      <div class="item"><div class="l">${ttT("總爬升")}${rec.altCorrected ? ` <span class="ok-mark" title="${ttT("已用地形資料校正")}">${ic("check")}</span>` : ""}</div><div class="v">↑${rec.ascent || 0} m</div></div>
      <div class="item"><div class="l">${ttT("總下降")}</div><div class="v">↓${rec.descent || 0} m</div></div>
      ${rec.kcal ? `<div class="item"><div class="l">${ttT("消耗")}</div><div class="v">${Math.round(rec.kcal)} ${ttT("大卡")}</div></div>` : ""}
      ${rec.steps ? `<div class="item"><div class="l">${ttT("步數")}</div><div class="v">${rec.steps.toLocaleString()}</div></div>` : ""}
      ${!rec.sim && rec.elapsedMs > 0 && km > 0.05 ? `<div class="item"><div class="l">${ttT("平均速度")}</div><div class="v">${(km / (rec.elapsedMs / 3.6e6)).toFixed(1)} km/h</div></div>` : ""}
      ${!rec.sim && rec.elapsedMs > 6e5 && (rec.ascent || 0) >= 100 && _pro() ? `<div class="item"><div class="l">${ttT("爬升速率")}</div><div class="v">${Math.round(rec.ascent / (rec.elapsedMs / 3.6e6))} m/hr</div></div>` : ""}
      ${t3 && t3 > km + 0.05 ? `<div class="item"><div class="l">${ttT("含坡度距離")}</div><div class="v">${t3.toFixed(2)} km</div></div>` : ""}
    </div>
    ${speedHtml(rec)}
    ${(rec.id === hikePhotosRecId && hikePhotos.length) ? `<div class="section-title">${ic("camera")}${ttT("隨手拍")}（${hikePhotos.length}）<span class="shot-hint">${ttT("點照片存到相簿")}</span></div>
      <div class="hike-shots">${hikePhotos.map((p, i) => `<figure class="shot" data-i="${i}"><img loading="lazy" decoding="async" src="${(u => { _shotUrls.push(u); return u; })(URL.createObjectURL(p.file))}" alt=""><figcaption>${new Date(p.t).toLocaleTimeString(ttLocale(), { hour: "2-digit", minute: "2-digit" })}${p.km != null ? ` · ${(+p.km).toFixed(2)} km` : ""}</figcaption></figure>`).join("")}</div>` : ""}
    <div class="link-row flow">
      <button class="link-btn" id="trackReplay">${ic("play")} ${ttT("重播路徑")}</button>
      <button class="link-btn" id="track3d">${ic("mountain")} ${ttT("3D 回放")}${_pro() ? "" : `<span class="pro-tag">PRO</span>`}</button>
      <button class="link-btn" id="trackCard">${ic("camera")} ${ttT("分享圖卡")}</button>
      <button class="link-btn" id="trackGpx">${ic("download")} ${ttT("路線檔")}${_pro() ? "" : `<span class="pro-tag">PRO</span>`}</button>
      <button class="link-btn" id="trackShare">${ic("share")} ${ttT("分享行程")}</button>
      ${rec.sim || socialHidden() ? "" : `<button class="link-btn social-only" id="trackSocial">${ic("megaphone")} ${ttT("分享到社群")}</button>`}
    </div>
    ${isNew ? "" : `<div class="track-manage"><button class="tm-btn" id="trackRename">${ic("pencil")} ${ttT("改名稱")}</button><button class="tm-btn danger" id="trackDelete">${ic("trash")} ${ttT("刪除這一趟")}</button></div>`}`;
  $("#trackMask").classList.add("show");
  $("#trackSheet").classList.add("show");
  $("#trackSheet").scrollTop = 0;
  // 改名：打的名字剛好是某條步道 → 順便連回那條步道（完成判定、步道頁的「走過」才對得上）
  { const rn = $("#trackRename"); if (rn) rn.addEventListener("click", async () => {
      const v = await askInput({ title: ttT("這一趟叫什麼？"), value: rec.trailName || "", max: 40 });
      if (v == null || !v.trim()) return;
      const name = v.trim(), t = TRAILS.find(x => x.name === name);
      Store.updateRecord(rec.id, { trailName: name, trailId: t ? t.id : rec.trailId });
      rec.trailName = name; if (t) rec.trailId = t.id;
      const h = $("#trackBody h2"); if (h) h.textContent = name;
      renderHistory(true); toast(t ? ttT("改好了，也連到這條步道") : ttT("改好了"));
    }); }
  { const dl = $("#trackDelete"); if (dl) dl.addEventListener("click", async () => {
      const ok = await ttConfirm(`${ttT("刪除這一趟？")}\n${escHtml(rec.trailName || "自由路線")}・${(rec.distanceKm || 0).toFixed(2)} km\n${ttT("刪了就找不回來，統計也會一起扣掉。")}`, ttT("刪除"), ttT("取消"));
      if (!ok) return;
      Store.deleteRecord(rec.id);
      closeTrackReview();
      renderHistory(true); toast(ttT("刪掉了"));
      try { if (typeof scheduleCloudBackup === "function") scheduleCloudBackup(); } catch (e) { /* */ }
    }); }
  { const tu = $("#tuUpgrade"); if (tu) tu.addEventListener("click", () => { if (typeof Premium !== "undefined") Premium.openUpgrade(); }); const tx = $("#tuDismiss"); if (tx) tx.addEventListener("click", () => { const u = $("#trackUpsell"); if (u) u.remove(); }); }
  setTimeout(() => {
    if (!trackMap) {
      trackMap = L.map("trackMap", { zoomControl: false });
      baseTopo().addTo(trackMap); hillshadeLayer(trackMap).addTo(trackMap);
    }
    if (trackLayer) trackMap.removeLayer(trackLayer);
    trackLayer = L.layerGroup().addTo(trackMap);
    const pts = (rec.track || []).map(p => [p.lat, p.lon]);
    trackPts = pts;
    trackSegsLL = trackSegments(rec.track || []).map(s => s.map(p => [p.lat, p.lon]));   // gap 分段，顯示不連跳段
    trackStats = { km, ms: rec.elapsedMs };
    trackMap.invalidateSize();
    if (pts.length > 1) {
      trackMap.fitBounds(L.polyline(pts).getBounds(), { padding: [24, 24] });
      L.circleMarker(pts[0], { radius: 6, color: "#fff", weight: 2, fillColor: "#2f7d4f", fillOpacity: 1 }).addTo(trackLayer);   // 起點
      playTrackReplay(pts, trackSegsLL);          // 滑行重播
    } else if (pts.length === 1) {
      trackMap.setView(pts[0], 15);
      L.circleMarker(pts[0], { radius: 6, color: "#fff", weight: 2, fillColor: "#2f7d4f", fillOpacity: 1 }).addTo(trackLayer);
    } else { trackMap.setView([23.8, 121], 7); }
  }, 120);
  $("#trackReplay").addEventListener("click", () => { if (trackPts && trackPts.length > 1) playTrackReplay(trackPts, trackSegsLL); });
  $("#track3d").addEventListener("click", () => { if (trackSegsLL && trackSegsLL.length) open3DTrack(rec.trailName || ttT("自由路線"), trackSegsLL); else toast(ttT("此步道沒有路線資料，無法 3D 顯示")); });
  $("#trackCard").addEventListener("click", () => shareHikeCard(rec));
  $("#trackGpx").addEventListener("click", () => {
    if (!_proGate()) return;   // PRO：匯出路線檔
    GPX.exportRecord(rec); toast(ttT("路線檔存好了"));
  });
  $("#trackShare").addEventListener("click", () => {
    const text = `${ttT("我走了")} ${rec.trailName || ttT("自由路線")}：${km.toFixed(2)} km・↑${rec.ascent || 0} m${rec.kcal ? `・${Math.round(rec.kcal)} ${ttT("大卡")}` : ""}・${fmtTime(rec.elapsedMs)} — ${ttT("循徑拾光")}`;
    if (navigator.share) navigator.share({ title: ttT("我的健行紀錄"), text }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast(ttT("複製好了，貼給朋友吧")));
    else toast(text);
  });
  const socialBtn = $("#trackSocial");
  if (socialBtn) socialBtn.addEventListener("click", () => {
    const preset = (rec.id === hikePhotosRecId) ? hikePhotos.slice() : [];   // 帶 {file,t,km} 供標時間/里程
    if (typeof Composer !== "undefined") Composer.open(rec, preset);
  });
  // 點隨手拍照片 → 存到相簿（系統分享單的「儲存影像」）/ 下載
  $("#trackBody").querySelectorAll(".hike-shots .shot").forEach(fig => fig.addEventListener("click", () => {
    const p = hikePhotos[+fig.dataset.i]; if (p) saveImageFile(p.file);
  }));
}
function closeTrackReview() { if (trackAnim) { clearInterval(trackAnim); trackAnim = null; } const lv = document.getElementById("replayLive"); if (lv) lv.style.display = "none"; const bb = document.getElementById("replayBar"); if (bb) bb.remove(); _shotUrls.forEach(u => URL.revokeObjectURL(u)); _shotUrls = []; $("#trackMask").classList.remove("show"); $("#trackSheet").classList.remove("show"); }

// 分享圖卡配色版型（每按一次「分享圖卡」換下一個風格：森林／暮色／晨霧）
const CARD_THEMES = [
  { bg: ["#1f4730", "#16301f", "#102217"], brand: "rgba(220,232,210,.7)", ink: "#fbf8ee", sub: "rgba(231,237,222,.6)", route: "rgba(232,137,59,.95)", unit: "rgba(231,237,222,.7)", line: "rgba(220,232,210,.14)", statV: "#9fe0b0", statL: "rgba(231,237,222,.55)" },
  { bg: ["#43301f", "#2a1c14", "#17100b"], brand: "rgba(245,222,190,.7)", ink: "#fdf3e6", sub: "rgba(245,230,214,.6)", route: "rgba(255,179,71,.98)", unit: "rgba(245,230,214,.7)", line: "rgba(245,222,190,.16)", statV: "#ffce85", statL: "rgba(245,230,214,.55)" },
  { bg: ["#f6f2e8", "#ece5d4", "#e0d8c4"], brand: "rgba(60,80,58,.65)", ink: "#1c2a1e", sub: "rgba(60,72,58,.6)", route: "rgba(194,104,61,.98)", unit: "rgba(60,72,58,.75)", line: "rgba(40,50,35,.14)", statV: "#2c5d3f", statL: "rgba(60,72,58,.6)" },
];
// 畫一張分享圖卡（回傳 canvas）。T＝配色版型
async function drawHikeCard(rec, T) {
  try { await document.fonts.ready; } catch (e) { /* 確保自帶字型已載入，canvas 才畫得出 TaipeiSans */ }
  const S = 1080, c = document.createElement("canvas");
  c.width = S; c.height = S;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, T.bg[0]); g.addColorStop(.55, T.bg[1]); g.addColorStop(1, T.bg[2]);
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  x.fillStyle = T.brand; x.font = "600 30px 'TaipeiSans', sans-serif";
  x.fillText(ttT("循徑拾光 · GATHER THE TRAIL"), 70, 96);
  // 季節（右上，和品牌對稱）：以前畫 emoji，部分裝置會變方框 → 改成文字
  const mon = new Date(rec.date).getMonth() + 1;
  const season = ttT(mon >= 3 && mon <= 5 ? "春" : mon >= 6 && mon <= 8 ? "夏" : mon >= 9 && mon <= 11 ? "秋" : "冬");
  x.save(); x.textAlign = "right"; x.fillStyle = T.statV; x.font = "700 34px 'TaipeiSans', sans-serif"; x.fillText(season, S - 70, 96); x.restore();
  // 步道名：放不下就縮字、再不行加「…」（以前硬切 12 個字，沒有省略號）
  const name = rec.trailName || ttT("自由路線");
  let fs = 64; x.font = `700 ${fs}px 'TaipeiSans', sans-serif`;
  while (x.measureText(name).width > S - 140 && fs > 44) { fs -= 4; x.font = `700 ${fs}px 'TaipeiSans', sans-serif`; }
  let shown = name;
  while (x.measureText(shown).width > S - 140 && shown.length > 2) shown = shown.slice(0, -2) + "…";
  x.fillStyle = T.ink; x.fillText(shown, 70, 188);
  x.fillStyle = T.sub; x.font = "400 28px 'TaipeiSans', sans-serif";
  x.fillText(new Date(rec.date).toLocaleDateString(ttLocale()), 70, 234);
  // 路線縮圖
  const pts = (rec.track || []).map(p => [p.lat, p.lon]);
  if (pts.length > 1) {
    const las = pts.map(p => p[0]), los = pts.map(p => p[1]);
    const minLa = Math.min(...las), maxLa = Math.max(...las), minLo = Math.min(...los), maxLo = Math.max(...los);
    const bx = 70, by = 300, bw = S - 140, bh = 440, pad = 40;
    const spanLa = (maxLa - minLa) || 1e-6, spanLo = (maxLo - minLo) || 1e-6;
    const sc = Math.min((bw - 2 * pad) / spanLo, (bh - 2 * pad) / spanLa);
    const ox = bx + (bw - spanLo * sc) / 2, oy = by + (bh - spanLa * sc) / 2;
    x.strokeStyle = T.route; x.lineWidth = 7; x.lineJoin = "round"; x.lineCap = "round";
    x.beginPath();
    (rec.track || []).forEach((p, i) => {
      const px = ox + (p.lon - minLo) * sc, py = oy + (maxLa - p.lat) * sc;
      (i && !p.gap) ? x.lineTo(px, py) : x.moveTo(px, py);   // gap＝暫停跳段，不連線
    });
    x.stroke();
  }
  x.fillStyle = T.ink; x.font = "700 132px 'TaipeiSans', sans-serif";
  x.fillText((rec.distanceKm || 0).toFixed(2), 70, 846);
  x.fillStyle = T.unit; x.font = "500 40px 'TaipeiSans', sans-serif"; x.fillText(ttT("公里"), 72, 896);
  x.strokeStyle = T.line; x.lineWidth = 2;
  x.beginPath(); x.moveTo(70, 940); x.lineTo(S - 70, 940); x.stroke();
  const stats = [[ttT("時間"), fmtTime(rec.elapsedMs)], [ttT("爬升"), "↑" + (rec.ascent || 0) + " m"], [ttT("大卡"), String(rec.kcal || 0)], [ttT("步數"), (rec.steps || 0).toLocaleString()]];
  const cw = (S - 140) / stats.length;
  stats.forEach(([l, v], i) => {
    const cx = 70 + cw * i;
    x.fillStyle = T.statV; x.font = "600 46px 'TaipeiSans', sans-serif"; x.fillText(v, cx, 1000);
    x.fillStyle = T.statL; x.font = "400 26px 'TaipeiSans', sans-serif"; x.fillText(l, cx, 1038);
  });
  return c;
}
// 分享圖卡：先給 3 種配色的預覽，挑一張再分享（以前按一次換一個，事先看不到）
const CARD_NAMES = ["森林", "暮色", "晨霧"];
async function shareHikeCard(rec) {
  if (document.querySelector('[data-ov="cardpick"]')) return;
  const ov = document.createElement("div"); ov.className = "pv-mask"; ov.dataset.ov = "cardpick";
  ov.innerHTML = `<div class="pv card-pick"><div class="pv-head"><button class="comp-x" id="cpX" aria-label="${ttT("關閉")}">${ic("x")}</button><b>${ttT("挑一張圖卡")}</b><span></span></div>
    <div class="pv-body"><div class="cp-grid" id="cpGrid"><div class="feed-loading"><span class="spin"></span></div></div></div></div>`;
  document.body.appendChild(ov);
  const urls = [], close = () => { urls.forEach(u => URL.revokeObjectURL(u)); ov.remove(); };
  ov.querySelector("#cpX").addEventListener("click", close);
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  try {
    const blobs = [];
    for (const T of CARD_THEMES) { const cv = await drawHikeCard(rec, T); blobs.push(await new Promise(r => cv.toBlob(r, "image/png"))); }
    if (!document.body.contains(ov)) return;
    blobs.forEach(b => urls.push(URL.createObjectURL(b)));
    ov.querySelector("#cpGrid").innerHTML = blobs.map((b, i) => `<button class="cp-item" data-i="${i}"><img src="${urls[i]}" alt=""><span>${ttT(CARD_NAMES[i])}</span></button>`).join("");
    ov.querySelectorAll(".cp-item").forEach(btn => btn.addEventListener("click", async () => {
      const blob = blobs[+btn.dataset.i];
      const nm = (typeof I18n !== "undefined" && I18n.lang() !== "zh") ? "gather-the-trail-card.png" : "循徑拾光健行卡.png";
      const file = new File([blob], nm, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: ttT("我的健行紀錄") }); } catch (e) { /* 取消分享 */ }
      } else if (await saveBlob(blob, nm, ttT("我的健行紀錄")) === "saved") toast(ttT("圖卡存好了"));
      close();
    }));
  } catch (e) { close(); toast(ttT("圖卡沒做出來，再試一次")); }
}
$("#trackMask").addEventListener("click", closeTrackReview);
$("#closeTrackBtn").addEventListener("click", closeTrackReview);

