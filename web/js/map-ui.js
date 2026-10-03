// 地圖介面工具（從 app.js 拆出，2026-10）：3D 地形、地圖控制鈕（3D／導航／指北針／全螢幕／定位／底圖）、震動提示音、步道釘、路況橫幅。
// 一般 script（非模組），和 app.js 共用全域；載入順序緊接在 app.js 之後。
// ── 3D 地形（MapLibre GL）：延遲載入，只在使用者按「3D」時才載 ~800KB 引擎 ──
let _mlPromise = null, _map3d = null;
function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve();
  if (_mlPromise) return _mlPromise;
  _mlPromise = new Promise((res, rej) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "vendor/maplibre/maplibre-gl.css"; document.head.appendChild(css);
    const sc = document.createElement("script"); sc.src = "vendor/maplibre/maplibre-gl.js"; sc.onload = res; sc.onerror = rej; document.body.appendChild(sc);
  });
  return _mlPromise;
}
function close3D() {
  const ov = $("#map3d"); if (ov) ov.hidden = true;
  if (_flyRAF) { cancelAnimationFrame(_flyRAF); _flyRAF = null; }
  _stop3dLive();
  if (_map3d) { try { _map3d.remove(); } catch (e) { /* */ } _map3d = null; }   // 釋放 GPU/記憶體
}
let _flyRAF = null, _flyPath = null, _live3dTimer = null, _me3dMarker = null, _team3dMarkers = {}, _live3dInteractAt = 0;
function open3D(t) { if (t) _open3D(t.name, geoOf(t), { fly: false }); }              // 步道詳情：靜態探索
function open3DTrack(name, segsLL) { _open3D(name, segsLL, { fly: true }); }           // 結算頁回放：帶著走
// 記錄中：即時 3D——顯示自己(頭貼+寵物)、隊友、目前軌跡，跟著更新
function open3DRecording() {
  const s = (typeof recSnap !== "undefined") ? recSnap : null;
  const seg = (s && s.track && s.track.length > 1) ? trackSegments(s.track).map(g => g.map(p => [p.lat, p.lon]))
    : (s && s.track && s.track.length === 1) ? [[[s.track[0].lat, s.track[0].lon]]]
      : (typeof myLoc !== "undefined" && myLoc) ? [[[myLoc.lat, myLoc.lon]]] : null;
  if (seg) { _open3D(Recorder._trailName || ttT("記錄中"), seg, { live: true }); return; }
  if (typeof selectedTrailId !== "undefined" && selectedTrailId) { const t = TRAILS.find(x => x.id === selectedTrailId); if (t) return open3D(t); }
  toast(ttT("開始記錄後就能看 3D"));
}
// 3D 人物標記：頭貼＋寵物（MapLibre HTML Marker）
function person3dEl(avatar, pet, isMe) {
  const d = document.createElement("div");
  d.className = "tm3d team-marker" + (isMe ? " me-marker" : "");
  const petIdx = (pet && typeof PET_ART !== "undefined" && PET_ART.byEmoji) ? PET_ART.byEmoji(pet) : -1;   // 同步來的是 emoji → 反查成 SVG 角色
  const petHtml = pet ? `<span class="tm-pet">${petIdx >= 0 ? PET_ART.svg(petIdx) : pet}</span>` : "";
  d.innerHTML = `<div class="tm-av">${avatar ? `<img src="${avatar}" alt="">` : `<span class="tm-ph">${isMe ? (typeof ttT === "function" ? ttT("我") : "我") : "?"}</span>`}${petHtml}</div>`;
  return d;
}
function _stop3dLive() {
  if (_live3dTimer) { clearInterval(_live3dTimer); _live3dTimer = null; }
  if (_me3dMarker) { try { _me3dMarker.remove(); } catch (e) { /* */ } _me3dMarker = null; }
  for (const k in _team3dMarkers) { try { _team3dMarkers[k].remove(); } catch (e) { /* */ } } _team3dMarkers = {};
}
function _start3dLive() {
  const upd = () => {
    if (!_map3d || typeof maplibregl === "undefined") return;
    const s = (typeof recSnap !== "undefined") ? recSnap : null;
    const last = (s && s.track && s.track.length) ? s.track[s.track.length - 1] : (typeof myLoc !== "undefined" && myLoc ? myLoc : null);
    if (last && last.lat != null) {
      const ll = [last.lon, last.lat];
      if (!_me3dMarker) _me3dMarker = new maplibregl.Marker({ element: person3dEl(window.__meAvatar, (typeof petEmojiNow === "function" ? petEmojiNow() : ""), true), anchor: "bottom" }).setLngLat(ll).addTo(_map3d);
      else _me3dMarker.setLngLat(ll);
      const src = _map3d.getSource("route");
      if (src && s && s.track && s.track.length > 1) src.setData({ type: "Feature", geometry: { type: "MultiLineString", coordinates: trackSegments(s.track).map(g => g.map(p => [p.lon, p.lat])) } });
      // 停手 4 秒後平滑跟隨（只平移、不改縮放/俯角/方位→不閃）；使用者拖動期間不搶鏡頭
      if (Date.now() - _live3dInteractAt > 4000) { try { _map3d.panTo(ll, { duration: 1100, essential: true }); } catch (e) { /* */ } }
    }
    if (typeof TeamLive !== "undefined" && TeamLive.isOn && TeamLive.isOn() && TeamLive.teammates) {
      const seen = {};
      for (const t of TeamLive.teammates()) {
        if (t.lat == null) continue; seen[t.id] = true;
        if (!_team3dMarkers[t.id]) _team3dMarkers[t.id] = new maplibregl.Marker({ element: person3dEl(t.avatar, t.pet, false), anchor: "bottom" }).setLngLat([t.lon, t.lat]).addTo(_map3d);
        else _team3dMarkers[t.id].setLngLat([t.lon, t.lat]);
      }
      for (const id in _team3dMarkers) if (!seen[id]) { try { _team3dMarkers[id].remove(); } catch (e) { /* */ } delete _team3dMarkers[id]; }
    }
  };
  upd();
  _live3dTimer = setInterval(upd, 1500);
}
function _flyBearing(a, b) { const y = Math.sin((b[0] - a[0]) * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180); const x = Math.cos(a[1] * Math.PI / 180) * Math.sin(b[1] * Math.PI / 180) - Math.sin(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.cos((b[0] - a[0]) * Math.PI / 180); return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; }
function _lerpAngle(a, b, t) { const d = ((b - a + 540) % 360) - 180; return (a + d * t + 360) % 360; }   // 取最短弧插值
// 沿路線飛行：等速前進＋「看向前方」的目標方位再逐幀平滑補間(banking)，轉彎絲滑像空拍機
// 回放＝俯瞰整條路線＋可自由滑動地圖；相機完全不自己動（交給使用者拖曳/縮放/傾斜）→
// 不會被山擋、也不會因相機移動而閃。只讓小藍點沿路線走，顯示行進進度。
function flyAlong() {
  if (!_map3d || !_flyPath || _flyPath.length < 2) return;
  if (_flyRAF) { cancelAnimationFrame(_flyRAF); _flyRAF = null; }
  const path = _flyPath;
  const segM = (a, b) => haversine({ lat: a[1], lon: a[0] }, { lat: b[1], lon: b[0] });
  const cum = [0]; for (let i = 1; i < path.length; i++) cum[i] = cum[i - 1] + segM(path[i - 1], path[i]);
  const total = cum[cum.length - 1] || 1;
  const DUR = Math.min(45000, Math.max(14000, total * 7));
  let ix = 1;
  const posAt = d => { while (ix < cum.length - 1 && cum[ix] < d) ix++; while (ix > 1 && cum[ix - 1] > d) ix--; const a = path[ix - 1], b = path[ix], f = (d - cum[ix - 1]) / ((cum[ix] - cum[ix - 1]) || 1); return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; };
  ix = 1;
  const t0 = performance.now();
  const step = now => {
    if (!_map3d) return;
    const p = Math.min(1, (now - t0) / DUR);
    const src = _map3d.getSource("me3d"); if (src) src.setData({ type: "Feature", geometry: { type: "Point", coordinates: posAt(p * total) } });   // 只動小藍點，不碰相機
    if (p < 1) _flyRAF = requestAnimationFrame(step); else _flyRAF = null;
  };
  _flyRAF = requestAnimationFrame(step);
}
async function _open3D(name, geom, opts) {
  opts = opts || {};
  if (!_proGate()) return;   // 3D 為 PRO 功能，非會員→開升級面板
  if (!geom || !geom.length) { toast(ttT("此步道沒有路線資料，無法 3D 顯示")); return; }
  const ov = $("#map3d"); if (!ov) return;
  if (!navigator.onLine) { toast(ttT("3D 地形需要網路")); return; }
  ov.hidden = false;
  const title = $("#map3dTitle"); if (title) title.textContent = name || "";
  const rp = $("#map3dReplay"); if (rp) rp.hidden = !opts.fly;
  toast(ttT("載入 3D 地形中…"));
  try { await loadMapLibre(); } catch (e) { close3D(); toast(ttT("3D 載入失敗")); return; }
  const coords = geom.map(seg => seg.map(p => [p[1], p[0]]));   // GeoJSON 用 [lon,lat]
  _flyPath = [].concat(...coords);   // 攤平成單一路徑供飛行
  let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
  for (const seg of geom) for (const p of seg) { minLat = Math.min(minLat, p[0]); maxLat = Math.max(maxLat, p[0]); minLng = Math.min(minLng, p[1]); maxLng = Math.max(maxLng, p[1]); }
  const main = geom.reduce((a, b) => (b.length > a.length ? b : a), geom[0]);
  const start = main[0], end = main[main.length - 1];
  if (_flyRAF) { cancelAnimationFrame(_flyRAF); _flyRAF = null; }
  if (_map3d) { try { _map3d.remove(); } catch (e) { /* */ } _map3d = null; }
  _map3d = new maplibregl.Map({
    container: "map3dCanvas",
    center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2], zoom: 12, pitch: 62, bearing: 18, maxPitch: 80,
    attributionControl: { compact: true }, fadeDuration: 250, maxTileCacheSize: 1024, refreshExpiredTiles: false,   // 圖磚淡入(不硬切pop)；大量保留圖磚在 GPU→平移時不卸載重載；不因過期重抓
    style: {
      version: 8,
      sources: {
        sat: { type: "raster", tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}${AGTOK}`], tileSize: 256, maxzoom: 18, attribution: "© Esri, Maxar" },
        terrain: { type: "raster-dem", tiles: ["https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png"], tileSize: 256, encoding: "terrarium", maxzoom: 15, attribution: "Terrain: Mapzen / AWS Terrain Tiles · SRTM & GMTED2010 courtesy of the U.S. Geological Survey · ETOPO1 courtesy NOAA NCEI" },
        route: { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: coords } } },
        pts: { type: "geojson", data: { type: "FeatureCollection", features: [{ type: "Feature", properties: { k: "s" }, geometry: { type: "Point", coordinates: [start[1], start[0]] } }, { type: "Feature", properties: { k: "e" }, geometry: { type: "Point", coordinates: [end[1], end[0]] } }] } },
        me3d: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      },
      layers: [
        { id: "bg", type: "background", paint: { "background-color": "#3d4a3a" } },   // 底色暗森林色：萬一有瞬間縫隙也不明顯（正常情況由父層衛星墊底，不會看到此色）
        { id: "sat", type: "raster", source: "sat", paint: { "raster-fade-duration": 0 } },
        { id: "route-casing", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.65 } },
        { id: "route", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#ff5a2c", "line-width": 4 } },
        { id: "pts", type: "circle", source: "pts", paint: { "circle-radius": 6, "circle-color": ["match", ["get", "k"], "s", "#2f7d4f", "#d2542e"], "circle-stroke-color": "#fff", "circle-stroke-width": 2 } },
        { id: "me3d", type: "circle", source: "me3d", paint: { "circle-radius": 8, "circle-color": "#2f7dff", "circle-stroke-color": "#fff", "circle-stroke-width": 3 } },
      ],
      terrain: { source: "terrain", exaggeration: 1.2 },   // 誇張倍率降一點→地形網格較平順、LOD 變動較少、較不閃
      sky: { "sky-color": "#9ecbff", "horizon-color": "#dcecff", "fog-color": "#ffffff", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.5, "fog-ground-blend": 0.4 },
    },
  });
  _map3d.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");   // 移離右上角，不擋關閉 ✕
  _map3d.on("load", () => {
    _map3d.resize();   // 確保用滿容器解析度（避免初次建立時尺寸不對→模糊）
    if (opts.live) {
      // 記錄中 3D＝俯瞰＋可自由滑動；相機不強制運鏡(不閃/不被擋)，停手 4 秒後平滑跟隨你，避免走出畫面
      const l0 = (typeof recSnap !== "undefined" && recSnap && recSnap.track && recSnap.track.length) ? recSnap.track[recSnap.track.length - 1] : (typeof myLoc !== "undefined" ? myLoc : null);
      const c = l0 && l0.lat != null ? [l0.lon, l0.lat] : [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
      _map3d.jumpTo({ center: c, zoom: 15, pitch: 45, bearing: 0 });
      preload3DFull({ n: c[1] + 0.02, s: c[1] - 0.02, e: c[0] + 0.02, w: c[0] - 0.02 }, () => {});   // 預載周邊，走動/拖曳都順
      _live3dInteractAt = 0;
      _map3d.on("dragstart zoomstart rotatestart pitchstart", () => { _live3dInteractAt = Date.now(); });   // 使用者操作時暫停自動跟隨
      toast(ttT("3D 模式：地圖可以隨便拖、縮放、傾斜"));
      _start3dLive();
      return;
    }
    if (opts.fly) {
      // 回放＝俯瞰整條路線、可自由滑動地圖。相機不自己動→不會被山擋、不閃；只讓小藍點沿路線走
      try { _map3d.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, pitch: 38, bearing: 0, duration: 0 }); } catch (e) { /* */ }
      preload3DFull({ n: maxLat + 0.01, s: minLat - 0.01, e: maxLng + 0.01, w: minLng - 0.01 }, () => {});   // 背景預載，拖到別處也順
      toast(ttT("俯瞰模式：地圖可以隨便拖、縮放、傾斜"));
      setTimeout(() => { if (_map3d) flyAlong(); }, 300);   // 小藍點開始走（相機交給使用者）
    } else {
      try { _map3d.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 55, pitch: 62, bearing: 18, duration: 0 }); } catch (e) { /* */ }
      // 太長的步道 fitBounds 會縮太遠→衛星變糊。靜態檢視設縮放下限：改成站在起點、面朝路線的近景，較清楚
      if (_map3d.getZoom() < 14) {
        const ahead = main[Math.min(main.length - 1, 12)] || end;
        const br = _flyBearing([start[1], start[0]], [ahead[1], ahead[0]]);
        _map3d.jumpTo({ center: [start[1], start[0]], zoom: 14.8, pitch: 64, bearing: br });
      }
    }
  });
}
if (typeof document !== "undefined") {
  const _c3 = () => {
    const b = document.getElementById("map3dClose"); if (b) b.addEventListener("click", close3D);
    const r = document.getElementById("map3dReplay"); if (r) r.addEventListener("click", flyAlong);
  };
  if (document.readyState !== "loading") _c3(); else document.addEventListener("DOMContentLoaded", _c3);
}
// 地圖上的「3D」鈕（onClick 自訂：詳情=開步道 3D、記錄=開軌跡 3D）
// 自訂地圖控制鈕（Leaflet 用 div）→ 補鍵盤/報讀無障礙：可 Tab 聚焦、Enter/空白鍵觸發、aria-label（取 title）
function _a11yCtrl(d) {
  d.setAttribute("role", "button");
  d.setAttribute("tabindex", "0");
  if (d.title && !d.getAttribute("aria-label")) d.setAttribute("aria-label", d.title);
  d.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); d.click(); } });
}
function addThreeD(map, onClick) {
  const c = L.control({ position: "topright" });
  c.onAdd = () => {
    const d = L.DomUtil.create("div", "map-fs-btn map-3d-btn");
    d.innerHTML = "3D"; d.title = ttT("3D 地形");
    L.DomEvent.disableClickPropagation(d);
    d.addEventListener("click", onClick);
    _a11yCtrl(d);
    return d;
  };
  c.addTo(map);
}
// 導航／自由 切換鈕：導航模式地圖跟著方向轉，但旋轉的圖層會讓雙指縮放算不準；
// 想仔細看地圖時切到「自由」→ 地圖轉正、縮放/拖曳正常。
const SVG_NAV = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>';
function addNavToggle(map) {
  const c = L.control({ position: "topright" });
  c.onAdd = () => {
    const d = L.DomUtil.create("div", "map-fs-btn map-nav-btn");
    const paint = () => { d.classList.toggle("on", _navUp); d.title = _navUp ? ttT("導航模式（地圖跟著轉）") : ttT("自由操作（可雙指縮放）"); };
    d.innerHTML = SVG_NAV; paint();
    L.DomEvent.disableClickPropagation(d);
    d.addEventListener("click", () => {
      setNavUp(!_navUp);
      _navUserOff = !_navUp;   // 使用者手動關 → 別再被自動開回去
      paint();
      if (typeof toast === "function") toast(_navUp ? ttT("導航模式") : ttT("自由操作（可雙指縮放）"));
    });
    _a11yCtrl(d);
    map._navBtnPaint = paint;   // navUp 被別處改動時同步鈕的狀態
    return d;
  };
  c.addTo(map);
}
// 震動＋提示音：iPhone 不支援 navigator.vibrate（以前偏離路線、每公里提醒在 iPhone 上都沒感覺）
// → 原生 App 用 Capacitor Haptics；網頁用 navigator.vibrate；重要提醒（loud）另外響提示音。
let _audioCtx = null;
function ttAudioUnlock() {   // iOS 要在使用者手勢裡先啟動音訊，之後才能自己響（在「開始」按鈕呼叫）
  try { if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (_audioCtx.state === "suspended") _audioCtx.resume(); } catch (e) { /* */ }
}
function ttBeep(times) {
  try {
    if (!_audioCtx) return;
    const c = _audioCtx;
    for (let i = 0; i < (times || 2); i++) {
      const o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + i * 0.3;
      o.type = "sine"; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + 0.24);
    }
  } catch (e) { /* */ }
}
function ttBuzz(pattern, loud) {
  const arr = Array.isArray(pattern) ? pattern : [pattern];
  const C = window.Capacitor, H = C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.Haptics;
  if (H) { let t = 0; arr.forEach((ms, i) => { if (i % 2 === 0) setTimeout(() => { try { H.vibrate({ duration: Math.max(60, ms) }); } catch (e) { /* */ } }, t); t += ms; }); }
  else if (navigator.vibrate) { try { navigator.vibrate(arr); } catch (e) { /* */ } }
  if (loud) ttBeep(loud === true ? 2 : loud);
}
// 指北針：讀裝置方位，轉動手機時指針跟著轉、指向實際北方
let _compassOn = false, _heading = 0, _gpsHeading = null, _navUp = false, _navUserOff = false;
function rotateCompasses() { document.querySelectorAll(".compass-rose").forEach(r => r.style.transform = `rotate(${-_heading}deg)`); }
// 導航模式（heading-up）：只旋轉「地圖圖層面板」(tiles/markers)，控制鈕在外層不轉→四顆鈕固定、縮放正常、小隊照常。
// 放大面板以蓋住旋轉後的角落空缺：倍率＝對角線／短邊（剛好蓋滿，不多放大）。以前固定 1.8 倍，圖磚放大後會糊
let NAV_SCALE = 1.5;
function _navScaleCalc() { try { const s = recMap.getSize(); NAV_SCALE = Math.min(1.8, Math.hypot(s.x, s.y) / Math.max(1, Math.min(s.x, s.y)) + 0.02); } catch (e) { /* */ } }
function navHeading() { const h = (_compassOn && _heading != null) ? _heading : _gpsHeading; return (h != null && isFinite(h)) ? h : 0; }
// 平滑後的導航方位＋每幀緩動：GPS/羅盤方位有雜訊，直接用會讓地圖轉動時抖動；用低通濾波順順跟隨
let _navHeadingSm = 0, _navRAF = null, _navLastT = 0;
function _navTick(now) {
  if (!_navUp) { _navRAF = null; return; }
  const dt = Math.min(0.05, (now - _navLastT) / 1000) || 0.016; _navLastT = now;
  const target = navHeading();
  const d = ((target - _navHeadingSm + 540) % 360) - 180;   // 最短弧
  if (Math.abs(d) < 0.4) _navHeadingSm = target;            // 死區：極小抖動直接忽略
  else _navHeadingSm = (_navHeadingSm + d * (1 - Math.pow(0.006, dt)) + 360) % 360;   // 與幀率無關的平滑追隨
  applyPaneRotation();
  _navRAF = requestAnimationFrame(_navTick);
}
function applyPaneRotation() {
  if (!recMap) return;
  const pane = recMap.getContainer().querySelector(".leaflet-map-pane"); if (!pane) return;
  const t = pane.style.transform || "";
  const m = t.match(/translate3d\([^)]*\)|translate\([^)]*\)/);   // Leaflet 平移(縮放/拖曳都會重設它)
  const base = m ? m[0] : "";
  // 導航關閉、或使用者滑開地圖（暫停跟隨）＝不旋轉：只在還殘留 rotate 時清一次，避免每幀重寫和 Leaflet 拖曳打架＝抖動
  if (!_navUp || !_recFollow) { if (/rotate/.test(t)) { pane.style.transform = base; pane.style.transformOrigin = ""; } return; }
  const size = recMap.getSize();
  _navScaleCalc();
  pane.style.transformOrigin = `${size.x / 2}px ${size.y / 2}px`;   // 繞畫面中心旋轉
  pane.style.transform = `rotate(${-_navHeadingSm}deg) scale(${NAV_SCALE}) ${base}`;   // 用平滑方位→不抖
}
let _navPaneHooked = false;
function applyNavUp() {
  if (!recMap) return;
  if (_navUp) {
    document.body.classList.add("navup-on");
    if (!_navPaneHooked) { recMap.on("move zoom viewreset moveend zoomend", applyPaneRotation); _navPaneHooked = true; }
    _navHeadingSm = navHeading();   // 開啟時直接對齊，不從 0 掃過去
    if (!_navRAF) { _navLastT = performance.now(); _navRAF = requestAnimationFrame(_navTick); }   // 啟動平滑緩動迴圈
    applyPaneRotation();
  } else {
    document.body.classList.remove("navup-on");
    if (_navPaneHooked) { recMap.off("move zoom viewreset moveend zoomend", applyPaneRotation); _navPaneHooked = false; }
    if (_navRAF) { cancelAnimationFrame(_navRAF); _navRAF = null; }
    applyPaneRotation();   // 清掉旋轉，只留 Leaflet 平移
  }
}
// 導航模式＝記錄時的固定預設（無按鈕）：開始記錄自動開、結束自動關
function setNavUp(on) {
  if (_navUp === on) return;
  _navUp = on;
  applyNavUp();
  if (recMap && recMap._navBtnPaint) recMap._navBtnPaint();   // 切換鈕高亮跟著狀態走
  if (_navUp) { try { enableCompass(true); } catch (e) { /* */ } updateMeCone(); }
  else { document.querySelectorAll("#recMap .tm-av, #recMap .pm-e").forEach(e => e.style.transform = ""); updateMeCone(); if (recMap) setTimeout(() => recMap.invalidateSize(), 60); }
}
// 更新記錄地圖「我」的面朝錐：優先用手機羅盤(站著轉身也動)，沒有才用 GPS 行進方向
function updateMeCone() {
  if (_navUp && _recFollow) {
    applyPaneRotation();   // 地圖圖層跟著行進方向轉（不動控制鈕）
    const h = navHeading();
    // 頭像框＋寵物保持「正的」＋抵銷面板放大：反向旋轉 +h、反向縮放 1/NAV_SCALE
    document.querySelectorAll("#recMap .tm-av, #recMap .pm-e").forEach(e => e.style.transform = `rotate(${h}deg) scale(${1 / NAV_SCALE})`);
  }
  if (!recMarker || !recMarker._av || !recMarker.getElement) return;
  const el = recMarker.getElement(); const dir = el && el.querySelector(".tm-dir"); if (!dir) return;
  // 導航：頭像框已直立，方向角(tm-dir)設 0°→在螢幕上朝正上方(前方)＝原本相框的角就是指標
  if (_navUp && _recFollow) { dir.style.transform = "rotate(0deg)"; dir.style.display = "block"; return; }
  const head = (_compassOn && _heading != null) ? _heading : _gpsHeading;
  if (head != null) { dir.style.transform = `rotate(${head}deg)`; dir.style.display = "block"; } else dir.style.display = "none";
}
function onOrient(e) {
  let h = e.webkitCompassHeading;
  if (h == null && e.absolute && e.alpha != null) h = 360 - e.alpha;
  if (h == null) return;
  _heading = h; rotateCompasses(); updateMeCone();
}
function enableCompass(silent) {   // silent：開機預熱權限時別跳 toast（使用者根本沒按指北針）
  if (_compassOn) return;
  const start = () => { _compassOn = true; window.addEventListener("deviceorientationabsolute", onOrient, true); window.addEventListener("deviceorientation", onOrient, true); document.querySelectorAll(".map-compass").forEach(c => c.classList.add("on")); if (!silent) toast("指北針已啟用，轉動手機看看"); };
  const DOE = window.DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === "function") {
    DOE.requestPermission().then(p => p === "granted" ? start() : toast(ttT("需允許「動作與方向」權限"))).catch(() => toast(ttT("此裝置無法啟用指北針")));
  } else if (window.DeviceOrientationEvent) start();
  else toast(ttT("此裝置不支援方位感測"));
}
// 一次問完定位＋方位權限（iOS 方位必須由使用者手勢觸發，故綁在「進 App 的第一次點擊」）
let _entryPermAsked = false;
function _warmUpPerms() {
  try { enableCompass(true); } catch (e) { /* */ }
  if (navigator.geolocation) { try { navigator.geolocation.getCurrentPosition(() => {}, () => {}, { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }); } catch (e) { /* */ } }
}
// 進記錄頁才要定位權限：首次先用一張說明卡鋪陳「為什麼要定位」，讓年長使用者看得懂再面對系統的允許/拒絕（大幅降低誤拒）。
// 以前是「進 App 第一下點哪裡都跳系統定位詢問」的反模式——碰個搜尋框就被問定位、沒頭緒就按拒絕。
async function requestEntryPerms() {
  if (_entryPermAsked) return;
  if (document.querySelector(".tour")) return;   // 導覽中程式切到記錄頁時不插入權限卡，等使用者真的進來再問
  _entryPermAsked = true;
  let prompted = false;
  try { prompted = localStorage.getItem("tt_locperm_prompted") === "1"; } catch (e) { /* */ }
  if (!prompted && typeof ttConfirm === "function") {
    try { localStorage.setItem("tt_locperm_prompted", "1"); } catch (e) { /* */ }
    const ok = await ttConfirm(
      ttT("記錄健行需要「定位」權限，用來即時畫出你走過的路線和里程。接著系統會跳出詢問，請選「允許」。"),
      ttT("好，開啟定位"), ttT("稍後"));
    if (!ok) return;   // 稍後：這次不觸發系統詢問；之後按「開始」記錄時會再要
  }
  _warmUpPerms();
}
// opts.nav：記錄地圖的指北針兼「導航／自由」切換（以前兩顆鈕功能重疊，右上角疊了 5 顆）
function addCompass(map, opts) {
  const c = L.control({ position: "topright" });
  c.onAdd = () => {
    const d = L.DomUtil.create("div", "map-compass" + (_compassOn ? " on" : "") + (opts && opts.nav ? " nav-compass" : ""));
    d.title = ttT(opts && opts.nav ? "點一下切換：地圖跟著方向轉／北方朝上" : "指北針（點一下啟用）");
    d.innerHTML = `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18.5" fill="rgba(255,253,248,.94)" stroke="rgba(0,0,0,.15)"/><g class="compass-rose" style="transform-origin:20px 20px;transform:rotate(${-_heading}deg)"><polygon points="20,4 24.5,21 15.5,21" fill="#c0392b"/><polygon points="20,36 24.5,19 15.5,19" fill="#9aa0a6"/><text x="20" y="13.5" text-anchor="middle" font-size="8" font-weight="700" fill="#fff">N</text></g></svg>`;
    L.DomEvent.disableClickPropagation(d);
    if (opts && opts.nav) {
      const paint = () => { d.classList.toggle("navon", _navUp); d.setAttribute("aria-pressed", _navUp); };
      d.addEventListener("click", () => {
        enableCompass(true);
        setNavUp(!_navUp); _navUserOff = !_navUp; paint();
        toast(_navUp ? ttT("導航模式：地圖跟著你的方向轉") : ttT("北方朝上，可以雙指縮放"));
      });
      map._navBtnPaint = paint; paint();
    } else d.addEventListener("click", enableCompass);
    _a11yCtrl(d);
    return d;
  };
  c.addTo(map);
}
// 地圖全螢幕（用 CSS 假全螢幕，iOS 也支援）
function addFullscreen(map) {
  // SVG 圖示（不用 ⛶／✕ 文字符號——部分手機字型會顯示成空框 □）
  const SVG_EXPAND = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  const SVG_CLOSE = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const c = L.control({ position: "topright" });
  c.onAdd = () => {
    const d = L.DomUtil.create("div", "map-fs-btn");
    d.innerHTML = SVG_EXPAND; d.title = ttT("全螢幕");
    L.DomEvent.disableClickPropagation(d);
    d.addEventListener("click", () => {
      const el = map.getContainer();
      const fs = !el.classList.contains("map-fs");
      if (fs) {   // 放大：把地圖搬到 body，脫離捲動/transform 容器 → fixed 才會正確貼齊整個畫面
        el._fsHolder = document.createComment("mfs");
        el.parentNode.insertBefore(el._fsHolder, el);
        document.body.appendChild(el);
        el.classList.add("map-fs"); document.body.classList.add("map-fs-open");
        d.innerHTML = SVG_CLOSE;
      } else {    // 關閉：搬回原位
        el.classList.remove("map-fs"); document.body.classList.remove("map-fs-open");
        if (el._fsHolder) { el._fsHolder.parentNode.insertBefore(el, el._fsHolder); el._fsHolder.remove(); el._fsHolder = null; }
        d.innerHTML = SVG_EXPAND;
      }
      // 記錄地圖放大：小隊面板跟著搬到 body，才不會被全螢幕地圖蓋住（見 teamlive.placeBar）
      if (el.id === "recMap" && typeof TeamLive !== "undefined" && TeamLive.syncFs) TeamLive.syncFs();
      const fix = () => map.invalidateSize({ animate: false });
      requestAnimationFrame(() => requestAnimationFrame(fix));
      setTimeout(fix, 150); setTimeout(fix, 400);
    });
    _a11yCtrl(d);
    return d;
  };
  c.addTo(map);
}
// #7 記錄地圖「回到我的位置」定位鈕：記錄中用最後軌跡點，否則向系統要一次定位
function addRecenter(map) {
  const SVG = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="8"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/></svg>';
  const c = L.control({ position: "topright" });
  c.onAdd = () => {
    const d = L.DomUtil.create("div", "map-fs-btn recenter-btn");
    d.innerHTML = SVG; d.title = ttT("回到我的位置");
    if (map === recMap || map.getContainer().id === "recMap") { map._recenterBtn = d; if (_recFollow) d.classList.add("following"); }
    L.DomEvent.disableClickPropagation(d);
    d.addEventListener("click", () => {
      if (map === recMap || map.getContainer().id === "recMap") setRecFollow(true);   // 手動回到我的位置＝恢復自動跟隨
      let ll = null;
      if (recMarker) ll = recMarker.getLatLng();
      else if (recSnap && recSnap.track && recSnap.track.length) { const p = recSnap.track[recSnap.track.length - 1]; ll = L.latLng(p.lat, p.lon); }
      else if (myLoc) ll = L.latLng(myLoc.lat, myLoc.lon);
      if (ll) { map.setView(ll, Math.max(map.getZoom(), 16), { animate: true }); return; }
      if (navigator.geolocation) {
        toast(ttT("定位中…"));
        navigator.geolocation.getCurrentPosition(
          p => { myLoc = { lat: p.coords.latitude, lon: p.coords.longitude }; map.setView([p.coords.latitude, p.coords.longitude], 16, { animate: true }); },
          () => toast(ttT("定位失敗，請允許定位權限")), { enableHighAccuracy: true, timeout: 8000 });
      }
    });
    _a11yCtrl(d);
    return d;
  };
  c.addTo(map);
}
function addBaseWithToggle(map) {   // 底圖切換：地形(NLSC台灣官方+立體陰影，預設) / 衛星(Esri)
  const hs = hillshadeLayer(map).addTo(map);   // 地形模式預設疊地形陰影
  const layers = { topo: baseTopo().addTo(map), sat: baseSat() };
  const ctrl = L.control({ position: "bottomleft" });
  ctrl.onAdd = () => {
    const d = L.DomUtil.create("div", "basemap-toggle");
    d.innerHTML = `<button class="bm on" data-l="topo">${ic("mountain")} ${ttT("地形")}</button>`
      + `<button class="bm" data-l="sat">${ic("globe")} ${ttT("衛星")}</button>`;
    L.DomEvent.disableClickPropagation(d);
    d.addEventListener("click", e => {
      const b = e.target.closest(".bm"); if (!b) return;
      const l = b.dataset.l;
      Object.values(layers).forEach(x => map.removeLayer(x)); map.removeLayer(hs);
      layers[l].addTo(map);
      // 只有 Esri 地形疊陰影：衛星本身立體、NLSC 自帶樣式，疊上去會過暗
      if (l === "topo") hs.addTo(map);
      map.getContainer().classList.toggle("sat-on", l === "sat");   // 深色模式只反相地形圖，衛星照片只壓暗
      d.querySelectorAll(".bm").forEach(x => x.classList.toggle("on", x === b));
    });
    return d;
  };
  ctrl.addTo(map);
}
// 難度配色的水滴釘（含等級數字）
function pinIcon(color, label) {
  return L.divIcon({
    className: "trail-pin",
    html: `<svg viewBox="0 0 24 32" width="24" height="32"><path d="M12 0C5.4 0 0 5.2 0 11.6 0 20 12 32 12 32s12-12 12-20.4C24 5.2 18.6 0 12 0Z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="12" cy="11.5" r="6" fill="#fff" opacity=".92"/><text x="12" y="15" text-anchor="middle" font-size="9" font-weight="700" fill="${color}">${label}</text></svg>`,
    iconSize: [24, 32], iconAnchor: [12, 32], popupAnchor: [0, -28],
  });
}
// 步道路況/封閉警示橫幅
function fmtYmd(s) { return s && s.length === 8 ? `${s.slice(0, 4)}/${s.slice(4, 6)}/${s.slice(6)}` : s; }
// 路況更新時間：一小時內寫「12 分鐘前」，再久寫日期時間；不是剛剛抓的（離線用存檔）就標出來
function condStamp() {
  const u = (typeof Conditions !== "undefined" && Conditions.lastUpdated()) || 0;
  if (!u) return "";
  const s = Math.max(1, Math.round((Date.now() - u) / 1000));
  const txt = s < 6 * 3600 ? ttAgo(s) : new Date(u).toLocaleString(ttLocale(), { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  return txt + (Conditions.ok() ? "" : `${ttSp()}${ttParen(ttT("離線，顯示上次抓到的"))}`);
}
// 外部來源的字串插進 innerHTML 前一律跳脫：Google Places 的店名/簡介是店家可自訂的欄位、
// 林業署公告也是外部資料，直接插入會破版（最壞情況是 stored XSS）。
// 最後一次操作是鍵盤還是手指：決定彈窗打開時要不要畫焦點框
addEventListener("keydown", e => { if (!e.metaKey && !e.ctrlKey && !e.altKey) window.__ttKbd = true; }, true);
addEventListener("pointerdown", () => { window.__ttKbd = false; }, true);
// 共用：分享一段文字（系統分享 → 複製 → 跳出來給人手動複製），求救卡、留守人、位置分享都用這個
async function ttShareText(text, title) {
  const T = typeof ttT === "function" ? ttT : (s => s);
  if (navigator.share) { try { await navigator.share(title ? { title, text } : { text }); return "shared"; } catch (e) { if (e && e.name === "AbortError") return "cancel"; } }
  if (navigator.clipboard) { try { await navigator.clipboard.writeText(text); toast(T("複製好了，貼給家人就行")); return "copied"; } catch (e) { /* */ } }
  if (typeof ttAlertBox === "function") ttAlertBox(text); else toast(text);
  return "shown";
}
function escHtml(v) {
  return String(v == null ? "" : v).replace(/[<>&"']/g, ch =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[ch]));
}
function conditionBanner(t) {
  const c = t.condition;
  const dot = ttCJK() ? "・" : " · ";
  // 有官方公告（落石／坍方／崩塌／封閉等）→ 紅（封閉）／橘（注意）
  if (c && c.status) {
    const closed = /暫停|封閉|關閉/.test(c.status);
    // 「部分封閉（全線）」這種官方寫法自相矛盾 → 全線時就不再括號標示
    const sec = c.section && !(c.section === "全線" && /部分/.test(c.status)) ? `（${escHtml(c.section)}）` : "";
    // 預計重新開放日已經過了：官方常常沒及時撤公告 → 講清楚「可能已開放，打電話確認」，不要讓人以為還封著
    const today = (() => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`; })();
    const passed = c.reopen && /^\d{8}$/.test(c.reopen) && c.reopen < today;
    const reopen = c.reopen ? (passed
      ? `<div class="cond-note">${ic("info")}<span>${ttT("預計重新開放日 %s 已過，可能已經開放了。出發前請向管理單位確認").replace("%s", fmtYmd(c.reopen))}${c.dep ? `（${escHtml(ttT(c.dep))}）` : ""}</span></div>`
      : `<div class="cond-meta">${ttT("預計重新開放")}${ttColon()}${fmtYmd(c.reopen)}</div>`) : "";
    return `<div class="cond-banner ${closed && !passed ? "danger" : "warn"}">
      <div class="cond-h">${ic("alert")}<span>${escHtml(c.status)}</span>${sec}</div>
      ${c.title ? `<div class="cond-body">${escHtml(c.title)}</div>` : ""}
      ${(c.title && typeof I18n !== "undefined" && I18n.lang() !== "zh") ? `<div class="pv-tr-row"><button class="link-btn" id="condTranslate">${ic("translate")} ${ttT("翻譯年糕")}</button></div><div class="cond-body pv-cap-tr" id="condTr" hidden></div>` : ""}
      ${reopen}
      <div class="cond-meta">${ttT("林業署公告")}${c.ann ? ` ${fmtYmd(c.ann)}` : ""}${c.dep ? `${dot}${escHtml(ttT(c.dep))}` : ""}${dot}${ttT("以官方公告為準")}</div>
      ${condStamp() ? `<div class="cond-meta">${ttT("查詢於")} ${condStamp()}</div>` : ""}
    </div>`;
  }
  // 林業署步道、無公告 → 綠
  if (t.source === "forestry") {
    const st = condStamp();
    return `<div class="cond-banner ok">
      <div class="cond-h">${ic("check")}<span>${ttT("目前沒有封閉公告")}</span></div>
      <div class="cond-meta">${ttT("林業署即時路況")}${st ? `${dot}${ttT("查詢於")} ${st}` : ""}${dot}${ttT("現場天候仍要留意")}</div>
    </div>`;
  }
  // 社群步道：沒有官方路況來源 → 一行講清楚就好
  return `<div class="cond-banner note">
    <div class="cond-h">${ic("info")}<span>${ttT("這條不歸林業署管，沒有官方封閉公告")}</span></div>
    <div class="cond-meta">${ttT("出發前查一下當地公告，或看下面的山友回報")}</div>
  </div>`;
}

// 同名步道的其他路段：OSM 常把一條步道切成好幾筆（草嶺古道 2.06 km 只是其中一段、另有「草嶺古道福隆路線」），
// 詳情頁列出來讓人知道「這可能只是一段」，點了直接跳過去。只比同縣市，最多 4 筆。
function _sibCore(n) { return String(n || "").replace(/(國家步道|自然步道|親山步道|登山步道|環狀步道|生態步道|步道|古道|越嶺道).*$/, ""); }
function siblingTrails(t) {
  const k = _sibCore(t.name); if (k.length < 2 || typeof TRAILS === "undefined") return [];
  const head = t.name.slice(0, k.length + 2), county = String(t.region || "").slice(0, 3);
  return TRAILS.filter(o => o !== t && o.name !== t.name && String(o.region || "").slice(0, 3) === county
    && (_sibCore(o.name) === k || (k.length >= 3 && o.name.startsWith(k)) || (t.name.length > k.length && o.name.startsWith(head))))
    .slice(0, 4);
}
function siblingHtml(t) {
  const sib = siblingTrails(t); if (!sib.length) return "";
  return `<div class="sib-box"><div class="sib-h">${ttT("同名的其他路段")}</div>
    <div class="sib-row">${sib.map(o => `<button class="sib-chip" data-sib="${o.id}">${escHtml(o.name)}<span>${o.length_km ? fmtKm(o.length_km) + " km" : ""}</span></button>`).join("")}</div></div>`;
}
