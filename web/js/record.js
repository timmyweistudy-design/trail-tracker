// 記錄頁：記錄中的畫面更新、開始/暫停/結束、行程結算頁、隨手拍、閃退復原（從 app.js 拆出來，2026-10-01）。
// 在 app.js、explore.js 之後載入：用到 app.js 的 $、ic、toast、recMap 等全域；GPS 與數字計算在 recorder.js。
// ---------- 記錄頁 ----------
// 步道詳情頁：顯示走過這條步道的山友公開貼文
// 「最近有人走過」：只聚合使用者自己設為公開的貼文，且少於 3 人不顯示任何數字（k-匿名，
// 否則「近 30 天 1 人走過」等於公開某個人的行蹤）。資料庫端也擋一次（schema-phase26）。
// 第三波起改成「步道人氣」卡（js/trail-crowd.js）：近 7／30 天人數、星期×時段熱度圖、平均耗時；兩支 RPC 任一不存在都安靜略過
async function loadTrailActivity(t) {
  try { if (typeof TrailCrowd !== "undefined") await TrailCrowd.load(t); } catch (e) { /* 沒有這個函式/離線 → 不顯示，不影響其他區塊 */ }
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
    box.innerHTML = `<div class="section-title">${ic("megaphone")}${ttT("山友走過這條")}（${posts.length}）</div><div class="feed-list">${posts.map(p => Feed.card(p, liked.has(p.id))).join("")}</div>`;
    Feed.bindCards(box);   // 以前只綁點卡片，按讚沒反應
  } catch (e) { box.innerHTML = ""; }
}
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
    if (_wpReached.has(wpKey(w))) continue;
    if (haversine({ lat, lon }, { lat: w.lat, lon: w.lon }) <= 40) { _wpReached.add(wpKey(w)); hit = true; if (typeof toast === "function") toast(ttT("抵達") + " " + w.name); }
  }
  if (hit && recWpLayer) drawWaypoints(recWpLayer, selectedTrailWps, _wpReached);
  // 行進方向：里程增加=正向、減少=反向（從哪一頭走都對）
  if (_wpPrevAlong != null && Math.abs(along - _wpPrevAlong) > 3) _wpDir = along > _wpPrevAlong ? 1 : -1;
  _wpPrevAlong = along;
  const ahead = selectedTrailWps
    .filter(w => !_wpReached.has(wpKey(w)) && (_wpDir > 0 ? w.distM > along - 20 : w.distM < along + 20))
    .sort((a, b) => _wpDir > 0 ? a.distM - b.distM : b.distM - a.distM)[0];
  if (!ahead) { hud.innerHTML = ""; return; }
  const rem = Math.abs(ahead.distM - along) / 1000;
  hud.innerHTML = wpIconSvg(ahead.type)
    + `<span class="h-txt">${ttT("下一個")}：<b>${(ahead.name || "").replace(/[<>&]/g, "")}</b></span>`
    + `<span class="h-rem">${rem < 0.08 ? ttT("即將抵達") : ttT("剩") + " " + rem.toFixed(1) + " km"}</span>`;
}
// 跟著步道走時：還剩多遠、照目前速度幾點走完、會不會天黑（離開路線 80 m 以上就不猜）
let _progStartAlong = null;
function updateProgress(s, last) {
  const box = _r("recProg"); if (!box) return;
  if (s.state === "idle") { box.hidden = true; _progStartAlong = null; return; }
  const line = _wpRefLine || ((selectedTrailGeo && selectedTrailGeo.length) ? selectedTrailGeo.reduce((a, b) => (b.length > a.length ? b : a), selectedTrailGeo[0]) : null);
  if (!line || line.length < 2 || !last || s.state !== "running") return;
  if (routeSegs() && distToRoute(last.lat, last.lon) > 80) { box.hidden = true; return; }
  let total = 0; for (let i = 1; i < line.length; i++) total += haversine({ lat: line[i - 1][0], lon: line[i - 1][1] }, { lat: line[i][0], lon: line[i][1] });
  const along = _distAlong([last.lat, last.lon], line);
  if (_progStartAlong == null) _progStartAlong = along;
  const dir = along >= _progStartAlong ? 1 : -1;   // 從哪一頭走都對：往里程大的走＝正向
  const remKm = Math.max(0, (dir > 0 ? total - along : along) / 1000);
  if (remKm < 0.05) { box.hidden = false; box.className = "rec-prog"; box.innerHTML = `${ic("flag")}<span>${ttT("快到終點了")}</span>`; return; }
  // 速度：走超過 0.3 km 用這趟的移動平均；不然先用步道估算的速度
  const kmh = (s.distanceKm > 0.3 && s.movingMs > 6e5) ? s.distanceKm / (s.movingMs / 3.6e6) : 3;
  const etaMs = Date.now() + remKm / Math.max(kmh, 1) * 3.6e6;
  const ss = typeof sunsetAt === "function" ? sunsetAt(last.lat, last.lon) : null;
  const hm = d => d.toLocaleTimeString(ttLocale(), { hour: "2-digit", minute: "2-digit", hour12: false });
  const late = ss && etaMs > ss.getTime() - 30 * 60000;
  box.hidden = false; box.className = "rec-prog" + (late ? " warn" : "");
  box.innerHTML = `${ic(late ? "alert" : "route")}<span>${ttT("剩 %1 km・預計 %2 走完").replace("%1", remKm.toFixed(1)).replace("%2", `<b>${hm(new Date(etaMs))}</b>`)}</span>`
    + (late ? `<small>${ttT("照這個速度天黑前走不完，考慮往回走或加快")}</small>` : "");
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
let _sunsetHM = null;   // 選步道時查到的今日日落（行前卡顯示用；記錄中的天黑倒數改由 outdoor.js 用位置離線算）
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
    const [, txt] = Weather.desc(code);
    const tmax = d.temperature_2m_max ? Math.round(d.temperature_2m_max[0]) : null;
    const tmin = d.temperature_2m_min ? Math.round(d.temperature_2m_min[0]) : null;
    const pop = d.precipitation_probability_max ? d.precipitation_probability_max[0] : null;
    const sunHM = (d.sunset && d.sunset[0]) ? d.sunset[0].slice(11, 16) : null;
    const wline = `${ttT(txt)}${tmin != null ? ` ${tmin}–${tmax}°` : ""}${pop != null ? `・${ttT("降雨")} ${pop}%` : ""}`;
    _sunsetHM = sunHM;
    el.innerHTML =
      `<div class="ph-row"><span class="ph-ic">${code == null ? ic("sun") : wxIcon(code)}</span><span>${wline}</span></div>` +   // 和詳情頁同一套天氣圖示
      (sunHM && sunsetWarn(sunHM) ? `<div class="ph-row"><span class="ph-ic">${ic("sunset")}</span><span>${ttT("今日日落")} ${sunHM}${sunsetWarn(sunHM)}</span></div>` : "") +   // 日落平常在頁首就有，快天黑才在這裡加強提醒
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
  // 還要「真的走過大部分路線」：以前只檢查沒偏離，10 km 的步道走 200 m 就折返也算完成
  if (routeCoverage(tr) < 0.6) return;
  if (!Store.trailLog(rec.trailId).done) {
    Store.setTrailLog(rec.trailId, { done: true });
    toast(`${ttT("完成了步道")}：${rec.trailName || ""}`);
    ttBuzz([100, 50, 100]);
  }
}
// 路線被走過的比例：沿路線每隔一段取一個點，看軌跡有沒有經過它附近（60 m 內）
function routeCoverage(track) {
  const segs = routeSegs(); if (!segs) return 0;
  const pts = [];
  for (const seg of segs) for (let i = 0; i < seg.length; i++) pts.push(seg[i]);
  const step = Math.max(1, Math.floor(pts.length / 200)), sample = pts.filter((_, i) => i % step === 0);
  const tstep = Math.max(1, Math.floor(track.length / 600)), tr = track.filter((_, i) => i % tstep === 0);
  if (!sample.length || !tr.length) return 0;
  let hit = 0;
  for (const p of sample) {
    for (const q of tr) { if (haversine({ lat: p[0], lon: p[1] }, q) <= 60) { hit++; break; } }
  }
  return hit / sample.length;
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
  const bk = (typeof Outdoor !== "undefined") ? Outdoor.backSegs() : null;   // 原路返回中：拿自己走來的路比對
  if (bk) return bk;
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
    ttBuzz([180, 90, 180, 90, 180], 3);   // 手機在口袋裡時，震動＋提示音才感受得到（iPhone 以前完全不會震）
  }
}
function hideOffRoute() {
  const b = $("#offRoute");
  if (b) b.hidden = true;
  _offSince = 0; _offAlerted = 0;
}
// 記錄頁「已選擇的步道」列：按 ✕ 可退回自由路線（開始記錄後就不給取消——中途換成自由路線
// 會讓偏離警告與完成判定的依據在半路消失，數字對不上）。
function showSelectedTrail(name, isRoute) {
  const el = $("#selTrail");
  if (!el) return;
  el.hidden = false;
  // 步道名已經在頁首大標題 → 這裡只說是哪種（官方步道／匯入路線），右邊一顆「改自由路線」
  el.innerHTML = `<span class="st-what">${ic(isRoute ? "route" : "pin")} <span>${ttT(isRoute ? "跟著匯入的路線走" : "照這條步道的路線記錄")}</span></span>
    <button class="st-x st-free" id="selTrailX" aria-label="${ttT("取消選擇，改為自由路線")}">${ic("x")}<span>${ttT("改自由路線")}</span></button>`;
  if (isRoute) { el.dataset.route = name; try { renderRecHead(Recorder.getState()); } catch (e) { /* */ } }
  const x = $("#selTrailX");
  if (x) x.addEventListener("click", () => clearSelectedTrail());
  setRecStatus(ttT("按「開始」記錄這條步道"));
}
function clearSelectedTrail(silent) {
  selectedTrailGeo = null; selectedTrailId = null;
  selectedTrailWps = []; if (recWpLayer) recWpLayer.clearLayers(); { const _h = $("#recWpHud"); if (_h) _h.innerHTML = ""; }
  Recorder._trailName = null; Recorder._trailId = null;
  if (routeRefLayer && recMap) { recMap.removeLayer(routeRefLayer); routeRefLayer = null; }
  if (guideLine && recMap) { recMap.removeLayer(guideLine); guideLine = null; }
  clearPreHike(); _sunsetHM = null;
  hideSelectedTrail();
  try { renderRecHead(Recorder.getState()); } catch (e) { /* */ }
  try { renderRecIdle(); } catch (e) { /* */ }
  if (silent === true) return;
  setRecStatus(ttT("沒選步道也行，按開始就記"));
  toast(ttT("已改為自由路線"));
}
function hideSelectedTrail() {
  const el = $("#selTrail");
  if (el) { el.hidden = true; el.innerHTML = ""; delete el.dataset.route; }
}
// 選一條步道來記錄（詳情頁「在此步道開始記錄」、待機頁的快捷卡、閃退復原都走這條）
function selectTrailForRecord(t, opts) {
  if (!t) return;
  selectedTrailGeo = geoOf(t);
  selectedTrailId = t.id;
  selectedTrailWps = t.waypoints || [];
  Recorder._trailName = t.name; Recorder._trailId = t.id;
  if (!(opts && opts.quiet)) { showSelectedTrail(t.name); renderPreHike(t); }
  try { renderRecHead(Recorder.getState()); } catch (e) { /* */ }
  setTimeout(() => { initRecMap(); drawSelectedRoute(); resetWpHud(); try { renderRecIdle(); } catch (e) { /* */ } }, 80);
}

