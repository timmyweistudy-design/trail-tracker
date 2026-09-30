// 記錄頁：記錄中的畫面更新、開始/暫停/結束、行程結算頁、隨手拍、閃退復原（從 app.js 拆出來，2026-10-01）。
// 在 app.js、explore.js 之後載入：用到 app.js 的 $、ic、toast、recMap 等全域；GPS 與數字計算在 recorder.js。
// ---------- 記錄頁 ----------
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
async function saveImageFile(file) {
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name || ("循徑拾光_" + Date.now() + ".jpg");
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// 步道詳情頁：顯示走過這條步道的山友公開貼文
// 「最近有人走過」：只聚合使用者自己設為公開的貼文，且少於 3 人不顯示任何數字（k-匿名，
// 否則「近 30 天 1 人走過」等於公開某個人的行蹤）。資料庫端也擋一次（schema-phase26）。
async function loadTrailActivity(t) {
  const box = $("#activityBox");
  if (socialHidden()) return;   // 社群功能關掉時不查別人的健行統計
  if (!box || typeof Supa === "undefined" || !Supa.ready || !Supa.ready()) return;
  try {
    const c = Supa.client(); if (!c) return;
    const { data, error } = await c.rpc("trail_activity", { p_trail: String(t.id), p_days: 30 });
    if (error || !data || !data.length) return;           // 資料庫還沒跑 phase26 → 靜默不顯示
    if (_detailTrail !== t) return;                       // 已切換步道
    const a = data[0];
    if (!a.hikers || a.hikers < 3) return;                // 人太少 → 不顯示（隱私）
    const bits = [`<span><b>${a.hikers}</b> ${ttT("人走過")}</span>`];
    if (a.median_ms) bits.push(`<span>${ttT("平均耗時")} <b>${fmtTime(Number(a.median_ms))}</b></span>`);
    if (a.median_ascent) bits.push(`<span>${ttT("平均爬升")} <b>↑${a.median_ascent}</b> m</span>`);
    box.hidden = false;
    box.className = "activity-card";
    box.innerHTML = `<div class="act-h">${ic("users")} ${ttT("最近 30 天")}</div>
      <div class="act-row">${bits.join(`<span class="act-dot">·</span>`)}</div>`;
  } catch (e) { /* 沒有這個函式/離線 → 不顯示，不影響其他區塊 */ }
}

async function loadTrailFeed(t) {
  const box = $("#trailFeedBox"); if (!box) return;
  if (socialHidden()) { box.innerHTML = ""; return; }   // 社群功能關掉時不撈社群貼文
  if (typeof Supa === "undefined" || !Supa.ready() || typeof Posts === "undefined" || typeof Feed === "undefined") { box.innerHTML = ""; return; }
  try {
    const posts = await Posts.byTrail(t.id, 12);
    if (!$("#trailFeedBox") || _detailTrail !== t) return;   // 已切換步道
    if (!posts.length) { box.innerHTML = ""; return; }
    const liked = await Posts.likedSet(posts.map(p => p.id));
    box.innerHTML = `<div class="section-title">${ic("megaphone")}山友走過這條（${posts.length}）</div><div class="feed-list">${posts.map(p => Feed.card(p, liked.has(p.id))).join("")}</div>`;
    box.querySelectorAll(".feed-card").forEach(card => card.addEventListener("click", e => {
      if (e.target.closest(".fc-author") || e.target.closest(".fc-traillink") || e.target.closest(".fc-like")) return;
      if (typeof PostView !== "undefined") PostView.open(card.dataset.id);
    }));
  } catch (e) { box.innerHTML = ""; }
}
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
      <button class="tu-x" id="tuDismiss" aria-label="${ttT("關閉")}">✕</button>
      <div class="tu-h">✨ ${ttT("這一刻，值得更多")}</div>
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
      <div class="item"><div class="l">距離</div><div class="v">${km.toFixed(2)} km</div></div>
      <div class="item"><div class="l">時間</div><div class="v">${fmtDur(rec.elapsedMs)}</div></div>
      <div class="item"><div class="l">總爬升${rec.altCorrected ? ` <span class="ok-mark" title="${ttT("已用地形資料校正")}">${ic("check")}</span>` : ""}</div><div class="v">↑${rec.ascent || 0} m</div></div>
      <div class="item"><div class="l">總下降</div><div class="v">↓${rec.descent || 0} m</div></div>
      <div class="item"><div class="l">消耗</div><div class="v">${rec.kcal} 大卡</div></div>
      <div class="item"><div class="l">步數</div><div class="v">${(rec.steps || 0).toLocaleString()}</div></div>
      ${!rec.sim && rec.elapsedMs > 0 && km > 0.05 ? `<div class="item"><div class="l">平均速度</div><div class="v">${(km / (rec.elapsedMs / 3.6e6)).toFixed(1)} km/h</div></div>` : ""}
      ${!rec.sim && rec.elapsedMs > 6e5 && (rec.ascent || 0) >= 100 && _pro() ? `<div class="item"><div class="l">爬升速率</div><div class="v">${Math.round(rec.ascent / (rec.elapsedMs / 3.6e6))} m/hr</div></div>` : ""}
      ${t3 && t3 > km + 0.05 ? `<div class="item"><div class="l">含坡度距離</div><div class="v">${t3.toFixed(2)} km</div></div>` : ""}
    </div>
    ${speedHtml(rec)}
    ${(rec.id === hikePhotosRecId && hikePhotos.length) ? `<div class="section-title">${ic("camera")}隨手拍（${hikePhotos.length}）<span class="shot-hint">點照片存到相簿</span></div>
      <div class="hike-shots">${hikePhotos.map((p, i) => `<figure class="shot" data-i="${i}"><img loading="lazy" decoding="async" src="${(u => { _shotUrls.push(u); return u; })(URL.createObjectURL(p.file))}" alt=""><figcaption>${new Date(p.t).toLocaleTimeString(ttLocale(), { hour: "2-digit", minute: "2-digit" })} · ${p.km.toFixed(2)} km</figcaption></figure>`).join("")}</div>` : ""}
    <div class="link-row flow">
      <button class="link-btn" id="trackReplay">${ic("play")} 重播路徑</button>
      <button class="link-btn" id="track3d">${ic("mountain")} 3D 回放<span class="pro-tag">PRO</span></button>
      <button class="link-btn" id="trackCard">${ic("camera")} 分享圖卡</button>
      <button class="link-btn" id="trackGpx">${ic("download")} 路線檔<span class="pro-tag">PRO</span></button>
      <button class="link-btn" id="trackShare">${ic("share")} 分享行程</button>
      ${rec.sim || socialHidden() ? "" : `<button class="link-btn social-only" id="trackSocial">${ic("megaphone")} 分享到社群</button>`}
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
    GPX.exportRecord(rec); toast("已下載路線檔");
  });
  $("#trackShare").addEventListener("click", () => {
    const _L = (typeof I18n !== "undefined") ? I18n.lang() : "zh";
    const _tn = rec.trailName || ttT("自由路線"), _a = rec.ascent || 0, _km = km.toFixed(2), _t = fmtTime(rec.elapsedMs);
    const _share = {
      en: `I hiked ${_tn}: ${_km} km, ↑${_a} m, ${rec.kcal} kcal, ${_t} ⛰️ — Gather the Trail`,
      es: `Caminé ${_tn}: ${_km} km, ↑${_a} m, ${rec.kcal} kcal, ${_t} ⛰️ — Gather the Trail`,
      ja: `${_tn}を歩きました：${_km} km、↑${_a} m、${rec.kcal} kcal、${_t} ⛰️ — Gather the Trail`,
      ko: `${_tn} 하이킹: ${_km} km, ↑${_a} m, ${rec.kcal} kcal, ${_t} ⛰️ — Gather the Trail`,
      fr: `J'ai marché ${_tn} : ${_km} km, ↑${_a} m, ${rec.kcal} kcal, ${_t} ⛰️ — Gather the Trail`,
      de: `Ich bin ${_tn} gewandert: ${_km} km, ↑${_a} m, ${rec.kcal} kcal, ${_t} ⛰️ — Gather the Trail`,
      cn: `我走了 ${_tn}：${_km} km、爬升 ↑${_a}m、${rec.kcal} 大卡、${_t} ⛰️ — 循径拾光`,
    };
    const text = _share[_L] || (_L === "zh" ? `我走了 ${rec.trailName || "自由路線"}：${_km} km、爬升 ↑${_a}m、${rec.kcal} 大卡、${_t} ⛰️ — 循徑拾光` : _share.en);
    if (navigator.share) navigator.share({ title: ttT("我的健行紀錄"), text }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast("已複製,可貼給朋友"));
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
let _cardTheme = 0;
// 成果分享圖卡：把這趟健行畫成一張可分享/下載的圖
async function shareHikeCard(rec) {
  try {
    try { await document.fonts.ready; } catch (e) { /* 確保自帶字型已載入，canvas 才畫得出 TaipeiSans */ }
    const T = CARD_THEMES[_cardTheme % CARD_THEMES.length];
    const S = 1080, c = document.createElement("canvas");
    c.width = S; c.height = S;
    const x = c.getContext("2d");
    // 背景漸層（依版型）
    const g = x.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, T.bg[0]); g.addColorStop(.55, T.bg[1]); g.addColorStop(1, T.bg[2]);
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    // 品牌
    x.fillStyle = T.brand; x.font = "600 30px 'TaipeiSans', sans-serif";
    x.fillText(ttT("循徑拾光 · GATHER THE TRAIL"), 70, 96);
    // 步道名
    x.fillStyle = T.ink; x.font = "700 64px 'TaipeiSans', sans-serif";
    const name = (rec.trailName || "自由路線").slice(0, 12);
    x.fillText(name, 70, 188);
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
    // 大數字：距離（整體上移，底部留足白）
    x.fillStyle = T.ink; x.font = "700 132px 'TaipeiSans', sans-serif";
    x.fillText((rec.distanceKm || 0).toFixed(2), 70, 846);
    x.fillStyle = T.unit; x.font = "500 40px 'TaipeiSans', sans-serif"; x.fillText(ttT("公里"), 72, 896);
    // 分隔細線
    x.strokeStyle = T.line; x.lineWidth = 2;
    x.beginPath(); x.moveTo(70, 940); x.lineTo(S - 70, 940); x.stroke();
    // 統計列
    const stats = [[ttT("時間"), fmtTime(rec.elapsedMs)], [ttT("爬升"), "↑" + (rec.ascent || 0) + "m"], [ttT("大卡"), String(rec.kcal || 0)], [ttT("步數"), (rec.steps || 0).toLocaleString()]];
    const cw = (S - 140) / stats.length;
    stats.forEach(([l, v], i) => {
      const cx = 70 + cw * i;
      x.fillStyle = T.statV; x.font = "600 46px 'TaipeiSans', sans-serif"; x.fillText(v, cx, 1000);
      x.fillStyle = T.statL; x.font = "400 26px 'TaipeiSans', sans-serif"; x.fillText(l, cx, 1038);
    });
    // 季節貼紙：依這趟月份放一個節氣小圖示（右上角，與左上品牌對稱）
    const _mon = new Date(rec.date).getMonth() + 1;
    const _season = (_mon >= 3 && _mon <= 5) ? "🌸" : (_mon >= 6 && _mon <= 8) ? "☀️" : (_mon >= 9 && _mon <= 11) ? "🍁" : "❄️";
    x.save(); x.globalAlpha = 0.95; x.font = "76px serif"; x.textAlign = "right"; x.fillText(_season, S - 56, 120); x.restore();
    _cardTheme++;   // 下次按分享圖卡換下一個版型
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    const file = new File([blob], (typeof I18n !== "undefined" && I18n.lang() !== "zh") ? "gather-the-trail-card.png" : "循徑拾光.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: ttT("我的健行紀錄") });
    } else {
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = (typeof I18n !== "undefined" && I18n.lang() !== "zh") ? "gather-the-trail-card.png" : "循徑拾光健行卡.png"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast("圖卡已下載");
    }
  } catch (e) { toast("圖卡產生失敗"); }
}
$("#trackMask").addEventListener("click", closeTrackReview);
$("#closeTrackBtn").addEventListener("click", closeTrackReview);

let guideLine = null, selectedTrailGeo = null, routeRefLayer = null, selectedTrailId = null;
// 記錄頁沿線地標：選定步道的地標＋HUD（下一個地標／剩多遠／抵達）
let selectedTrailWps = [], recWpLayer = null, _wpReached = null, _wpRefLine = null, _wpPrevAlong = null, _wpDir = 1;
function _segProj(p, a, b) {   // p/a/b=[lat,lon]；回傳 {d公尺, t段內比例}
  const C = 6371000, latref = a[0] * Math.PI / 180;
  const mx = lon => lon * Math.PI / 180 * C * Math.cos(latref), my = lat => lat * Math.PI / 180 * C;
  const px = mx(p[1]), py = my(p[0]), ax = mx(a[1]), ay = my(a[0]), bx = mx(b[1]), by = my(b[0]);
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return { d: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
}
function _distAlong(pt, line) {   // 投影到折線，回傳距起點里程(公尺)
  let bestD = 1e18, along = 0, cum = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], r = _segProj(pt, a, b);
    const seg = haversine({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] });
    if (r.d < bestD) { bestD = r.d; along = cum + r.t * seg; }
    cum += seg;
  }
  return along;
}
function resetWpHud() {
  _wpReached = new Set(); _wpPrevAlong = null; _wpDir = 1;
  _wpRefLine = (selectedTrailGeo && selectedTrailGeo.length) ? selectedTrailGeo.reduce((a, b) => (b.length > a.length ? b : a), selectedTrailGeo[0]) : null;
  const hud = $("#recWpHud"); if (hud) hud.innerHTML = "";
}
function updateWpHud(lat, lon) {
  const hud = $("#recWpHud"); if (!hud) return;
  if (!selectedTrailWps.length || !_wpRefLine || lat == null) { hud.innerHTML = ""; return; }
  const along = _distAlong([lat, lon], _wpRefLine);
  // 抵達偵測：40m 內、尚未標記 → 提示並把該地標變灰
  let hit = false;
  for (const w of selectedTrailWps) {
    if (_wpReached.has(w.name)) continue;
    if (haversine({ lat, lon }, { lat: w.lat, lon: w.lon }) <= 40) { _wpReached.add(w.name); hit = true; if (typeof toast === "function") toast(ttT("抵達") + " " + w.name); }
  }
  if (hit && recWpLayer) drawWaypoints(recWpLayer, selectedTrailWps, _wpReached);
  // 行進方向：里程增加=正向、減少=反向（從哪一頭走都對）
  if (_wpPrevAlong != null && Math.abs(along - _wpPrevAlong) > 3) _wpDir = along > _wpPrevAlong ? 1 : -1;
  _wpPrevAlong = along;
  const ahead = selectedTrailWps
    .filter(w => !_wpReached.has(w.name) && (_wpDir > 0 ? w.distM > along - 20 : w.distM < along + 20))
    .sort((a, b) => _wpDir > 0 ? a.distM - b.distM : b.distM - a.distM)[0];
  if (!ahead) { hud.innerHTML = ""; return; }
  const rem = Math.abs(ahead.distM - along) / 1000;
  hud.innerHTML = wpIconSvg(ahead.type)
    + `<span class="h-txt">${ttT("下一個")}：<b>${(ahead.name || "").replace(/[<>&]/g, "")}</b></span>`
    + `<span class="h-rem">${rem < 0.08 ? ttT("即將抵達") : ttT("剩") + " " + rem.toFixed(1) + " km"}</span>`;
}
// #3 行前小卡：選好步道、開始前顯示今日天氣＋日落時間（避免摸黑）＋該難度建議裝備
function clearPreHike() { const el = $("#preHike"); if (el) { el.hidden = true; el.innerHTML = ""; } }
function sunsetWarn(hm) {
  const p = hm.split(":"); const ss = new Date(); ss.setHours(+p[0], +p[1], 0, 0);
  const hrs = (ss - Date.now()) / 3600000;
  if (hrs < 0) return `<b class="ph-warn">・${ttT("天已黑")}</b>`;
  if (hrs < 3) return `<b class="ph-warn">・${ttT("剩不到 3 小時天黑")}</b>`;
  return "";
}
let _sunsetHM = null, _sunsetWarned = false;   // 回程提醒用：選步道時查到的今日日落
async function renderPreHike(t) {
  const el = $("#preHike"); if (!el) return;
  if (!t || !t.lat) { clearPreHike(); return; }
  const g = GRADES[t.difficulty] || null, gear = g ? g.gear : "";
  const gearRow = `<div class="ph-row"><span class="ph-ic">${ic("backpack")}</span><span>${ttT("建議裝備")}：${gear ? ttT(gear) : "—"}</span></div>`;
  el.hidden = false; el.innerHTML = gearRow;
  if (!navigator.onLine || typeof Weather === "undefined") return;
  try {
    const w = await Weather.get(t.lat, t.lon);
    if ($("#preHike") !== el || el.hidden || selectedTrailId !== t.id) return;   // 期間已切換步道/開始
    const d = w.daily || {}, cur = w.current || {};
    const code = cur.weather_code != null ? cur.weather_code : (d.weather_code && d.weather_code[0]);
    const [emo, txt] = Weather.desc(code);
    const tmax = d.temperature_2m_max ? Math.round(d.temperature_2m_max[0]) : null;
    const tmin = d.temperature_2m_min ? Math.round(d.temperature_2m_min[0]) : null;
    const pop = d.precipitation_probability_max ? d.precipitation_probability_max[0] : null;
    const sunHM = (d.sunset && d.sunset[0]) ? d.sunset[0].slice(11, 16) : null;
    const wIc = code == null ? "sun" : code <= 1 ? "sun" : code <= 48 ? "cloud" : "rain";
    const wline = `${ttT(txt)}${tmin != null ? ` ${tmin}–${tmax}°` : ""}${pop != null ? `・${ttT("降雨")} ${pop}%` : ""}`;
    _sunsetHM = sunHM; _sunsetWarned = false;
    el.innerHTML =
      `<div class="ph-row"><span class="ph-ic">${ic(wIc)}</span><span>${wline}</span></div>` +
      (sunHM ? `<div class="ph-row"><span class="ph-ic">${ic("sunset")}</span><span>${ttT("今日日落")} ${sunHM}${sunsetWarn(sunHM)}</span></div>` : "") +
      gearRow;
  } catch (e) { /* 天氣查詢失敗：保留裝備列 */ }
}
function drawSelectedRoute() {
  if (!recMap) return;
  if (routeRefLayer) { recMap.removeLayer(routeRefLayer); routeRefLayer = null; }
  if (!selectedTrailGeo || !selectedTrailGeo.length) return;
  routeRefLayer = L.layerGroup(selectedTrailGeo.map(seg =>
    L.polyline(seg, { color: "#2f7d4f", weight: 4, opacity: .55, dashArray: "6 6" }))).addTo(recMap);
  if (!recWpLayer) recWpLayer = L.layerGroup().addTo(recMap); else recWpLayer.addTo(recMap);
  drawWaypoints(recWpLayer, selectedTrailWps, _wpReached);   // 沿線地標疊到記錄地圖
  const b = L.featureGroup(selectedTrailGeo.map(s => L.polyline(s))).getBounds();
  if (b.isValid()) recMap.fitBounds(b, { padding: [20, 20] });
}
// 點到步道路線的最短距離（公尺）
// 完成判定：只有「真實走過」（非模擬/非車速）且連回某條步道、
// 全程都沒有偏離該步道路線超過 1km，才自動標記完成。手動勾選已移除。
const OFF_ROUTE_MAX = 1000;   // 公尺
function maybeMarkTrailDone(rec) {
  if (!isFootRec(rec) || !rec.trailId || !rec.track || rec.track.length < 2) return;
  if (!selectedTrailGeo || !selectedTrailGeo.length) return;   // 沒有路線資料無法判定偏離 → 不自動完成
  const tr = rec.track, step = Math.max(1, Math.floor(tr.length / 250));   // 取樣，避免點太多算太慢
  let maxDev = 0;
  for (let i = 0; i < tr.length; i += step) {
    const d = distToRoute(tr[i].lat, tr[i].lon);
    if (d != null && d > maxDev) { maxDev = d; if (maxDev > OFF_ROUTE_MAX) break; }
  }
  if (maxDev > OFF_ROUTE_MAX) return;   // 偏離超過 1km → 這趟不算完成
  if (!Store.trailLog(rec.trailId).done) {
    Store.setTrailLog(rec.trailId, { done: true });
    toast(`🎉 ${ttT("完成了步道")}：${rec.trailName || ""}`);
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
  }
}
// 點到路線的距離。⚠️ 必須算「到線段」而不是「到頂點」：官方路線的頂點間距常有 100–200 m，
// 只比對頂點的話，走在兩個頂點正中間的人明明在路上，卻會被算成離線好幾十公尺（會誤報偏離、也會誤判未完成）。
function distToRoute(lat, lon) {
  const segs = routeSegs();
  if (!segs) return null;
  let min = Infinity;
  for (const seg of segs)
    for (let i = 1; i < seg.length; i++) {
      const d = distToSegment(lat, lon, seg[i - 1], seg[i]);
      if (d < min) min = d;
    }
  return min === Infinity ? null : min;
}
// 點到線段的最短距離（公尺）。小範圍內用等距投影近似（緯度換算固定、經度乘 cos(lat)），誤差可忽略。
function distToSegment(lat, lon, a, b) {
  const R = 111320, cos = Math.cos(lat * Math.PI / 180);
  const px = (lon - a[1]) * R * cos, py = (lat - a[0]) * R;
  const bx = (b[1] - a[1]) * R * cos, by = (b[0] - a[0]) * R;
  const len2 = bx * bx + by * by;
  let t = len2 > 0 ? (px * bx + py * by) / len2 : 0;
  t = Math.max(0, Math.min(1, t));                    // 投影落在線段外 → 夾到端點
  const dx = px - bx * t, dy = py - by * t;
  return Math.sqrt(dx * dx + dy * dy);
}
// 目前可用來比對的路線：選定步道的官方路線，或使用者匯入/跟走的 GPX 參考線
function routeSegs() {
  if (selectedTrailGeo && selectedTrailGeo.length) return selectedTrailGeo;
  if (guideLine) {
    const ll = guideLine.getLatLngs();
    if (ll && ll.length) return [ll.map(p => [p.lat, p.lon])];
  }
  return null;
}