function initRecMap() {
  if (!recMap) {
    recMap = L.map("recMap", { zoomControl: false }).setView(myLoc ? [myLoc.lat, myLoc.lon] : [23.7, 121], myLoc ? 15 : 7);
    addBaseWithToggle(recMap);   // 地形／衛星可切（以前記錄頁只有地形）
    addCompass(recMap, { nav: true }); addRecenter(recMap); addThreeD(recMap, open3DRecording); addFullscreen(recMap);   // 指北針兼導航切換：右上 5 顆 → 4 顆
    // 縮放鈕放左上、比例尺放左下：沒記錄時地圖只有 260 高，放右下會疊到右上那排的全螢幕鈕
    L.control.zoom({ position: "topleft", zoomInTitle: ttT("放大地圖"), zoomOutTitle: ttT("縮小地圖") }).addTo(recMap);   // 戴手套、單手也能縮放
    L.control.scale({ position: "bottomleft", imperial: false, maxWidth: 80 }).addTo(recMap);
    addFsHud(recMap);
    locateIdleMap();
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

// 待機時地圖移到你所在的位置（以前一律停在台北 101）。只在已經允許定位時才抓，不主動跳權限詢問
function locateIdleMap() {
  if (!navigator.geolocation || Recorder.getState() !== "idle" || selectedTrailId) return;
  const go = () => navigator.geolocation.getCurrentPosition(p => {
    myLoc = { lat: p.coords.latitude, lon: p.coords.longitude };
    if (recMap && Recorder.getState() === "idle" && !selectedTrailId && !guideLine) recMap.setView([myLoc.lat, myLoc.lon], 15);
  }, () => { }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
  try {
    if (navigator.permissions && navigator.permissions.query) navigator.permissions.query({ name: "geolocation" }).then(r => { if (r.state === "granted") go(); }).catch(() => { });
    else if (localStorage.getItem("tt_locperm_prompted") === "1") go();
  } catch (e) { /* */ }
}
// 全螢幕地圖上的小數字板（以前放大地圖就看不到里程和時間）
function addFsHud(map) {
  const d = document.createElement("div"); d.className = "fs-hud"; d.id = "fsHud";
  d.innerHTML = `<span><b id="fsDist">0.00</b> km</span><span>${ic("clock")}<b id="fsTime">00:00</b></span><span>↑<b id="fsAsc">0</b> m</span>`;
  map.getContainer().appendChild(d);
}
// 匯入 GPX 路線當參考線
$("#btnImportGpx").addEventListener("click", () => {
  if (!_proGate("gpx")) return;   // PRO：跟著路線走（匯入 GPX）
  $("#gpxFile").click();
});
$("#gpxFile").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const pts = GPX.parse(reader.result);
    if (!pts.length) { toast(ttT("這個檔案沒有可用的路徑")); return; }
    followRoute(pts.map(p => [p.lat, p.lon]), file.name.replace(/\.gpx$/i, ""));
  };
  reader.readAsText(file);
  e.target.value = "";
});

// 在記錄頁畫出橘色虛線參考路徑（GPX 匯入 / 跟著貼文路線走 共用）
function followRoute(latlngs, name) {
  if (!latlngs || latlngs.length < 2) { toast(ttT("這條路線沒有可用的軌跡")); return; }
  initRecMap();
  if (guideLine) recMap.removeLayer(guideLine);
  guideLine = L.polyline(latlngs, { color: "#e8893b", weight: 4, dashArray: "8 6", opacity: .9 }).addTo(recMap);
  recMap.fitBounds(guideLine.getBounds(), { padding: [20, 20] });
  setTimeout(() => recMap.invalidateSize(), 120);
  toast(ttT("路線載好了，地圖上的橘色虛線就是要走的路"));
  // 也給一個取消鈕（以前匯入後清不掉，偏離警告也一直拿它比對）
  if (Recorder.getState() === "idle") showSelectedTrail(name || ttT("匯入的路線"), true);
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
let _simDoneToasted = false, _kmStartT = 0, _restWarned = false, _petSigCache = null;
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
  updateProgress(s, last);
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
  setText(_r("fsDist"), s.distanceKm.toFixed(2)); setText(_r("fsTime"), fmtTime(s.elapsedMs)); setText(_r("fsAsc"), String(Math.round(ad.ascent || 0)));
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
      ttBuzz([90, 40, 90]);
      toast(picked === 1 ? ttT("撿到一顆果實！") : `${ttT("撿到果實")} +${picked}！`, { icon: typeof BERRY_SVG !== "undefined" ? BERRY_SVG : "" });   // 果實圖示跟著季節（以前是 🍓 emoji）
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
      ttBuzz([120, 60, 120]);
      toast(`${kmDone} ${ttT("公里完成")}・${ttT("這公里")} ${mins} ${ttT("分鐘")}`);
    }
  }
  // 天黑倒數＋原路返回（outdoor.js）：日落用目前位置離線算，依走來的時間推「最晚幾點往回走」
  // （以前只在選了步道、又有網路查到天氣時，離日落 90 分鐘提醒一次）
  if (typeof Outdoor !== "undefined") { try { Outdoor.onUpdate(s); } catch (e) { /* 安全提示失敗不影響記錄 */ } }
  if (typeof NativeLive !== "undefined") NativeLive.tick();
  checkBattery();   // 鎖定畫面／動態島：背景時計時器會被系統放慢，跟著定位更新一起送（內部有節流）
  // 休息很久：提醒一次
  if (s.state === "running" && s.resting && s.restMs > 15 * 60000 && !_restWarned) { _restWarned = true; toast(ttT("休息 15 分鐘了，要繼續走嗎？")); }
  if (s.state === "running" && !s.resting) _restWarned = false;
  if (s.simDone && !_simDoneToasted) { _simDoneToasted = true; toast(ttT("模擬走完了，按「結束」看結算")); ttBuzz([60, 40, 60]); }
  if (s.state === "idle") _simDoneToasted = false;
  // 地圖上的夥伴：休息／暫停時坐下，快走（>6.5 km/h）時小跑步
  // window.__recPet＝測試面板強制（"fast"／"rest"）：模擬記錄沒有真實速度、也不會休息，不強制就看不到
  const _rp = window.__recPet;
  document.body.classList.toggle("rec-resting", _rp ? _rp === "rest" : s.state === "paused" || (s.state === "running" && !!s.resting));
  document.body.classList.toggle("rec-fast", _rp ? _rp === "fast" : s.state === "running" && !s.resting && (s.instKmh || 0) > 6.5);
  // 爬坡會喘（2026-10-09 修正案 R7-3 原17）：最近 5 分鐘爬升超過 60m，地圖上的夥伴邊走邊喘——只代表遊戲角色，不代表你的身體狀況
  document.body.classList.toggle("rec-climb", _rp ? _rp === "climb" : s.state === "running" && !s.resting && recentClimb(s.track) > 60);
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
    // 夥伴的階段／心情／帽子：10 秒算一次就好（以前每個定位點都重算，要解析整份紀錄）
    if (!_petSigCache || Date.now() - _petSigCache.at > 10000) _petSigCache = { at: Date.now(), stage: petStageIndex(totalKm()), mood: (typeof petMood === "function" ? petMood().k : "content"), hat: (typeof petHat === "function" ? petHat() : "none"), acc: (typeof petAcc === "function" ? petAcc() : "none") };
    const _pStage = _petSigCache.stage, _pMood = _petSigCache.mood, _pHat = _petSigCache.hat, _pAcc = _petSigCache.acc;
    const _pSig = _pStage + "|" + _pMood + "|" + _pHat + "|" + _pAcc;
    const _petFace = () => `<span class="pm-face pet-m-${_pMood}">${typeof PET_ART !== "undefined" ? PET_ART.own(() => PET_ART.svg(_pStage, "", _pHat, undefined, _pAcc)) : petEmojiNow()}</span>`;
    if (meAv) {
      if (!recMarker || !recMarker._av || recMarker._sig !== _pSig) {
        if (recMarker) recMap.removeLayer(recMarker);
        const mePro = (isPro()) ? " pro" : "";
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

// 低電量提醒：記錄中每 5 分鐘看一次電量；≤30%、沒在充電、還沒開省電 → 每趟只問一次要不要開省電。
// 量得到耗電速度（兩次相隔 ≥15 分鐘）就順便說「照這個速度大約還能撐多久」。
let _batt = { last: 0, asked: false, samples: [] };
async function checkBattery() {
  if (Date.now() - _batt.last < 5 * 60000 || Recorder.getState() !== "recording" || typeof NativeLive === "undefined") return;
  _batt.last = Date.now();
  const b = await NativeLive.battery(); if (!b) return;
  _batt.samples.push({ t: Date.now(), l: b.level }); if (_batt.samples.length > 12) _batt.samples.shift();
  if (_batt.asked || b.charging || b.level > 0.3 || $("#lowPowerToggle").checked) return;
  _batt.asked = true;
  const a = _batt.samples[0], dt = (Date.now() - a.t) / 3.6e6, rate = dt >= 0.25 ? (a.l - b.level) / dt : 0;
  const left = rate > 0.01 ? b.level / rate : 0;
  const msg = ttT("電量剩 %d%，要開省電模式嗎？定位會省電一點，軌跡會粗一點。").replace("%d", Math.round(b.level * 100))
    + (left ? `\n${ttT("照現在的耗電速度，大約還能撐 %s。").replace("%s", fmtDur(Math.round(left * 4) / 4 * 3.6e6))}` : "");
  if (await ttConfirm(msg, ttT("開省電模式"), ttT("先不用"))) { const tg = $("#lowPowerToggle"); tg.checked = true; tg.dispatchEvent(new Event("change")); }
}

// 走到一半看附近步道：用「離路線多近」而不是「離步道中心多遠」——中心點可能在好幾公里外，路線卻就在腳下。
// 先用中心點篩 15 km 內的候選、載入它們的路線，再量你到每條路線最近一點的距離，2 km 內的列出來；點了就改成照那條走
// （偏離提醒、剩餘里程、路線圖都跟著換；已經記下的軌跡不動）。
async function nearRouteTrails(pos) {
  const cand = TRAILS.filter(t => t.lat && t.lon && !(t.length_km != null && t.length_km < 0.5) && !_vagueName.test(t.name || "")
    && haversine(pos, { lat: t.lat, lon: t.lon }) < 15000);
  await Promise.all([...new Set(cand.map(t => t.region).filter(Boolean))].map(r => ensureGeo(r).catch(() => { })));
  const out = [];
  for (const t of cand) {
    let best = Infinity;
    for (const seg of geoOf(t) || []) for (let i = 0; i < seg.length; i += 2) { const d = haversine(pos, { lat: seg[i][0], lon: seg[i][1] }); if (d < best) best = d; }
    if (best <= 2000) out.push({ t, d: best });
  }
  return out.sort((a, b) => a.d - b.d).slice(0, 8);
}
async function openNearRoutes() {
  if (document.querySelector('[data-ov="nearroute"]')) return;
  const last = recSnap && recSnap.track && recSnap.track.length ? recSnap.track[recSnap.track.length - 1] : null;
  const pos = last || (typeof myLoc !== "undefined" && myLoc);
  if (!pos) { toast(ttT("還沒定位到你的位置")); return; }
  const ov = document.createElement("div"); ov.className = "pet-modal"; ov.dataset.ov = "nearroute";
  ov.innerHTML = `<div class="pet-modal-card nr-card"><button class="sheet-close" id="nrX" aria-label="${ttT("關閉")}">${ic("x")}</button>
    <h2>${ic("compass")} ${ttT("附近步道")}</h2><p class="dex-intro">${ttT("離你 2 公里內有經過的步道。點一條就改成照它走，已經記下的軌跡不會變。")}</p>
    <div class="nr-list" id="nrList"><div class="feed-loading"><span class="spin"></span></div></div></div>`;
  document.body.appendChild(ov);
  let _a11y = null;
  const close = () => { if (_a11y) _a11y(); ov.remove(); };
  if (typeof ttModalA11y === "function") _a11y = ttModalA11y(ov, close, { focus: "#nrX" });
  ov.querySelector("#nrX").onclick = close;
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  const list = await nearRouteTrails(pos);
  const box = ov.querySelector("#nrList"); if (!box) return;
  if (!list.length) { box.innerHTML = `<div class="ana-empty-note">${ttT("附近 2 公里內沒有收錄的步道")}</div>`; return; }
  box.innerHTML = list.map(({ t, d }) => `<button class="nr-item${String(t.id) === String(selectedTrailId) ? " on" : ""}" data-id="${escHtml(String(t.id))}">
      <span class="nb-bar d${t.difficulty || 0}"></span>
      <span class="nr-main"><b translate="no">${escHtml(ttT(t.name))}</b><small>${diffEst(t) ? "≈" : ""}${t.difficulty === 6 ? ttT("雪季限定") : ttT(diffLabel(t))}${t.length_km != null ? ` · ${fmtKm(t.length_km)} km` : ""}</small></span>
      <span class="nr-d">${d < 50 ? ttT("你在路上") : `${d < 1000 ? Math.round(d / 10) * 10 + " m" : (d / 1000).toFixed(1) + " km"}`}</span></button>`).join("");
  box.querySelectorAll(".nr-item").forEach(b => b.onclick = () => {
    const t = TRAILS.find(x => String(x.id) === b.dataset.id); if (!t) return;
    selectTrailForRecord(t, { quiet: true }); close();
    toast(ttT("改成照「%s」走").replace("%s", ttT(t.name)));
  });
}
{ const nb = $("#recNear"); if (nb) nb.addEventListener("click", openNearRoutes); }

// 省電模式 + 分享即時位置 + 公里里程碑
let lastKmMilestone = 0, _berryLastKm = null;
$("#lowPowerToggle").addEventListener("change", e => {
  Recorder.setLowPower(e.target.checked);
  toast(ttT(e.target.checked ? "省電模式開了：定位比較省電，但軌跡會粗一點" : "省電模式關了"));
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
    toast(ttT(e.target.checked ? "記錄中螢幕會一直亮著" : "記錄中螢幕會照常熄滅"));
  });
})();
$("#simToggle").addEventListener("change", e => {
  if (e.target.checked && !_proGate("sim")) {   // PRO 限定 → 開升級面板並復原
    e.target.checked = false;
    return;
  }
  toast(ttT(e.target.checked ? "模擬模式：不用 GPS，沿步道路線快速走一遍" : "模擬模式關了"));
});
// 取自己的社群頭像供記錄地圖的「我」標記用（未登入則維持 null＝橘點）
let _meAvFetched = false;
async function ensureMeAvatar() {
  if (_meAvFetched || typeof Supa === "undefined" || !Supa.ready()) return;
  _meAvFetched = true;
  try {
    const c = Supa.client(); const { data: u } = await Supa.meUser();
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
  if (!document.body.dataset.view || document.body.dataset.view === "record") { const b = $("#btnSnap"); if (b) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); } }
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