// ── 偏離路線警告 ──
// 走錯岔路是山難的常見起因。有路線可比對時，離線 50 m 且持續 30 秒才示警
// （GPS 本身有 5–10 m 誤差，短暫繞路上廁所/拍照不該一直叫）。
const OFF_ROUTE_DIST = 50;      // 公尺
const OFF_ROUTE_HOLD = 30000;   // 毫秒：要「持續」這麼久才算真的走偏
const OFF_ROUTE_REPEAT = 120000;   // 仍在偏離中 → 每 2 分鐘再震一次（不要一直吵）
let _offSince = 0, _offAlerted = 0;
function checkOffRoute(s, d) {
  const banner = $("#offRoute");
  if (!banner) return;
  const last = s.track && s.track.length ? s.track[s.track.length - 1] : null;
  if (s.state !== "running" || !last || !routeSegs()) { hideOffRoute(); return; }
  if (d === undefined) d = distToRoute(last.lat, last.lon);
  if (d == null) { hideOffRoute(); return; }

  if (d <= OFF_ROUTE_DIST) {   // 回到路線上
    if (_offAlerted) toast(ttT("已回到路線"));
    _offSince = 0; _offAlerted = 0;
    banner.hidden = true;
    return;
  }
  const now = Date.now();
  if (!_offSince) { _offSince = now; return; }              // 剛離線 → 先觀察，別急著叫
  if (now - _offSince < OFF_ROUTE_HOLD) return;             // 還沒持續夠久（短暫繞路不算）

  banner.hidden = false;
  banner.innerHTML = `<b>${ic("alert")} ${ttT("已偏離路線")}</b><span>${ttT("距路線")} ${Math.round(d)} m</span>`;
  if (!_offAlerted || now - _offAlerted > OFF_ROUTE_REPEAT) {
    _offAlerted = now;
    if (navigator.vibrate) navigator.vibrate([180, 90, 180, 90, 180]);   // 手機在口袋裡時，震動是唯一感受得到的
  }
}
function hideOffRoute() {
  const b = $("#offRoute");
  if (b) b.hidden = true;
  _offSince = 0; _offAlerted = 0;
}
// 記錄頁「已選擇的步道」列：按 ✕ 可退回自由路線（開始記錄後就不給取消——中途換成自由路線
// 會讓偏離警告與完成判定的依據在半路消失，數字對不上）。
function showSelectedTrail(name) {
  const el = $("#selTrail");
  if (!el) return;
  el.hidden = false;
  el.innerHTML = `<span class="st-what">${ic("pin")} ${ttT("已選擇")}<b>${escHtml(name)}</b></span>
    <button class="st-x" id="selTrailX" aria-label="${ttT("取消選擇，改為自由路線")}" title="${ttT("取消選擇，改為自由路線")}">${ic("x")}</button>`;
  const x = $("#selTrailX");
  if (x) x.addEventListener("click", clearSelectedTrail);
  setRecStatus(ttT("按「開始」記錄這條步道"));
}
function clearSelectedTrail() {
  selectedTrailGeo = null; selectedTrailId = null;
  selectedTrailWps = []; if (recWpLayer) recWpLayer.clearLayers(); { const _h = $("#recWpHud"); if (_h) _h.innerHTML = ""; }
  Recorder._trailName = null; Recorder._trailId = null;
  if (routeRefLayer && recMap) { recMap.removeLayer(routeRefLayer); routeRefLayer = null; }
  if (guideLine && recMap) { recMap.removeLayer(guideLine); guideLine = null; }
  clearPreHike(); _sunsetHM = null;
  hideSelectedTrail();
  setRecStatus(ttT("沒選步道也行，按開始就記"));
  try { renderRecIdle(); } catch (e) { /* */ }
  toast(ttT("已改為自由路線"));
}
function hideSelectedTrail() {
  const el = $("#selTrail");
  if (el) { el.hidden = true; el.innerHTML = ""; }
}
// 選一條步道來記錄（詳情頁「在此步道開始記錄」、待機頁的快捷卡、閃退復原都走這條）
function selectTrailForRecord(t, opts) {
  if (!t) return;
  selectedTrailGeo = geoOf(t);
  selectedTrailId = t.id;
  selectedTrailWps = t.waypoints || [];
  Recorder._trailName = t.name; Recorder._trailId = t.id;
  if (!(opts && opts.quiet)) { showSelectedTrail(t.name); renderPreHike(t); }
  setTimeout(() => { initRecMap(); drawSelectedRoute(); resetWpHud(); try { renderRecIdle(); } catch (e) { /* */ } }, 80);
}

function initRecMap() {
  if (!recMap) {
    recMap = L.map("recMap", { zoomControl: false }).setView([25.033, 121.564], 15);
    baseTopo().addTo(recMap); hillshadeLayer(recMap).addTo(recMap); addCompass(recMap); addNavToggle(recMap); addRecenter(recMap); addThreeD(recMap, open3DRecording); addFullscreen(recMap);
    recLine = L.polyline([], { color: "#2f7d4f", weight: 5 }).addTo(recMap);
    // 使用者手動滑動地圖 → 停止自動跟隨（不再每次定位就硬拉回中間）；捏合縮放不算，只認拖曳
    recMap.on("dragstart", () => setRecFollow(false));
  }
  setRecFollow(true);   // 每次進記錄頁預設恢復跟隨
  recMap.invalidateSize();
  // 復原中的軌跡重畫（依 gap 分段，暫停跳段不連線）
  if (recLine && Recorder.getState() !== "idle") {
    const tr = Recorder.snapshot().track || [];
    const pts = tr.map(p => [p.lat, p.lon]);
    if (pts.length) { recLine.setLatLngs(trackSegments(tr).map(s => s.map(p => [p.lat, p.lon]))); setTimeout(() => recMap.fitBounds(L.polyline(pts).getBounds(), { padding: [20, 20] }), 60); }
  }
}

// 匯入 GPX 路線當參考線
$("#btnImportGpx").addEventListener("click", () => {
  if (!_proGate()) return;   // PRO：跟著路線走（匯入 GPX）
  $("#gpxFile").click();
});
$("#gpxFile").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const pts = GPX.parse(reader.result);
    if (!pts.length) { toast("這個檔案沒有可用的路徑"); return; }
    followRoute(pts.map(p => [p.lat, p.lon]));
  };
  reader.readAsText(file);
  e.target.value = "";
});