// 開始記錄時，背景預載當前位置周邊圖磚（保險，避免途中失去訊號）。
// 這也是離線地圖：非會員縮小範圍（±1km、縮放 14–15）並計入 MB 額度；額度不足只跳過預載、不影響記錄。Premium 完整預載（±2km、14–16）。
let recPreloaded = false;
// #1 記錄時預載 3D 地形圖磚（衛星＋terrarium 高程），讓 3D 開起來即時又清晰。3D 屬 PRO → 只對會員預載
const _SAT_URL = (z, x, y) => `${ESRI}/World_Imagery/MapServer/tile/${z}/${y}/${x}${AGTOK}`;
const _TERR_URL = (z, x, y) => `https://elevation-tiles-prod.s3.amazonaws.com/terrarium/${z}/${x}/${y}.png`;
let _pre3dAt = 0;
function preload3D(lat, lon) {
  if (!(isPro())) return;   // 3D 是 PRO 功能
  if (typeof Offline === "undefined" || !navigator.onLine) return;
  const now = Date.now(); if (now - _pre3dAt < 60000) return; _pre3dAt = now;   // 每分鐘最多一次
  const m = 0.02, bbox = { n: lat + m, s: lat - m, e: lon + m, w: lon - m };
  const tiles = [...Offline.tileListUrl(bbox, 14, 16, _SAT_URL), ...Offline.tileListUrl(bbox, 12, 15, _TERR_URL)];
  Offline.download(tiles, () => {}, { temp: true }).catch(() => {});   // 靜默預載進瀏覽快取（有上限、會汰舊），3D 開啟時由 SW 快取直接取用
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
  return Offline.download(tiles, (done, total) => { if (onProgress) onProgress(Math.round(done / total * 100)); }, { temp: true }).catch(() => {});
}
async function preloadAround(lat, lon) {
  const pro = isPro();
  const m = pro ? 0.018 : 0.009;
  const bbox = { n: lat + m, s: lat - m, e: lon + m, w: lon - m };
  const tiles = Offline.tileList(bbox, 14, 15);   // 只存開放版到 z15（授權）；PRO 的好處是範圍大一倍、不扣額度
  if (!pro && !offlineAllow(tiles, true)) return;   // 額度不夠就安靜略過（記錄照常）
  try {
    const r = await Offline.download(tiles, () => {}, { temp: true });   // 存進瀏覽快取，不佔「已下載」區
    if (!pro) addOfflineMb(r.mb);
  } catch { /* 靜默：開始記錄時不再跳一堆提示蓋住數字 */ }
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
// 頁首：待機寫「準備出發」（選了步道就寫步道名）＋今天日期；記錄中／暫停寫步道名＋狀態。
// 右邊小膠囊是今天的日落（用目前位置離線算，沒有位置就用台灣中部）。有變才寫，記錄中每秒呼叫也不重畫。
let _recHeadSig = "";
function renderRecHead(state) {
  const tEl = _r("recTitle"), eEl = _r("recEyebrow"), pEl = _r("recSunPill"); if (!tEl) return;
  const selEl = _r("selTrail"), route = selEl && !selEl.hidden && selEl.dataset.route;
  const name = (state === "idle" ? (selectedTrailId ? Recorder._trailName : (route || null)) : (Recorder._trailName || route || "自由路線"));
  const title = name ? ttT(name) : ttT("準備出發");
  let eyebrow;
  if (state === "running") eyebrow = `<i class="rh-dot"></i>${ttT("記錄中")}`;
  else if (state === "paused") eyebrow = `<i class="rh-dot paused"></i>${ttT("已暫停")}`;
  else eyebrow = escHtml(new Date().toLocaleDateString(ttLocale(), { month: "long", day: "numeric", weekday: "short" }));
  const last = recSnap && recSnap.track && recSnap.track.length ? recSnap.track[recSnap.track.length - 1] : null;
  const pos = last || (typeof myLoc !== "undefined" && myLoc) || { lat: 23.97, lon: 120.97 };
  const ss = typeof sunsetAt === "function" ? sunsetAt(pos.lat, pos.lon, new Date()) : null;
  const dark = ss && Date.now() > ss.getTime();
  const pill = ss ? `${ic(dark ? "moon" : "sunset")}<span>${dark ? ttT("天黑了") : `${ttT("日落")} <b>${hhmm(ss)}</b>`}</span>` : "";
  const sig = [state, title, eyebrow, pill].join("|");
  if (sig === _recHeadSig) return;
  _recHeadSig = sig;
  tEl.textContent = title; eEl.innerHTML = eyebrow;
  { const nb = _r("recNear"); if (nb) nb.hidden = state === "idle"; }   // 記錄中才有：走到一半想換條路／發現自己其實在某條步道上
  if (pEl) { pEl.hidden = !pill; pEl.innerHTML = pill; pEl.classList.toggle("dark", !!dark); }
}
function syncRecButtons(state) {
  try { renderRecHead(state); } catch (e) { /* 頁首失敗不影響按鈕 */ }
  const teamMember = typeof TeamLive !== "undefined" && TeamLive.isOn() && !TeamLive.isLeader();
  const start = _r("btnStart"), pause = _r("btnPause"), stop = _r("btnStop"), snap = _r("btnSnap"), lock = _r("btnLock");
  if (!start) return;
  const v = _r("view-record"); if (v && v.dataset.state !== state) v.dataset.state = state;
  start.hidden = state === "running" || teamMember;
  pause.hidden = state !== "running" || teamMember;
  stop.hidden = state === "idle";   // 隊員也有結束鈕：隊長沒訊號／沒電時才不會被卡住
  if (snap) snap.hidden = state === "idle" || sim();   // 暫停休息時也能拍（休息正是最常拍照的時候）
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
      }
    }
    // chainSegments 已是「走完所有岔路、主線不重複」的最小覆蓋走法（樹狀路網最後一條分支不折返），
    // 不再截斷——截斷會把岔路砍掉（就是「岔路走不完」的原因）
    const route = selectedTrailGeo && selectedTrailGeo.length ? chainSegments(selectedTrailGeo) : null;
    Recorder.setSimRoute(route);
  }
  try {
    if (Recorder.getState() === "paused") Recorder.resume(sim());
    else { hikePhotos = []; $("#snapCount").textContent = ""; snapStoreClear(); _batt = { last: 0, asked: false, samples: [] }; Recorder.start(sim()); if (!sim() && typeof Guardian !== "undefined") Guardian.onStart(); }   // 新的一趟：清空隨手拍；設好的留守開始生效（模擬不算）
  } catch (e) {
    if (typeof toast === "function") toast(ttT("記錄沒有開始，再按一次試試"));
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
    if (!_recLocked) { setRecLock(true); ttBuzz(20); }   // 按鈕字已變「長按解鎖」，不再跳提示蓋住里程
  });
  btn.addEventListener("pointerdown", () => {
    if (!_recLocked) return;
    _lockTimer = setTimeout(() => { setRecLock(false); _lockSuppressClick = true; ttBuzz(30); }, 700);
  });
  const clr = () => clearTimeout(_lockTimer);
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => btn.addEventListener(ev, clr));
})();
$("#btnStart").addEventListener("click", () => {
  ttAudioUnlock();   // iOS：音訊要在使用者手勢裡先啟動，偏離/天黑提醒才響得出來
  const wasPaused = Recorder.getState() === "paused";
  // 小隊同行中：只有隊長能開始，且需全員（含隊長）已按「準備」；隊長開始時廣播全隊一起開始
  if (typeof TeamLive !== "undefined" && TeamLive.isOn() && Recorder.getState() === "idle") {
    if (!TeamLive.isLeader()) { toast(ttT("小隊記錄由隊長開始：先按上面的「準備」，等隊長按開始")); return; }
    if (!TeamLive.allReady()) {
      const nr = TeamLive.notReadyNames();
      toast(`${ttT("還沒準備")}：${nr.join("、")}`);
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
  // 跟隨隊長的模擬模式（隊長模擬全隊模擬、隊長真走全隊真走）。⚠️ 直接寫 .checked 不會觸發 change 事件 → 會繞過模擬模式的付費牆
  // （而且勾選會留著，之後單獨記錄仍是模擬）。非會員一律不跟隨模擬，改用真實記錄。
  const simOk = !!simFlag && _pro();
  const st = $("#simToggle");
  if (st && st.checked !== simOk) { st.checked = simOk; }
  if (simFlag && !simOk) toast(ttT("隊長用模擬模式，你這邊照常用 GPS 記錄"));
  else toast(ttT(simOk ? "隊長開始了（模擬），一起出發" : "隊長開始了，一起出發"));
  ttBuzz([80, 40, 80], 1);
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
  toast(ttT("隊長暫停了"));
  ttBuzz(60);
}
function _teamOnResumeCb() {
  if (Recorder.getState() !== "paused") return;
  Recorder.resume(sim());
  syncRecButtons(Recorder.getState());
  toast(ttT("隊長繼續了"));
  ttBuzz(60);
}
// 檔案匯出的存檔：iOS App 的 WKWebView 不認 <a download>（點了沒下載）→ 匯出的 GPX／備份檔／
// KML／CSV／離線地圖包在 App 裡會靜默失敗。先試 Web Share（原生開系統分享單，可存到「檔案」App
// 或傳給別人），不支援才退回傳統下載（網頁版行為完全不變）。圖片分享早就是這個 pattern。
// 回傳值：shared＝叫出系統分享單（含按取消）、preview＝App 內長按存圖、saved＝瀏覽器下載
window.saveBlob = async function saveBlob(blob, filename, title) {
  try {
    const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: title || filename });
      return "shared";
    }
  } catch (e) { if (e && e.name === "AbortError") return "shared"; }   // 使用者在分享單按取消→別再彈一次下載
  // iOS App（WKWebView）裡 <a download> 完全沒反應：圖片改開全螢幕預覽，長按就能存到相簿
  const C = window.Capacitor;
  if (C && C.isNativePlatform && C.isNativePlatform() && /^image\//.test(blob.type || "")) { ttImagePreview(blob); return "preview"; }
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return "saved";
};
window.ttImagePreview = function ttImagePreview(blob) {
  if (document.querySelector('[data-ov="imgprev"]')) return;
  const url = URL.createObjectURL(blob);
  const ov = document.createElement("div"); ov.className = "img-prev"; ov.dataset.ov = "imgprev";
  ov.innerHTML = `<button class="sheet-close" aria-label="${ttT("關閉")}">✕</button><img src="${url}" alt=""><div class="img-prev-hint">${ttT("長按圖片就能存到相簿")}</div>`;
  document.body.appendChild(ov);
  let _a11y = null;
  const close = () => { if (_a11y) _a11y(); ov.remove(); URL.revokeObjectURL(url); };
  if (typeof ttModalA11y === "function") _a11y = ttModalA11y(ov, close, { focus: ".sheet-close" });
  ov.querySelector(".sheet-close").addEventListener("click", close);
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
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
  document.body.classList.remove("rec-running", "rec-resting", "rec-fast");   // A6：結束→寵物停止走路
  setNavUp(false); _navUserOff = false;   // 結束記錄→退出導航視角、下趟恢復預設導航
  recPreloaded = false; lastKmMilestone = 0; _berryLastKm = null;   // 下次記錄重新預載/里程碑/果實錨點
  syncRecButtons("idle"); setRecLock(false);   // 結束記錄→解除口袋鎖定
  safeRun("guardian", () => { if (typeof Guardian !== "undefined") return Guardian.onFinish(); });   // 按結束＝平安下山，留守結束
  if (rec) hikePhotosRecId = rec.id;   // 隨手拍歸屬這趟，結算頁才顯示
  safeRun("clear-markers", () => { if (recMarker) { recMap.removeLayer(recMarker); recMarker = null; } if (petMarker) { recMap.removeLayer(petMarker); petMarker = null; } if (recLine) recLine.setLatLngs([]); });
  if (autoVehicle) toast(ttT("速度一直超過時速 20 公里，看起來上車了，先幫你結束記錄"));
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
        if (corr) {
          rec.ascent = corr.ascent; rec.descent = corr.descent; rec.altHigh = corr.altHigh; rec.altLow = corr.altLow; rec.altCorrected = true;
          if (rec.movingMs && Recorder.kcalFor) rec.kcal = Recorder.kcalFor(rec.distanceKm || 0, rec.movingMs, rec.ascent, rec.descent);   // 爬升變了 → 卡路里跟著重算
        }
      }
    });
    // #11 軌跡簡化：海拔校正後、存檔前用 Douglas-Peucker 抽掉冗餘點（4m 內），省儲存又保形狀
    safeRun("simplify-track", () => { if (rec.track && rec.track.length > 2 && typeof simplifyTrack === "function") rec.track = simplifyTrack(rec.track, 4); });
    // 存檔：最優先，先於任何週邊步驟；失敗不能靜默（讓使用者知道去確認，不是整趟消失）
    const saved = await safeRun("save-record", () => Store.addRecord(rec));
    if (!saved) toast(ttT("儲存失敗"));   // 極罕見（addRecord 有多層 fallback），但失敗不靜默；詳因記進 tt_errors
    // 完成判定放在結算前（結算頁可能顯示「已完成」狀態）
    await safeRun("mark-done", () => maybeMarkTrailDone(rec));
    safeRun("peaks", () => { if (typeof Peaks !== "undefined") Peaks.stampRecord(rec); });
    safeRun("crowd", () => { if (typeof TrailCrowd !== "undefined") TrailCrowd.contribute(rec); });   // 匿名送「步道＋出發時間」給步道人氣（設定可關）   // 走到百岳／小百岳山頂 → 蓋章   // 真實走過＋全程沒偏離步道超過 1km 才算完成
    safeRun("ach-unlock", () => { if (typeof achCheckUnlocks === "function") achCheckUnlocks(); });   // 跨門檻即時慶祝解鎖
    safeRun("clear-trail", () => clearSelectedTrail(true));   // 這趟走完就放開步道：以前選擇默默留著，下一趟會自動掛在同一條步道上
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
      safeRun("reminder-refresh", () => { if (typeof Reminders !== "undefined") { Reminders.refreshStreak(); if (Reminders.refreshPet) Reminders.refreshPet(); } });   // 今天走了→取消今晚的連續提醒、更新連續數
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
  // 小隊記錄：隊長按結束 → 廣播全隊一起進各自結算；隊員按結束＝自己先收（隊長失聯時不會被卡住），不影響其他人
  if (typeof TeamLive !== "undefined" && TeamLive.isOn() && Recorder.getState() !== "idle") {
    if (!TeamLive.isLeader()) {
      if (!(await ttConfirm(ttT("隊長還沒結束。你要自己先結束這趟嗎？其他隊員會繼續記錄。"), ttT("我先結束"), ttT("再等等")))) return;
    } else if (TeamLive.sendStop) TeamLive.sendStop();
  }
  finishRecording(false);
});
// 隊長按結束 → 隊員收到訊號各自進結算（與開始同款三路遞送）
function _teamOnStopCb() {
  if (Recorder.getState() === "idle") return;
  toast(ttT("隊長結束了，一起看結算"));
  ttBuzz([80, 40, 80]);
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
// 頁首第一次畫＋每分鐘更新一次（跨午夜換日期、天黑後日落改「天黑了」）；切到記錄頁時也重畫
setTimeout(() => { try { renderRecHead(Recorder.getState()); } catch (e) { /* */ } }, 0);
setInterval(() => { if (document.body.dataset.view === "record") { _recHeadSig = ""; try { renderRecHead(Recorder.getState()); } catch (e) { /* */ } } }, 60000);
document.addEventListener("click", e => { if (e.target.closest('.tab[data-view="record"]')) setTimeout(() => { try { renderRecHead(Recorder.getState()); } catch (er) { /* */ } }, 50); });
// 最近 5 分鐘爬升了多少公尺（只算往上的；海拔有雜訊：每段 <1m 的不算）
function recentClimb(track) {
  if (!track || track.length < 2) return 0; const t1 = track[track.length - 1].t || 0; let up = 0;
  for (let i = track.length - 1; i > 0 && t1 - (track[i - 1].t || 0) <= 5 * 60000; i--) { const d = (track[i].alt || 0) - (track[i - 1].alt || 0); if (d >= 1) up += d; }
  return up;
}