// 在記錄頁畫出橘色虛線參考路徑（GPX 匯入 / 跟著貼文路線走 共用）
function followRoute(latlngs) {
  if (!latlngs || latlngs.length < 2) { toast("這條路線沒有可用的軌跡"); return; }
  initRecMap();
  if (guideLine) recMap.removeLayer(guideLine);
  guideLine = L.polyline(latlngs, { color: "#e8893b", weight: 4, dashArray: "8 6", opacity: .9 }).addTo(recMap);
  recMap.fitBounds(guideLine.getBounds(), { padding: [20, 20] });
  setTimeout(() => recMap.invalidateSize(), 120);
  toast(`已載入路線（${latlngs.length} 點），橘色虛線即參考路徑`);
}
window.followRoute = followRoute;

// 記錄頁即時海拔曲線
function drawRecSpark(series) {
  const box = $("#recElevSpark");
  if (!box) return;
  if (!series || series.length < 3) { box.hidden = true; return; }
  const W = 320, H = 56, pad = 4;
  const es = series.map(p => p.e), xs = series.map(p => p.x);
  const minE = Math.min(...es), maxE = Math.max(...es), span = (maxE - minE) || 1;
  const x0 = xs[0], totX = (xs[xs.length - 1] - x0) || 1;
  const xy = series.map(p => [
    pad + (W - 2 * pad) * (p.x - x0) / totX,
    pad + (H - 2 * pad) * (1 - (p.e - minE) / span),
  ]);
  const line = xy.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)},${H - pad} L${xy[0][0].toFixed(1)},${H - pad} Z`;
  box.hidden = false;
  const lp = xy[xy.length - 1];
  box.innerHTML = `<div class="rec-spark-box"><svg viewBox="0 0 ${W} ${H}" class="rec-spark" preserveAspectRatio="none">
      <path d="${area}" fill="rgba(63,122,85,.18)"/>
      <path d="${line}" fill="none" stroke="var(--brand-mid)" stroke-width="2" stroke-linejoin="round"/>
    </svg><i class="rec-spark-dot" style="left:${(lp[0] / W * 100).toFixed(1)}%;top:${(lp[1] / H * 100).toFixed(1)}%"></i></div>
    <div class="rec-spark-cap"><span>${ttT("目前海拔")} <b>${Math.round(es[es.length - 1])} m</b></span><span>${ttT("最低")} ${Math.round(minE)} m・${ttT("最高")} ${Math.round(maxE)} m</span></div>`;
}
// 隨拍隨傳：記錄中拍照，存當下時間與里程；結算頁顯示、可選擇分享
let hikePhotos = [], hikePhotosRecId = null, recSnap = null, _shotUrls = [];
let _liveElev = null, _liveElevAt = 0, _liveElevLen = 0, _liveElevBusy = false, _recSeq = 0;
let _gpsWeakHits = 0, _gpsWarnAt = 0;
// （記錄頁閒置天氣提示「今天可能有雨」已依使用者要求移除；行前天氣改看已選步道的天氣卡 #preHike）
// 依定位精度更新「GPS 訊號」小燈號（綠=好 / 黃=普通 / 紅=弱），並在持續弱訊號時提醒一次
function updateGpsSig(s) {
  const gs = $("#gpsSig"); if (!gs) return;
  if (s.state !== "running" || (typeof sim === "function" && sim())) { gs.hidden = true; _gpsWeakHits = 0; return; }
  const a = s.acc;
  let lvl = "weak";
  if (a != null && a <= 15) lvl = "good"; else if (a != null && a <= 35) lvl = "ok";
  gs.hidden = false;
  gs.className = "gps-sig " + lvl;
  const t = gs.querySelector(".gs-txt"); if (t) t.textContent = (a != null && isFinite(a)) ? `GPS ±${Math.round(a)}m` : "GPS…";
  if (lvl === "weak") {
    _gpsWeakHits++;
    // 連續多次弱訊號才提醒，且每 25 秒最多一次，避免洗版
    if (_gpsWeakHits >= 4 && Date.now() - _gpsWarnAt > 25000) { _gpsWarnAt = Date.now(); toast(ttT("GPS 訊號有點弱，走到開闊一點的地方會好很多")); }
  } else _gpsWeakHits = 0;
}
// ── 記錄中每一次更新（每秒＋每個定位點）──
// 效能：DOM 節點只查一次；文字「有變才寫」（每秒硬寫會觸發翻譯系統重掃、螢幕閱讀器每秒重唸狀態）；
// 軌跡線只補畫新增的點（以前每秒整條重畫，軌跡越長越慢）；離路線距離一個 tick 只算一次。
const _R = {};
function _r(id) { return _R[id] || (_R[id] = document.getElementById(id)); }
function setText(el, v) { if (el && el.textContent !== v) el.textContent = v; }
let _lastStatus = "";
function setRecStatus(html, isHtml) {
  const el = _r("recStatus"); if (!el) return;
  const key = (isHtml ? "h:" : "t:") + html;
  if (key === _lastStatus) return;
  _lastStatus = key;
  if (isHtml) el.innerHTML = html; else el.textContent = html;
}
let _drawnN = 0, _drawnGaps = 0;
function drawRecLine(track) {
  if (!recLine) return;
  const gaps = track.reduce((n, q) => n + (q.gap ? 1 : 0), 0);
  if (track.length < _drawnN || gaps !== _drawnGaps || _drawnN === 0) {   // 新的一趟／出現暫停分段 → 整條重畫
    recLine.setLatLngs(trackSegments(track).map(seg => seg.map(p => [p.lat, p.lon])));
  } else {
    const ll = recLine.getLatLngs(), ring = Array.isArray(ll[0]) ? ll[ll.length - 1] : ll;
    for (let k = _drawnN; k < track.length; k++) recLine.addLatLng([track[k].lat, track[k].lon], ring);
  }
  _drawnN = track.length; _drawnGaps = gaps;
}
const GPS_ERR = {
  1: "沒有定位權限。請到手機設定打開這個 App 的定位",
  2: "暫時抓不到定位，走到開闊一點的地方試試",
  3: "定位有點慢，還在努力找訊號…",
};
let _simDoneToasted = false, _kmStartT = 0, _restWarned = false;
Recorder.onUpdate(s => {
  recSnap = s;
  syncRecButtons(s.state);   // 按鈕依 Recorder 實際狀態校正
  if (!s.waiting) updateGpsSig(s); else { const gs = _r("gpsSig"); if (gs) gs.hidden = true; }
  const last = s.track && s.track.length ? s.track[s.track.length - 1] : null;
  if (s.state === "running" && selectedTrailWps.length && last) { try { updateWpHud(last.lat, last.lon); } catch (e) { /* */ } }
  setText(_r("stDist"), s.distanceKm.toFixed(2));
  setText(_r("stSteps"), s.steps.toLocaleString());
  setText(_r("stKcal"), String(s.kcal));
  setText(_r("stTime"), fmtTime(s.elapsedMs));
  setText(_r("stPace"), (s.state === "running" && s.instKmh != null && !s.waiting) ? s.instKmh.toFixed(1) : "--");
  const offD = (s.state === "running" && last && routeSegs()) ? distToRoute(last.lat, last.lon) : null;
  checkOffRoute(s, offD);
  if (s.state === "idle") { _liveElev = null; _liveElevAt = 0; _liveElevLen = 0; _liveElevBusy = false; _recSeq++; _drawnN = 0; _kmStartT = 0; _restWarned = false; }
  // GPS 高度常為 null → 即時爬升會卡在 0；用地形 DEM 節流校正，讓即時值接近結算值
  if (s.state === "running" && typeof Elevation !== "undefined" && s.track && s.track.length >= 8) {
    const now = Date.now();
    if (!_liveElevBusy && now - _liveElevAt > 30000 && s.track.length - _liveElevLen >= 8) {
      _liveElevBusy = true; _liveElevAt = now; _liveElevLen = s.track.length;
      const seq = _recSeq;
      Elevation.correct(s.track.slice())
        .then(c => { if (seq !== _recSeq) return; if (c) _liveElev = c; _liveElevBusy = false; })
        .catch(() => { if (seq === _recSeq) _liveElevBusy = false; });
    }
  }
  const ad = (_liveElev && (s.ascent || 0) < _liveElev.ascent) ? _liveElev : s;
  setText(_r("stAscent"), `↑${Math.round(ad.ascent || 0)}`);
  setText(_r("stDescent"), `↓${Math.round(ad.descent || 0)}`);
  drawRecSpark(s.altSeries);
  // 果實隨機撿拾：每走 10m 有 5% 機率撿到一顆（模擬不算）
  if (s.state === "running" && !s.resting && !sim()) {
    if (_berryLastKm == null || _berryLastKm > s.distanceKm) _berryLastKm = s.distanceKm;
    let dM = (s.distanceKm - _berryLastKm) * 1000;
    if (dM > 1000) { _berryLastKm = s.distanceKm; dM = 0; }
    let picked = 0;
    while (dM >= 10) { dM -= 10; _berryLastKm += 0.01; if (Math.random() < 0.05) picked++; }
    if (picked > 0 && typeof addBerryPicked === "function") {
      addBerryPicked(picked);
      if (navigator.vibrate) navigator.vibrate([90, 40, 90]);
      toast(picked === 1 ? ttT("🍓 撿到一顆果實！") : `🍓 ${ttT("撿到果實")} +${picked}！`);
      try { if (document.body.dataset.view === "pet") renderPet(); } catch (e) { /* */ }
    }
  }
  // 每公里：震動＋畫面上說一聲這公里走了多久
  if (s.state === "running" && !s.resting && !sim()) {
    if (!_kmStartT) _kmStartT = Date.now() - 0;
    const kmDone = Math.floor(s.distanceKm);
    if (kmDone > lastKmMilestone) {
      const mins = Math.max(1, Math.round((Date.now() - _kmStartT) / 60000));
      lastKmMilestone = kmDone; _kmStartT = Date.now();
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
      toast(`${kmDone} ${ttT("公里完成")}・${ttT("這公里")} ${mins} ${ttT("分鐘")}`);
    }
  }
  // 回程提醒：離日落 90 分鐘就提醒一次（選步道時查到的日落時間）
  if (s.state === "running" && _sunsetHM && !_sunsetWarned) {
    const [hh, mm] = _sunsetHM.split(":").map(Number), ss = new Date(); ss.setHours(hh, mm, 0, 0);
    const left = (ss - Date.now()) / 60000;
    if (left < 90) { _sunsetWarned = true; toast(left > 0 ? `${ttT("離天黑")} ${Math.round(left)} ${ttT("分鐘，差不多該往回走了")}` : ttT("天黑了，頭燈拿出來，慢慢走")); if (navigator.vibrate) navigator.vibrate([200, 100, 200]); }
  }
  // 休息很久：提醒一次
  if (s.state === "running" && s.resting && s.restMs > 15 * 60000 && !_restWarned) { _restWarned = true; toast(ttT("休息 15 分鐘了，要繼續走嗎？")); }
  if (s.state === "running" && !s.resting) _restWarned = false;
  if (s.simDone && !_simDoneToasted) { _simDoneToasted = true; toast(ttT("模擬走完了，按「結束」看結算")); if (navigator.vibrate) navigator.vibrate([60, 40, 60]); }
  if (s.state === "idle") _simDoneToasted = false;
  // 狀態列（有變才寫）
  if (s.error && s.errCode) setRecStatus(`<span class="rs-warn">${ic("alert")} ${escHtml(ttT(GPS_ERR[s.errCode] || GPS_ERR[2]))}</span>`, true);
  else if (s.waiting) setRecStatus(`<span class="rs-wait"><span class="spin"></span>${ttT("正在等定位，第一次可能要十幾秒…")}</span>`, true);
  else if (s.state === "running" && s.resting) setRecStatus(`<span class="resting">${ttT("休息中")}・${fmtDur(s.restMs)}</span>`, true);
  else if (s.state === "running") {
    const onRoute = offD != null && offD <= OFF_ROUTE_DIST;
    setRecStatus(`<span class="live">${ttT("記錄中")}${onRoute ? "・" + ttT("在路線上") : ""}</span>`, true);
  }
  if (s.state === "running" && s.track.length && !recPreloaded) {
    recPreloaded = true;
    preloadAround(s.track[0].lat, s.track[0].lon);
    preload3D(s.track[0].lat, s.track[0].lon);
  }
  if (s.state === "running" && last) preload3D(last.lat, last.lon);
  if (recLine && s.track.length) {
    drawRecLine(s.track);
    const lastLL = [last.lat, last.lon];
    if (typeof TeamLive !== "undefined" && TeamLive.isOn() && TeamLive.updatePos) TeamLive.updatePos(lastLL[0], lastLL[1], s.heading);
    const meAv = window.__meAvatar;
    const _pStage = petStageIndex(totalKm());
    const _pMood = (typeof petMood === "function" ? petMood().k : "content");
    const _pHat = (typeof petHat === "function" ? petHat() : "none");
    const _pSig = _pStage + "|" + _pMood + "|" + _pHat;
    const _petFace = () => `<span class="pm-face pet-m-${_pMood}">${typeof PET_ART !== "undefined" ? PET_ART.svg(_pStage) : petEmojiNow()}${(typeof PET_ART !== "undefined" && PET_ART.hat) ? PET_ART.hat(_pHat, _pStage) : ""}</span>`;
    if (meAv) {
      if (!recMarker || !recMarker._av || recMarker._sig !== _pSig) {
        if (recMarker) recMap.removeLayer(recMarker);
        const mePro = (typeof Premium !== "undefined" && Premium.isOn()) ? " pro" : "";
        recMarker = L.marker(lastLL, { icon: L.divIcon({ className: "team-marker me-marker" + mePro, html: `<div class="tm-av"><div class="tm-dir"><span class="tm-cone"></span></div><img src="${escHtml(meAv)}" alt=""><span class="tm-pet">${_petFace()}</span></div>`, iconSize: [32, 32], iconAnchor: [16, 16] }), zIndexOffset: 1100 }).addTo(recMap);
        recMarker._av = true; recMarker._sig = _pSig;
      }
      recMarker.setLatLng(lastLL);
      if (s.heading != null) _gpsHeading = s.heading;
      updateMeCone();
      if (petMarker) { recMap.removeLayer(petMarker); petMarker = null; }
    } else {
      if (!recMarker || recMarker._av) {
        if (recMarker) recMap.removeLayer(recMarker);
        recMarker = L.circleMarker(lastLL, { radius: 7, color: "#fff", weight: 3, fillColor: "#e8893b", fillOpacity: 1 }).addTo(recMap);
      }
      recMarker.setLatLng(lastLL);
      if (!petMarker || petMarker._sig !== _pSig) {
        if (petMarker) recMap.removeLayer(petMarker);
        petMarker = L.marker(lastLL, { icon: L.divIcon({ className: "pet-marker", html: `<span class="pm-e">${_petFace()}</span>`, iconSize: [40, 40], iconAnchor: [20, 34] }), interactive: false, zIndexOffset: 1000 }).addTo(recMap);
        petMarker._sig = _pSig;
      }
      petMarker.setLatLng(lastLL);
    }
    try {
      const _m = petMarker || recMarker, _el = _m && _m.getElement && _m.getElement();
      const _f = _el && _el.querySelector(".pm-face");
      if (_f) _f.classList.toggle("pet-flip", !_navUp && s.heading != null && Math.sin(s.heading * Math.PI / 180) < -0.2);
    } catch (e) { /* */ }
    if (s.state === "running" && _recFollow) recMap.panTo(lastLL, (sim() || _navUp) ? { animate: false } : undefined);
  }
});
// 暫停中：狀態列顯示已經停了多久（暫停時記錄器的每秒 tick 是停的，另外用一支慢速計時器）
let _pausedAt = 0, _pauseTimer = null;
function tickPaused() {
  if (Recorder.getState() !== "paused") { clearInterval(_pauseTimer); _pauseTimer = null; return; }
  if (!_pausedAt) _pausedAt = Date.now();
  setRecStatus(`${ttT("已暫停")}・${fmtDur(Date.now() - _pausedAt)}`);
}
// 自動存檔存不下（手機空間滿）→ 提醒一次，免得閃退時才發現救不回來
Recorder.onPersistFail(() => toast(ttT("手機空間快滿了，這趟的自動備份存不下，記得早點按結束存檔")));

// 省電模式 + 分享即時位置 + 公里里程碑
let lastKmMilestone = 0, _berryLastKm = null;
$("#lowPowerToggle").addEventListener("change", e => {
  Recorder.setLowPower(e.target.checked);
  toast(e.target.checked ? "已開省電模式" : "已關省電模式");
});
// 螢幕保持喚醒：勾選後記錄中螢幕不熄滅（持久化記住選擇；裝置不支援則隱藏此選項）
(() => {
  const chk = $("#wakeLockToggle"), opt = $("#wakeLockOpt");
  if (!chk) return;
  if (!("wakeLock" in navigator)) { if (opt) opt.hidden = true; return; }
  chk.checked = localStorage.getItem("tt_wakelock") !== "0";   // 預設開（記錄中螢幕不熄滅較符合登山情境），除非使用者明確關掉
  Recorder.setWake(chk.checked);
  chk.addEventListener("change", e => {
    localStorage.setItem("tt_wakelock", e.target.checked ? "1" : "0");
    Recorder.setWake(e.target.checked);
    toast(e.target.checked ? "已開螢幕保持喚醒（記錄中螢幕不熄滅）" : "已關螢幕保持喚醒");
  });
})();
$("#simToggle").addEventListener("change", e => {
  if (e.target.checked && !_proGate()) {   // PRO 限定 → 開升級面板並復原
    e.target.checked = false;
    return;
  }
  toast(e.target.checked ? "已開模擬模式（無 GPS，沿步道路線預覽）" : "已關模擬模式");
});
// 取自己的社群頭像供記錄地圖的「我」標記用（未登入則維持 null＝橘點）
let _meAvFetched = false;
async function ensureMeAvatar() {
  if (_meAvFetched || typeof Supa === "undefined" || !Supa.ready()) return;
  _meAvFetched = true;
  try {
    const c = Supa.client(); const { data: u } = await c.auth.getUser();
    if (!u || !u.user) { _meAvFetched = false; return; }   // 未登入：保留可重試
    const meta = u.user.user_metadata || {};
    const { data: p } = await c.from("profiles").select("avatar_url").eq("id", u.user.id).maybeSingle();
    window.__meAvatar = (p && p.avatar_url) || meta.avatar_url || meta.picture || null;   // 沒設頭像→退而用 Google 大頭照
  } catch (e) { _meAvFetched = false; }
}
// 記錄中的照片先放 IndexedDB（照片太大進不了 localStorage）；結束存檔後清掉，閃退復原時讀回來
const SNAP_DB = "tt_snaps";
function _snapDb() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === "undefined") return rej(new Error("no idb"));
    const r = indexedDB.open(SNAP_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("p", { autoIncrement: true });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function snapStorePut(item) { _snapDb().then(db => { const tx = db.transaction("p", "readwrite"); tx.objectStore("p").add({ blob: item.file, name: item.file.name || "photo.jpg", type: item.file.type, t: item.t, km: item.km }); }).catch(() => {}); }
function snapStoreClear() { _snapDb().then(db => db.transaction("p", "readwrite").objectStore("p").clear()).catch(() => {}); }
function snapStoreLoad() {
  _snapDb().then(db => new Promise(res => { const q = db.transaction("p").objectStore("p").getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); }))
    .then(rows => {
      if (!rows.length) return;
      hikePhotos = rows.map(r => ({ file: new File([r.blob], r.name, { type: r.type }), t: r.t, km: r.km }));
      const c = $("#snapCount"); if (c) c.textContent = ` (${hikePhotos.length})`;
    }).catch(() => {});
}
function addSnapPhoto(f) {
  if (!f) return;
  const km = recSnap ? (recSnap.distanceKm || 0) : 0;
  hikePhotos.push({ file: f, t: Date.now(), km });
  snapStorePut(hikePhotos[hikePhotos.length - 1]);
  $("#snapCount").textContent = ` (${hikePhotos.length})`;
  toast(`${ttT("拍好了")}・${km.toFixed(2)} km`);
}
// 原生 App 走 Capacitor 相機（WKWebView 的 file input 拍照會黑畫面）；純網頁走 file input。
// ⚠️ 一定要「同步」判斷是不是原生：iOS 規定 file input 的 .click() 必須在使用者手勢的同步當下觸發，
//    若先 await 再 click()，手勢已失效 → 檔案選擇器被瀏覽器擋掉、按了完全沒反應。
$("#btnSnap").addEventListener("click", () => {
  if (typeof NativeCam !== "undefined" && NativeCam.isNative()) {
    NativeCam.pickImage(typeof I18n !== "undefined" ? I18n.tx : null).then(addSnapPhoto);   // 原生：File/null（null 會被忽略）
  } else {
    $("#snapInput").click();   // 非原生：同步觸發，保住使用者手勢
  }
});
$("#snapInput").addEventListener("change", e => {
  const f = e.target.files[0]; e.target.value = "";
  addSnapPhoto(f);
});
// 原生 App：外部連結（target=_blank 的 http/https，如導航/查資訊/景點/美食/原始頁）改用
// Capacitor Browser 開系統瀏覽器；WKWebView 裡直接點 <a target=_blank> 可能整個 App 被導走或沒反應。
// 用捕獲階段的委派攔截，一次覆蓋所有這類連結（含之後動態產生的）。網頁無 Browser 外掛 → 不介入。
document.addEventListener("click", e => {
  const B = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
    && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
  if (!B) return;
  const a = e.target.closest && e.target.closest('a[target="_blank"]');
  if (!a) return;
  const href = a.getAttribute("href");
  if (!href || !/^https?:/i.test(href)) return;
  e.preventDefault();
  B.open({ url: href }).catch(() => { try { window.open(href, "_blank"); } catch (_) { /* */ } });
}, true);
$("#btnTeam").addEventListener("click", () => { initRecMap(); if (typeof Team !== "undefined") Team.openSheet(); });
$("#btnShareLoc").addEventListener("click", () => {
  if (!navigator.geolocation) { toast("此裝置不支援定位"); return; }
  toast("定位中…");
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: la, longitude: lo } = pos.coords;
    const url = `https://www.google.com/maps?q=${la.toFixed(6)},${lo.toFixed(6)}`;
    const text = `${ttT("我現在在這裡")}：${url}`;
    if (navigator.share) navigator.share({ title: ttT("我現在在這裡"), text, url }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast("位置連結已複製，可貼給聯絡人"));
    else window.open(url, "_blank");
  }, () => toast("定位失敗，請允許定位權限"), { enableHighAccuracy: true, timeout: 10000 });
});

// 開始記錄時，背景預載當前位置周邊圖磚（保險，避免途中失去訊號）。
// 這也是離線地圖：非會員縮小範圍（±1km、縮放 14–15）並計入 MB 額度；額度不足只跳過預載、不影響記錄。Premium 完整預載（±2km、14–16）。
let recPreloaded = false;
// #1 記錄時預載 3D 地形圖磚（衛星＋terrarium 高程），讓 3D 開起來即時又清晰。3D 屬 PRO → 只對會員預載
const _SAT_URL = (z, x, y) => `${ESRI}/World_Imagery/MapServer/tile/${z}/${y}/${x}${AGTOK}`;
const _TERR_URL = (z, x, y) => `https://elevation-tiles-prod.s3.amazonaws.com/terrarium/${z}/${x}/${y}.png`;
let _pre3dAt = 0;
function preload3D(lat, lon) {
  if (!(typeof Premium !== "undefined" && Premium.isOn())) return;   // 3D 是 PRO 功能
  if (typeof Offline === "undefined" || !navigator.onLine) return;
  const now = Date.now(); if (now - _pre3dAt < 60000) return; _pre3dAt = now;   // 每分鐘最多一次
  const m = 0.02, bbox = { n: lat + m, s: lat - m, e: lon + m, w: lon - m };
  const tiles = [...Offline.tileListUrl(bbox, 14, 16, _SAT_URL), ...Offline.tileListUrl(bbox, 12, 15, _TERR_URL)];
  Offline.download(tiles, () => {}).catch(() => {});   // 靜默預載，存進 tt-tiles，3D 開啟時由 SW 快取直接取用
}
// 飛行前把整條路線走廊需要的 3D 圖磚「全部」抓進快取（含近景 z16 與地形），並回報進度。全載完再飛＝飛行中零串流、不閃
function preload3DFull(bbox, onProgress) {
  if (typeof Offline === "undefined" || !navigator.onLine) return Promise.resolve();
  // 稍微放大範圍，連「低倍父層金字塔」(z7-14) 一起抓——這樣任何地方永遠至少有一張模糊衛星父層墊底，
  // 相機移到還沒貼好近景的地方時，露出的是模糊衛星而不是綠色背景 → 不再閃綠。
  const wide = { n: bbox.n + 0.02, s: bbox.s - 0.02, e: bbox.e + 0.02, w: bbox.w - 0.02 };
  let sat = [...Offline.tileListUrl(wide, 7, 14, _SAT_URL), ...Offline.tileListUrl(bbox, 15, 16, _SAT_URL)];   // 父層金字塔 z7-14 ＋ 走廊 z15-16
  const terr = [...Offline.tileListUrl(wide, 7, 11, _TERR_URL), ...Offline.tileListUrl(bbox, 12, 15, _TERR_URL)];
  if (sat.length + terr.length > 2800) sat = [...Offline.tileListUrl(wide, 7, 14, _SAT_URL), ...Offline.tileListUrl(bbox, 15, 15, _SAT_URL)];   // 路線太大→近景只 z15
  // 去重（父層與走廊可能重疊）
  const tiles = [...new Set([...sat, ...terr])];
  if (!tiles.length) return Promise.resolve();
  return Offline.download(tiles, (done, total) => { if (onProgress) onProgress(Math.round(done / total * 100)); }).catch(() => {});
}
async function preloadAround(lat, lon) {
  const pro = typeof Premium !== "undefined" && Premium.isOn();
  const m = pro ? 0.018 : 0.009;
  const bbox = { n: lat + m, s: lat - m, e: lon + m, w: lon - m };
  const tiles = Offline.tileList(bbox, 14, pro ? 16 : 15);
  if (!pro && !offlineAllow(tiles, true)) { toast("免費離線額度已用完，本次不預載周邊地圖（升級 Premium 記錄時自動完整預載）"); return; }
  try {
    const r = await Offline.download(tiles, () => {});
    if (!pro) addOfflineMb(r.mb);
    toast(`已預載周邊離線地圖（${tiles.length} 張${pro ? "" : `，免費額度剩 ${Math.max(0, OFFLINE_FREE_MB - offlineMbUsed()).toFixed(1)} MB`}）`);
  } catch { /* 靜默 */ }
}

function sim() { return $("#simToggle").checked; }
// 從有路線幾何的步道挑一條（優先親子友善、長度適中）當模擬路線
function pickSimTrail() {
  const hasGeo = t => { const g = geoOf(t); return g && g.some(s => s.length > 5) ? g : null; };
  const cands = TRAILS.filter(hasGeo);
  if (!cands.length) return null;
  const nice = cands.filter(t => t.family_friendly && t.length_km >= 1 && t.length_km <= 8);
  const pool = nice.length ? nice : cands;
  return pool[Math.floor(Math.random() * pool.length)];
}
// 按鈕顯示「依 Recorder 實際狀態」校正——狀態驅動，不靠 handler 手動設。
// 這是保險：startRecordingUI 中途若有任何一步拋例外（Leaflet 初始化、chainSegments、watchPosition…），
// 手動設按鈕那幾行就不會執行 → 「開始後暫停/結束鈕沒出來」。改由每個 tick 校正，下一幀就補上。
// 按鈕與版面「全部」依 Recorder 狀態決定（暫停、繼續、復原、結束、小隊訊號都不再各自手動設）。
// #view-record[data-state] 讓 CSS 決定待機／記錄中／暫停的版面。
let _lastRecState = null;
function syncRecButtons(state) {
  const teamMember = typeof TeamLive !== "undefined" && TeamLive.isOn() && !TeamLive.isLeader();
  const start = _r("btnStart"), pause = _r("btnPause"), stop = _r("btnStop"), snap = _r("btnSnap"), lock = _r("btnLock");
  if (!start) return;
  const v = _r("view-record"); if (v && v.dataset.state !== state) v.dataset.state = state;
  start.hidden = state === "running" || teamMember;
  pause.hidden = state !== "running" || teamMember;
  stop.hidden = state === "idle" || teamMember;
  if (snap) snap.hidden = state !== "running" || sim();
  if (lock) lock.hidden = state !== "running" || teamMember;
  const lbl = start.querySelector(".bl"); if (lbl) setText(lbl, state === "paused" ? ttT("繼續") : ttT("開始"));
  // 記錄中不能切的選項（模擬/省電混用會把真實與模擬混在同一趟）：鎖起來
  ["simToggle"].forEach(id => { const c = _r(id); if (c) c.disabled = state !== "idle"; });
  if (state !== _lastRecState) {
    if (state === "paused") { _pausedAt = Date.now(); tickPaused(); if (!_pauseTimer) _pauseTimer = setInterval(tickPaused, 15000); }
    else _pausedAt = 0;
    _lastRecState = state;
  }
}

// 開始記錄（本人按鈕 / 小隊隊長廣播都走這裡）
function startRecordingUI() {
  initRecMap();
  document.body.classList.add("rec-running");   // A6：記錄中→地圖上的自己寵物走路擺動
  hideSelectedTrail();   // 開始後不給取消：中途改自由路線會讓偏離警告/完成判定的依據在半路消失
  ensureMeAvatar();
  clearPreHike();                     // #3 開始記錄後收起行前小卡
  // 導航模式（地圖跟著方向轉）預設開；但模擬時不開——模擬每一步都在換方位，
  // 地圖會跟著不停轉動，看起來就是一直抖。模擬維持傳統的北方朝上。
  if (!sim() && !_navUserOff) setTimeout(() => setNavUp(true), 300);   // 使用者手動切過「自由」就別自動開回導航
  else setNavUp(false);
  const ri = $("#recIdle"); if (ri) ri.hidden = true;
  // 模擬模式：沿步道真實路線行走（有動畫感）。沒選步道就自動挑一條真實步道。
  if (sim() && Recorder.getState() !== "paused") {
    if (!(selectedTrailGeo && selectedTrailGeo.length)) {
      const t = pickSimTrail();
      if (t) {
        selectedTrailGeo = geoOf(t);
        selectedTrailId = t.id;
        Recorder._trailName = t.name; Recorder._trailId = t.id;
        setRecStatus(`${ttT("模擬")}「${t.name}」`);
        drawSelectedRoute();
        toast(`模擬：沿「${t.name}」前進`);
      }
    } else {
      toast("模擬：沿此步道路線前進");
    }
    // chainSegments 已是「走完所有岔路、主線不重複」的最小覆蓋走法（樹狀路網最後一條分支不折返），
    // 不再截斷——截斷會把岔路砍掉（就是「岔路走不完」的原因）
    const route = selectedTrailGeo && selectedTrailGeo.length ? chainSegments(selectedTrailGeo) : null;
    Recorder.setSimRoute(route);
  }
  try {
    if (Recorder.getState() === "paused") Recorder.resume(sim());
    else { hikePhotos = []; $("#snapCount").textContent = ""; snapStoreClear(); Recorder.start(sim()); }   // 新的一趟：清空隨手拍
  } catch (e) {
    if (typeof toast === "function") toast("記錄啟動失敗，請再試一次");
    setNavUp(false);
    syncRecButtons("idle");   // 啟動失敗 → 按鈕退回可重按「開始」，不要卡在半殘狀態
    return;
  }
  syncRecButtons(Recorder.getState());   // 立即切換按鈕（onUpdate 的 tick 也會再校正一次，雙保險）
}
// ── 口袋模式：記錄中鎖定畫面，避免放口袋誤觸暫停/結束；長按解鎖鈕才解鎖 ──
let _recLocked = false, _lockTimer = null, _lockSuppressClick = false;
function setRecLock(on) {
  _recLocked = on;
  const view = document.getElementById("view-record");
  if (view) view.classList.toggle("rec-locked", on);
  const btn = $("#btnLock");
  if (btn) {
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    const lbl = btn.querySelector(".lock-label");
    if (lbl) lbl.textContent = on ? ttT("長按解鎖") : ttT("鎖定畫面");
  }
}
(function () {
  const btn = document.getElementById("btnLock");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (_lockSuppressClick) { _lockSuppressClick = false; return; }
    if (!_recLocked) { setRecLock(true); toast(ttT("長按解鎖")); if (navigator.vibrate) navigator.vibrate(20); }
  });
  btn.addEventListener("pointerdown", () => {
    if (!_recLocked) return;
    _lockTimer = setTimeout(() => { setRecLock(false); _lockSuppressClick = true; if (navigator.vibrate) navigator.vibrate(30); }, 700);
  });
  const clr = () => clearTimeout(_lockTimer);
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => btn.addEventListener(ev, clr));
})();
$("#btnStart").addEventListener("click", () => {
  const wasPaused = Recorder.getState() === "paused";
  // 小隊同行中：只有隊長能開始，且需全員（含隊長）已按「準備」；隊長開始時廣播全隊一起開始
  if (typeof TeamLive !== "undefined" && TeamLive.isOn() && Recorder.getState() === "idle") {
    if (!TeamLive.isLeader()) { toast("小隊記錄由隊長開始：請先按「✋ 準備」，等隊長按開始"); return; }
    if (!TeamLive.allReady()) {
      const nr = TeamLive.notReadyNames();
      toast(nr.length ? `還沒準備：${nr.join("、")}（全員按「準備」後才能一起開始）` : "還有隊員未準備，全員按「準備」後才能一起開始");
      return;
    }
    TeamLive.sendStart({ sim: sim() });   // 把隊長的模擬模式帶給全隊
  }
  startRecordingUI();
  // 隊長按「繼續」→ 全隊一起繼續
  if (wasPaused && typeof TeamLive !== "undefined" && TeamLive.isOn() && TeamLive.isLeader() && TeamLive.sendResume) TeamLive.sendResume();
});
// 小隊記錄的開始鈕：隊員不能自己開始（只能隊長）→ 閒置時隱藏開始鈕，改用準備列的「準備」
window.syncTeamRecBtns = function syncTeamRecBtns() {
  const on = typeof TeamLive !== "undefined" && TeamLive.isOn && TeamLive.isOn();
  const isMember = on && !TeamLive.isLeader();
  if (Recorder.getState() === "idle") $("#btnStart").hidden = isMember;
};
// 收到隊長的開始廣播 → 已按準備的隊員自動一起開始記錄
function _teamOnStartCb(simFlag) {
  if (Recorder.getState() === "running") return;
  const tab = document.querySelector('.tab[data-view="record"]'); if (tab) tab.click();
  // 跟隨隊長的模擬模式：隊長模擬全隊模擬（在家測試才動得了）、隊長真走全隊真走
  // 跟隨隊長的模擬模式。⚠️ 直接寫 .checked 不會觸發 change 事件 → 會繞過模擬模式的付費牆
  // （而且勾選會留著，之後單獨記錄仍是模擬）。非會員一律不跟隨模擬，改用真實記錄。
  const simOk = !!simFlag && _pro();
  const st = $("#simToggle");
  if (st && st.checked !== simOk) { st.checked = simOk; }
  if (simFlag && !simOk) toast("隊長使用模擬模式（PRO），你將以真實記錄同行");
  toast(simOk ? "👑 隊長開始了（模擬模式）！小隊一起記錄" : "👑 隊長開始了！小隊一起記錄");
  if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
  startRecordingUI();
}
$("#btnPause").addEventListener("click", () => {
  Recorder.pause();
  syncRecButtons(Recorder.getState());
  // 隊長按暫停 → 全隊一起暫停
  if (typeof TeamLive !== "undefined" && TeamLive.isOn() && TeamLive.isLeader() && TeamLive.sendPause) TeamLive.sendPause();
});
// 隊員收到隊長「暫停 / 繼續」訊號 → 各自暫停 / 繼續自己的記錄（隊員本就沒有控制鈕）
function _teamOnPauseCb() {
  if (Recorder.getState() !== "running") return;
  Recorder.pause();
  syncRecButtons(Recorder.getState());   // 隊員無控制鈕，等隊長繼續
  setRecStatus(`<span class="autopause">${ttT("隊長已暫停，等隊長繼續")}</span>`, true);   // 明確狀態，不只 toast
  toast("👑 隊長暫停了記錄");
  if (navigator.vibrate) navigator.vibrate(60);
}
function _teamOnResumeCb() {
  if (Recorder.getState() !== "paused") return;
  Recorder.resume(sim());
  syncRecButtons(Recorder.getState());
  toast("👑 隊長繼續記錄");
  if (navigator.vibrate) navigator.vibrate(60);
}
// 檔案匯出的存檔：iOS App 的 WKWebView 不認 <a download>（點了沒下載）→ 匯出的 GPX／備份檔／
// KML／CSV／離線地圖包在 App 裡會靜默失敗。先試 Web Share（原生開系統分享單，可存到「檔案」App
// 或傳給別人），不支援才退回傳統下載（網頁版行為完全不變）。圖片分享早就是這個 pattern。
window.saveBlob = async function saveBlob(blob, filename, title) {
  try {
    const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: title || filename });
      return true;
    }
  } catch (e) { if (e && e.name === "AbortError") return true; }   // 使用者在分享單按取消→別再彈一次下載
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return true;
};
// 收尾步驟安全執行：吞例外、記進 tt_errors（診斷／自動上傳 client_errors），回成功與否。
// 記錄結束的收尾是一條 async 鏈（校正→存檔→完成判定→結算頁→成就/寵物/備份）。任一步 throw
// 不該連坐——尤其不能因某步失敗就開不了結算頁、或整趟沒存到。使用者實測回報「有時候不能
// 正常結束、進不了結算」「自動儲存沒全部存到」，根因就是這條鏈原本無兜底、且失敗靜默。
async function safeRun(label, fn) {
  try { await fn(); return true; }
  catch (e) {
    try { const a = JSON.parse(localStorage.getItem("tt_errors") || "[]"); a.unshift({ t: new Date().toISOString(), m: ("finishRecording[" + label + "] " + ((e && e.message) || e)).slice(0, 300) }); localStorage.setItem("tt_errors", JSON.stringify(a.slice(0, 20))); } catch (_) { }
    if (typeof console !== "undefined") console.warn("finishRecording step failed:", label, e);
    return false;
  }
}
async function finishRecording(autoVehicle) {
  const rec = Recorder.stop();
  document.body.classList.remove("rec-running");   // A6：結束→寵物停止走路
  setNavUp(false); _navUserOff = false;   // 結束記錄→退出導航視角、下趟恢復預設導航
  recPreloaded = false; lastKmMilestone = 0; _berryLastKm = null;   // 下次記錄重新預載/里程碑/果實錨點
  syncRecButtons("idle"); setRecLock(false);   // 結束記錄→解除口袋鎖定
  if (rec) hikePhotosRecId = rec.id;   // 隨手拍歸屬這趟，結算頁才顯示
  safeRun("clear-markers", () => { if (recMarker) { recMap.removeLayer(recMarker); recMarker = null; } if (petMarker) { recMap.removeLayer(petMarker); petMarker = null; } if (recLine) recLine.setLatLngs([]); });
  if (autoVehicle) toast("速度超過 20 km/h，看起來是上車了，先幫你結束記錄");
  if (rec) {
    rec.trailName = Recorder._trailName || "自由路線";
    const tid = selectedTrailId || Recorder._trailId;   // 閃退復原的那趟，步道 id 從記錄器帶回來
    if (tid) rec.trailId = tid;   // 連回步道，供社群貼文點擊開啟
    // 地形海拔校正(DEM)：自動內建，用準確的水平軌跡查真實地面高度重算爬升/下降（GPS 高度太雜）
    // 模擬也校正：沿真實步道座標查地形，原路折返自然會有對應的下降（不再只計爬升）
    // 不再要求 navigator.onLine：高程圖磚可能已在快取（記錄中預載/看過地圖）→ 離線也校正得出來，
    // 真的拿不到資料時 Elevation.correct 會回 null，維持 GPS 數字，不會壞。
    // 海拔校正（Elevation.correct 內部已 try/catch 回 null，這裡再包一層兜底；逾時 8 秒）
    await safeRun("elevation-correct", async () => {
      if (!rec.vehicle && rec.track && rec.track.length > 1 && typeof Elevation !== "undefined") {
        // 等校正時給個交代：山上訊號差時這裡可能要好幾秒，畫面沒反應會以為「按結束沒用」
        setRecStatus(ttT("正在整理這趟的海拔數字…"));
        const sb = $("#btnStart"); if (sb) sb.disabled = true;   // 上一趟還沒存好，先別讓人開新的一趟
        const corr = await Promise.race([Elevation.correct(rec.track), new Promise(r => setTimeout(() => r(null), 8000))]);   // 原 15 秒太久
        if (corr) { rec.ascent = corr.ascent; rec.descent = corr.descent; rec.altHigh = corr.altHigh; rec.altLow = corr.altLow; rec.altCorrected = true; }
      }
    });
    // #11 軌跡簡化：海拔校正後、存檔前用 Douglas-Peucker 抽掉冗餘點（4m 內），省儲存又保形狀
    safeRun("simplify-track", () => { if (rec.track && rec.track.length > 2 && typeof simplifyTrack === "function") rec.track = simplifyTrack(rec.track, 4); });
    // 存檔：最優先，先於任何週邊步驟；失敗不能靜默（讓使用者知道去確認，不是整趟消失）
    const saved = await safeRun("save-record", () => Store.addRecord(rec));
    if (!saved) toast(ttT("儲存失敗"));   // 極罕見（addRecord 有多層 fallback），但失敗不靜默；詳因記進 tt_errors
    // 完成判定放在結算前（結算頁可能顯示「已完成」狀態）
    await safeRun("mark-done", () => maybeMarkTrailDone(rec));   // 真實走過＋全程沒偏離步道超過 1km 才算完成
    safeRun("ach-unlock", () => { if (typeof achCheckUnlocks === "function") achCheckUnlocks(); });   // 跨門檻即時慶祝解鎖
    setRecStatus(autoVehicle ? ttT("看起來上車了，這趟先幫你收好") : ttT("準備好就按開始"));
    { const sb = $("#btnStart"); if (sb) sb.disabled = false; }
    // 結算頁：一定要開，絕不被下面任何「背景加分」步驟連坐（這是使用者最在意的：走完看得到結算）
    safeRun("open-summary", () => openTrackReview(rec, true));   // isNew=true → 可慶祝破紀錄
    // 以下都是背景加分，各自隔離：任一 throw 都不影響已存的紀錄與已開的結算頁
    if (isFootRec(rec)) {
      safeRun("affinity", () => bumpAffinity(8));
      safeRun("cloud-backup", () => autoCloudBackup());
      safeRun("sync-stats", () => syncMyStatsToCloud());
      safeRun("confetti", () => confetti());
      safeRun("review-ask", () => { if (typeof ReviewPrompt !== "undefined") ReviewPrompt.maybeAsk(rec); });   // 走完有意義的一趟＝請評分的好時機
      safeRun("reminder-refresh", () => { if (typeof Reminders !== "undefined") Reminders.refreshStreak(); });   // 今天走了→取消今晚的連續提醒、更新連續數
    }
    safeRun("pet-evolve", () => checkPetEvolve());
    safeRun("render-idle", () => renderRecIdle());
    safeRun("snap-clear", () => snapStoreClear());   // 照片已交給結算頁，閃退備份可以清了
  } else {
    toast(autoVehicle ? ttT("看起來是上車了，已停止。這段太短，就不存了") : ttT("走太短了，這趟就不存囉"));
    setRecStatus(ttT("準備好就按開始"));
  }
}
// 結束前確認一次：放口袋、手滑誤觸就整趟結束太傷（走了一小段以上才問，剛開始按錯的直接結束）
let _stopAsking = false;
$("#btnStop").addEventListener("click", async () => {
  if (_stopAsking) return;
  const snap = Recorder.snapshot();
  if (snap.distanceKm >= 0.05 && typeof ttConfirm === "function") {
    _stopAsking = true;
    const ok = await ttConfirm(`${ttT("結束這一趟？")}\n${snap.distanceKm.toFixed(2)} km・${fmtDur(snap.elapsedMs)}`, ttT("結束並存檔"), ttT("繼續走"));
    _stopAsking = false;
    if (!ok || Recorder.getState() === "idle") return;
  }
  // 小隊記錄：隊長按結束 → 廣播全隊一起進各自結算；隊員的結束鈕本就隱藏，保險再擋一次
  if (typeof TeamLive !== "undefined" && TeamLive.isOn() && Recorder.getState() !== "idle") {
    if (!TeamLive.isLeader()) { toast("小隊記錄由隊長結束"); return; }
    if (TeamLive.sendStop) TeamLive.sendStop();
  }
  finishRecording(false);
});
// 隊長按結束 → 隊員收到訊號各自進結算（與開始同款三路遞送）
function _teamOnStopCb() {
  if (Recorder.getState() === "idle") return;
  toast("👑 隊長結束了小隊記錄，一起看結算");
  if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
  finishRecording(false);
}
// TeamLive 屬延遲載入的社群模組，onStart/onStop 一定要等它載入後才註冊，
// 否則 app.js 頂層跑到這裡時 TeamLive 還不存在 → 回呼永遠掛不上 → 隊員收到開始/結束訊號也不會動（修：沒有同時開始）
window.wireTeamLive = function wireTeamLive() {
  if (typeof TeamLive === "undefined") return false;
  if (TeamLive.onStart) TeamLive.onStart(_teamOnStartCb);
  if (TeamLive.onStop) TeamLive.onStop(_teamOnStopCb);
  if (TeamLive.onPause) TeamLive.onPause(_teamOnPauseCb);
  if (TeamLive.onResume) TeamLive.onResume(_teamOnResumeCb);
  return true;
};
// 立刻試一次（多半失敗，因社群模組還沒載）；正式註冊由 index.html 的社群延遲載入完成後回呼，維持延遲載入不提早
window.wireTeamLive();
// 偵測到車輛速度(>20km/h)→記錄器自動斷掉→跑與按「結束」相同的收尾流程
Recorder.onAutoStop(() => finishRecording(true));


// ---------- 崩潰復原：載入時若有未結束的記錄，復原為暫停狀態 ----------
function restoreActiveRecording() {
  if (!Recorder.hasActive || !Recorder.hasActive()) return;
  const s = Recorder.restore();
  if (!s) return;
  recPreloaded = true; lastKmMilestone = Math.floor(s.distanceKm);
  // 步道也一起還原：偏離警告、完成判定、沿線地標才不會在復原後失效
  const t = Recorder._trailId && TRAILS.find(x => String(x.id) === String(Recorder._trailId));
  if (t) ensureGeo(t.region).then(() => selectTrailForRecord(t, { quiet: true })).catch(() => {});
  snapStoreLoad();   // 隨手拍的照片也從閃退備份拿回來
  syncRecButtons(Recorder.getState());
  setRecStatus(`${ttT("上次那趟還在")}，${s.distanceKm.toFixed(2)} km。${ttT("要繼續走嗎？")}`);
  toast(ttT("上次那趟還在，已幫你接回來"));
}

// ---------- 開機：有未結束的記錄就接回來 ----------
restoreActiveRecording();
