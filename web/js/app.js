// ===== Trail Tracker 前端主程式 =====
const $ = s => document.querySelector(s);
const TRAILS = window.TRAILS || [];
const SRC_LABEL = { forestry: "林業署", osm: "OSM社群", osm_path: "OSM社群" };
const GRADES = window.GRADES || {};
// 自架 Leaflet 的標記圖示路徑（離線可用）
if (window.L && L.Icon && L.Icon.Default) L.Icon.Default.imagePath = "vendor/leaflet/images/";

// 分級說明面板
function openGradeInfo() {
  const rows = Object.entries(GRADES).map(([n, g]) => `
    <div class="grade-row">
      <span class="grade-chip" style="background:${g.color}">${g.emoji} ${n}級·${g.name}</span>
      <div class="grade-text">
        <div class="grade-plain">${g.plain}</div>
        <div class="grade-meta">適合：${g.who}　·　${g.time}　·　${g.gear}</div>
      </div>
    </div>`).join("");
  $("#gradeBody").innerHTML = `
    <h2 style="margin-top:6px">步道分級怎麼看？</h2>
    <p style="font-size:13.5px;color:var(--ink-soft);line-height:1.6;margin:0 0 14px">
      分級數字越大代表越難走。等級依
      <b>林業及自然保育署「自然步道使用困難度分級標準」</b>，
      綜合海拔、坡度、危險地形、天候、路況、長度等 10 項因子評定。
    </p>
    <div class="grade-list">${rows}</div>
    <div class="grade-note" style="margin-top:14px">
      <b>👨‍👩‍👧 「親子友善」徽章</b>是另一個獨立標記（不是難度等級）：代表這條步道
      <b>難度低、路程短、路面好走</b>，特別適合帶小孩。一條步道可能同時是「輕鬆」難度又被標為「親子友善」。
    </div>
    <p style="font-size:11.5px;color:var(--ink-soft);line-height:1.6;margin-top:14px">
      標示「<b>估</b>」的步道為社群（OpenStreetMap）資料，依步道實際長度推估等級，僅供參考；
      林業署步道則為官方正式分級。出發前請再查詢即時路況與天氣。
    </p>
    <button class="btn ghost" id="btnGradeClose" style="margin-top:8px">了解了</button>`;
  $("#gradeMask").classList.add("show");
  $("#gradeSheet").classList.add("show");
  $("#btnGradeClose").addEventListener("click", closeGradeInfo);
}
function closeGradeInfo() {
  $("#gradeMask").classList.remove("show");
  $("#gradeSheet").classList.remove("show");
}

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return (h ? `${h}:` : "") + `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(t._tm); t._tm = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- 分頁切換 ----------
let detailMap, recMap, recLine, recMarker;
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    btn.classList.add("active");
    const view = btn.dataset.view;
    $("#view-" + view).classList.add("active");
    if (view === "record") setTimeout(initRecMap, 60);
    if (view === "me") { renderHistory(); refreshOfflineStatus(); }
  });
});

// ---------- 探索：篩選與列表 ----------
let curFilter = "all", curRegion = "all", curQuery = "";

function buildRegionChips() {
  const regions = [...new Set(TRAILS.map(t => t.region).filter(Boolean))].sort();
  const wrap = $("#regionChips");
  wrap.innerHTML = `<button class="chip active" data-region="all">全部地區</button>` +
    regions.map(r => `<button class="chip" data-region="${r}">${r}</button>`).join("");
  wrap.querySelectorAll(".chip").forEach(c => c.addEventListener("click", () => {
    wrap.querySelectorAll(".chip").forEach(x => x.classList.remove("active"));
    c.classList.add("active"); curRegion = c.dataset.region; render();
  }));
}

$("#filterChips").querySelectorAll(".chip").forEach(c => c.addEventListener("click", () => {
  $("#filterChips").querySelectorAll(".chip").forEach(x => x.classList.remove("active"));
  c.classList.add("active"); curFilter = c.dataset.filter; render();
}));
$("#searchInput").addEventListener("input", e => { curQuery = e.target.value.trim(); render(); });

let myLoc = null;       // 使用者位置（附近排序用）
let pageSize = 60, shown = 0, curList = [];

function matches(t) {
  if (curRegion !== "all" && t.region !== curRegion) return false;
  if (curFilter === "fav" && !Store.isFav(t.id)) return false;
  if (curFilter === "family" && !t.family_friendly) return false;
  if (curFilter === "d1" && t.difficulty !== 1) return false;
  if (curFilter === "d2" && t.difficulty !== 2) return false;
  if (curFilter === "d3" && t.difficulty !== 3) return false;
  if (curFilter === "d45" && !(t.difficulty >= 4)) return false;
  if (curQuery) {
    const q = curQuery.toLowerCase();
    if (!(`${t.name} ${t.position} ${t.system || ""}`.toLowerCase().includes(q))) return false;
  }
  return true;
}

function trailCard(t) {
  const d = t.difficulty || 0;
  const len = t.length_km != null ? `${t.length_km} km` : "—";
  const asc = t.ascent != null ? `↑${Math.round(t.ascent)} m` : "";
  const dist = (myLoc && t.lat) ? `<span>🧭 ${(haversine(myLoc, { lat: t.lat, lon: t.lon }) / 1000).toFixed(1)} km</span>` : "";
  const closed = t.condition && /暫停|封閉|關閉/.test(t.condition.status || "");
  return `<div class="card" data-id="${t.id}">
    <button class="fav-star${Store.isFav(t.id) ? " on" : ""}" data-fav="${t.id}">${Store.isFav(t.id) ? "★" : "☆"}</button>
    <h3>${t.name}</h3>
    <div class="meta">
      <span>📍 ${t.position || "—"}</span>
      <span><b>${len}</b></span>
      ${asc ? `<span>${asc}</span>` : ""}
      ${t.tour ? `<span>⏱ ${t.tour}</span>` : ""}
      ${dist}
    </div>
    <div class="badges">
      <span class="badge diff d${d}">${t.difficulty_label}</span>
      ${closed ? `<span class="badge closed">⚠️ ${t.condition.status}</span>` : ""}
      ${t.family_friendly ? `<span class="badge family">👨‍👩‍👧 親子友善</span>` : ""}
      ${t.permit && t.permit !== "無" ? `<span class="badge ghost">需入山證</span>` : ""}
      <span class="badge src">${SRC_LABEL[t.source] || t.source}</span>
    </div>
  </div>`;
}

function render() {
  curList = TRAILS.filter(matches);
  if (myLoc) curList.sort((a, b) =>
    (a.lat ? haversine(myLoc, { lat: a.lat, lon: a.lon }) : 9e9) -
    (b.lat ? haversine(myLoc, { lat: b.lat, lon: b.lon }) : 9e9));
  $("#resultCount").textContent = `共 ${curList.length} 條步道`;
  shown = 0;
  $("#trailList").innerHTML = "";
  if (!curList.length) { $("#trailList").innerHTML = `<div class="empty"><span class="big">🔍</span>找不到符合的步道</div>`; return; }
  renderMore();
}

function renderMore() {
  const slice = curList.slice(shown, shown + pageSize);
  const html = slice.map(trailCard).join("");
  $("#trailList").insertAdjacentHTML("beforeend", html);
  shown += slice.length;
  const old = $("#loadMore"); if (old) old.remove();
  if (shown < curList.length) {
    $("#trailList").insertAdjacentHTML("beforeend",
      `<button class="btn ghost" id="loadMore">載入更多（剩 ${curList.length - shown} 條）</button>`);
    $("#loadMore").addEventListener("click", renderMore);
  }
  // 綁定（只綁新加入的）
  $("#trailList").querySelectorAll(".card:not([data-bound])").forEach(c => {
    c.setAttribute("data-bound", "1");
    c.addEventListener("click", e => {
      if (e.target.closest(".fav-star")) return;
      openDetail(c.dataset.id);
    });
    const star = c.querySelector(".fav-star");
    if (star) star.addEventListener("click", () => {
      const added = Store.toggleFav(star.dataset.fav);
      star.classList.toggle("on", added); star.textContent = added ? "★" : "☆";
      toast(added ? "已加入收藏" : "已移除收藏");
    });
  });
}

// 附近排序
$("#btnNearMe").addEventListener("click", () => {
  if (myLoc) { myLoc = null; $("#btnNearMe").textContent = "📍 附近排序"; render(); return; }
  if (!navigator.geolocation) { toast("此裝置不支援定位"); return; }
  $("#btnNearMe").textContent = "定位中…";
  navigator.geolocation.getCurrentPosition(
    pos => { myLoc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      $("#btnNearMe").textContent = "📍 附近(開)"; render(); toast("已依距離排序"); },
    () => { $("#btnNearMe").textContent = "📍 附近排序"; toast("定位失敗，請允許定位權限"); },
    { enableHighAccuracy: true, timeout: 10000 });
});

// 步道路況/封閉警示橫幅
function fmtYmd(s) { return s && s.length === 8 ? `${s.slice(0, 4)}/${s.slice(4, 6)}/${s.slice(6)}` : s; }
function conditionBanner(t) {
  const c = t.condition;
  if (!c || !c.status) return "";
  const closed = /暫停|封閉|關閉/.test(c.status);
  return `<div class="cond-banner ${closed ? "danger" : "warn"}">
    <div class="cond-h">${closed ? "⛔" : "⚠️"} ${c.status}${c.section ? `（${c.section}）` : ""}</div>
    ${c.title ? `<div class="cond-body">${c.title}</div>` : ""}
    ${c.reopen ? `<div class="cond-meta">預計重新開放：${fmtYmd(c.reopen)}　${c.dep || ""}</div>` : ""}
    <div class="cond-meta">資料來源：林業及自然保育署（請以官方公告為準）</div>
  </div>`;
}

// 詳情頁的分級白話說明（含資料來源註記）
function gradeExplain(t) {
  const g = GRADES[t.difficulty];
  if (!g) return `<div class="grade-note">此步道尚無分級資料。</div>`;
  const basis = t.source === "forestry"
    ? "依林業署官方分級標準"
    : "依步道長度估算（標示「估」，僅供參考）";
  return `<div class="grade-note">
    <b>${t.difficulty}級·${g.name}</b>：${g.plain}
    <div class="grade-note-meta">適合：${g.who}　·　建議裝備：${g.gear}<br>${basis}　·
      <a href="#" id="lnkGradeAll">看完整分級說明</a></div>
  </div>`;
}

// ---------- 詳情面板 ----------
function openDetail(id) {
  const t = TRAILS.find(x => x.id === id);
  if (!t) return;
  const d = t.difficulty || 0;
  // 只列出有資料的欄位（OSM 步道欄位較少，避免顯示空白「—」）
  const kv = [];
  if (t.length_km != null) kv.push(["長度", `${t.length_km} km${t.source === "osm" ? "（估）" : ""}`]);
  if (t.alt_high != null || t.alt_low != null) kv.push(["海拔範圍", `${t.alt_low ?? "?"}–${t.alt_high ?? "?"} m`]);
  if (t.ascent != null) kv.push(["累積爬升", `${Math.round(t.ascent)} m`]);
  if (t.tour) kv.push(["預估時間", t.tour]);
  const kvHtml = kv.length
    ? `<div class="kv">${kv.map(([l, v]) => `<div class="item"><div class="l">${l}</div><div class="v">${v}</div></div>`).join("")}</div>`
    : "";

  const metaBits = [];
  if (t.pave) metaBits.push(`🛤 ${t.pave}`);
  if (t.best_season) metaBits.push(`🍂 ${t.best_season}`);
  if (t.transport?.car) metaBits.push("🚗 可開車");
  if (t.transport?.m_bus || t.transport?.l_bus) metaBits.push("🚌 有公車");
  const metaHtml = metaBits.length
    ? `<div class="item" style="background:var(--bg);border-radius:12px;padding:10px 12px;margin-bottom:12px">
         <div class="l" style="font-size:11.5px;color:var(--ink-soft)">路面・季節・交通</div>
         <div style="font-size:13.5px;margin-top:4px">${metaBits.join("　")}</div></div>`
    : "";

  const nav = t.lat ? `https://www.google.com/maps/dir/?api=1&destination=${t.lat},${t.lon}` : "";
  const moreSearch = `https://www.google.com/search?q=${encodeURIComponent(t.name + " 步道")}`;
  const credit = t.source === "forestry"
    ? "資料來源：林業及自然保育署 開放資料"
    : "資料來源：OpenStreetMap 貢獻者（社群步道，詳細資料有限）";

  $("#detailBody").innerHTML = `
    <h2>${t.name}</h2>
    <div class="badges">
      <span class="badge diff d${d}">難度：${t.difficulty_label}</span>
      ${t.family_friendly ? `<span class="badge family">👨‍👩‍👧 親子友善</span>` : ""}
      <span class="badge ghost">${t.region || ""}</span>
      <button class="fav-star detail${Store.isFav(t.id) ? " on" : ""}" id="favDetail">${Store.isFav(t.id) ? "★ 已收藏" : "☆ 收藏"}</button>
    </div>
    ${conditionBanner(t)}
    ${gradeExplain(t)}
    ${kvHtml}
    ${metaHtml}
    ${t.guide ? `<div class="guide">${t.guide.replace(/\n/g, "<br>")}</div>` : ""}
    <div class="link-row">
      ${nav ? `<a class="link-btn" href="${nav}" target="_blank" rel="noopener">🧭 Google 地圖導航</a>` : ""}
      <a class="link-btn" href="${moreSearch}" target="_blank" rel="noopener">🔍 查更多步道資訊</a>
      ${t.url ? `<a class="link-btn" href="${t.url}" target="_blank" rel="noopener">↗ 官方/原始頁面</a>` : ""}
    </div>
    <button class="btn ghost" id="btnOffline" style="margin-top:10px">⬇️ 預載此步道離線地圖</button>
    <div id="offlineBox" class="offline-box" style="display:none"></div>
    <div class="section-title" style="margin-top:18px">🍜 步道周邊美食</div>
    <div id="foodBox"><div class="food-loading">尋找附近美食中…</div></div>
    <button class="btn primary" id="btnGoRecord">📍 在此步道開始記錄</button>
    <div style="font-size:11px;color:var(--ink-soft);text-align:center;margin-top:14px">${credit}</div>
  `;
  $("#sheetMask").classList.add("show");
  $("#detailSheet").classList.add("show");
  loadFood(t);

  setTimeout(() => {
    if (!detailMap) detailMap = L.map("detailMap", { zoomControl: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      { attribution: "© OpenStreetMap", maxZoom: 18 }).addTo(detailMap);
    detailMap.eachLayer(l => { if (l instanceof L.Marker) detailMap.removeLayer(l); });
    if (t.lat) {
      detailMap.setView([t.lat, t.lon], 14);
      t.entrances.forEach(e => L.marker([e.lat, e.lon]).addTo(detailMap)
        .bindPopup(e.memo || "步道入口"));
    } else {
      detailMap.setView([23.7, 121], 7);
    }
    detailMap.invalidateSize();
  }, 120);

  $("#btnGoRecord").addEventListener("click", () => {
    closeDetail();
    document.querySelector('.tab[data-view="record"]').click();
    $("#recStatus").textContent = `已選擇「${t.name}」，按開始記錄`;
    Recorder._trailName = t.name;
  });
  const lnk = $("#lnkGradeAll");
  if (lnk) lnk.addEventListener("click", e => { e.preventDefault(); openGradeInfo(); });

  const offBtn = $("#btnOffline");
  if (offBtn) offBtn.addEventListener("click", () => downloadOffline(t, offBtn));

  const favD = $("#favDetail");
  if (favD) favD.addEventListener("click", () => {
    const added = Store.toggleFav(t.id);
    favD.classList.toggle("on", added); favD.textContent = added ? "★ 已收藏" : "☆ 收藏";
    toast(added ? "已加入收藏" : "已移除收藏");
  });
}
async function loadFood(t) {
  const box = $("#foodBox");
  if (!box) return;
  if (!t.lat) { box.innerHTML = `<div class="food-empty">此步道無座標，無法查詢周邊美食</div>`; return; }
  try {
    const items = await Food.nearby(t);
    if (!items.length) { box.innerHTML = `<div class="food-empty">附近 10 公里內暫無美食資料（山區步道常見）</div>`; return; }
    box.innerHTML = `<div class="food-list">` + items.map(f => `
      <a class="food-item" href="https://www.openstreetmap.org/?mlat=${f.lat}&mlon=${f.lon}#map=17/${f.lat}/${f.lon}" target="_blank" rel="noopener">
        <span class="food-kind">${f.kind}</span>
        <span class="food-name">${f.name}</span>
        <span class="food-dist">${(f.dist / 1000).toFixed(1)} km</span>
      </a>`).join("") + `</div>
      <div class="food-credit">美食資料來源：OpenStreetMap 貢獻者</div>`;
  } catch {
    box.innerHTML = `<div class="food-empty">美食查詢失敗，請稍後再試</div>`;
  }
}

// 預載此步道範圍的離線地圖圖磚
async function downloadOffline(t, btn) {
  if (!t.lat) { toast("此步道無座標，無法下載地圖"); return; }
  const box = $("#offlineBox");
  const bbox = Offline.bboxFor(t);
  const { zmin, zmax } = Offline.planZoom(bbox);
  const tiles = Offline.tileList(bbox, zmin, zmax);
  box.style.display = "block";
  box.innerHTML = `準備下載約 ${tiles.length} 張圖磚（約 ${(tiles.length * 0.02).toFixed(1)} MB）…`;
  btn.disabled = true; btn.textContent = "下載中…";
  try {
    const r = await Offline.download(tiles, (done, total) => {
      box.innerHTML = `下載離線地圖中… ${done}/${total}
        <div class="offline-bar"><i style="width:${Math.round(done / total * 100)}%"></i></div>`;
    });
    box.innerHTML = `✅ 已下載 ${r.ok}/${r.total} 張圖磚，此步道範圍可離線看地圖了。`;
    btn.textContent = "✓ 已預載離線地圖";
  } catch {
    box.innerHTML = "下載失敗，請確認網路後再試。";
    btn.disabled = false; btn.textContent = "⬇️ 預載此步道離線地圖";
  }
}

function closeDetail() {
  $("#sheetMask").classList.remove("show");
  $("#detailSheet").classList.remove("show");
}
$("#sheetMask").addEventListener("click", closeDetail);

// ---------- 記錄頁 ----------
let guideLine = null;
function initRecMap() {
  if (!recMap) {
    recMap = L.map("recMap", { zoomControl: false }).setView([25.033, 121.564], 15);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(recMap);
    recLine = L.polyline([], { color: "#2f7d4f", weight: 5 }).addTo(recMap);
  }
  recMap.invalidateSize();
}

// 匯入 GPX 路線當參考線
$("#btnImportGpx").addEventListener("click", () => $("#gpxFile").click());
$("#gpxFile").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const pts = GPX.parse(reader.result);
    if (!pts.length) { toast("GPX 沒有可用的路徑點"); return; }
    initRecMap();
    if (guideLine) recMap.removeLayer(guideLine);
    const latlngs = pts.map(p => [p.lat, p.lon]);
    guideLine = L.polyline(latlngs, { color: "#e8893b", weight: 4, dashArray: "8 6", opacity: .9 }).addTo(recMap);
    recMap.fitBounds(guideLine.getBounds(), { padding: [20, 20] });
    toast(`已匯入路線（${pts.length} 點），橘色虛線即參考路徑`);
  };
  reader.readAsText(file);
  e.target.value = "";
});

Recorder.onUpdate(s => {
  $("#stDist").textContent = s.distanceKm.toFixed(2);
  $("#stSteps").textContent = s.steps.toLocaleString();
  $("#stKcal").textContent = s.kcal;
  $("#stTime").textContent = fmtTime(s.elapsedMs);
  $("#stPace").textContent = s.pace;
  if ($("#stElev")) $("#stElev").textContent = `↑${Math.round(s.ascent || 0)} ↓${Math.round(s.descent || 0)}`;
  if (s.error) $("#recStatus").innerHTML = `⚠️ ${s.error}（可改用模擬模式）`;
  else if (s.state === "running") $("#recStatus").innerHTML = `<span class="live">記錄中</span>`;
  else if (s.state === "paused") $("#recStatus").textContent = "已暫停";

  if (s.state === "running" && s.track.length && !recPreloaded) {
    recPreloaded = true;                       // 只在首個定位點觸發一次
    preloadAround(s.track[0].lat, s.track[0].lon);
  }
  if (recLine && s.track.length) {
    const pts = s.track.map(p => [p.lat, p.lon]);
    recLine.setLatLngs(pts);
    const last = pts[pts.length - 1];
    if (!recMarker) recMarker = L.circleMarker(last, { radius: 7, color: "#fff", weight: 3, fillColor: "#e8893b", fillOpacity: 1 }).addTo(recMap);
    recMarker.setLatLng(last);
    if (s.state === "running") recMap.panTo(last);
  }
});

// 開始記錄時，背景預載當前位置周邊圖磚（保險，避免途中失去訊號）
let recPreloaded = false;
async function preloadAround(lat, lon) {
  const m = 0.018;   // 約 ±2km
  const bbox = { n: lat + m, s: lat - m, e: lon + m, w: lon - m };
  const tiles = Offline.tileList(bbox, 14, 16);
  try {
    await Offline.download(tiles, () => {});
    toast(`已預載周邊離線地圖（${tiles.length} 張）`);
  } catch { /* 靜默 */ }
}

function sim() { return $("#simToggle").checked; }
$("#btnStart").addEventListener("click", () => {
  initRecMap();
  if (Recorder.getState() === "paused") Recorder.resume(sim());
  else Recorder.start(sim());
  $("#btnStart").style.display = "none";
  $("#btnPause").style.display = "block";
  $("#btnStop").style.display = "block";
});
$("#btnPause").addEventListener("click", () => {
  Recorder.pause();
  $("#btnStart").textContent = "▶ 繼續";
  $("#btnStart").style.display = "block";
  $("#btnPause").style.display = "none";
});
$("#btnStop").addEventListener("click", () => {
  const rec = Recorder.stop();
  recPreloaded = false;                        // 下次記錄重新預載
  $("#btnStart").textContent = "▶ 開始";
  $("#btnStart").style.display = "block";
  $("#btnPause").style.display = "none";
  $("#btnStop").style.display = "none";
  if (recMarker) { recMap.removeLayer(recMarker); recMarker = null; }
  recLine.setLatLngs([]);
  if (rec) {
    rec.trailName = Recorder._trailName || "自由路線";
    Store.addRecord(rec);
    toast(`已儲存：${rec.distanceKm.toFixed(2)} km / ${rec.steps} 步 / ${rec.kcal} 大卡`);
    $("#recStatus").textContent = "準備就緒，按「開始」記錄路徑";
  } else {
    toast("路徑太短，未儲存");
  }
});

// ---------- 我的 ----------
function loadProfile() {
  const p = Store.getProfile();
  if (p.weight) $("#pfWeight").value = p.weight;
  if (p.height) $("#pfHeight").value = p.height;
}
$("#btnSaveProfile").addEventListener("click", () => {
  Store.saveProfile({ weight: Number($("#pfWeight").value) || 60, height: Number($("#pfHeight").value) || 170 });
  toast("已儲存個人資料");
});
$("#btnClearAll").addEventListener("click", () => {
  if (confirm("確定清除「全部」行程紀錄？此動作無法復原。")) {
    Store.clearRecords();
    renderHistory();
    toast("已清除全部行程");
  }
});

async function refreshOfflineStatus() {
  const el = $("#offlineStatus");
  if (!el) return;
  const n = await Offline.cachedCount();
  el.textContent = n ? `已快取地圖圖磚：${n} 張（約 ${(n * 0.02).toFixed(1)} MB）` : "尚未下載任何離線地圖";
}
$("#btnClearTiles").addEventListener("click", async () => {
  if (confirm("確定清除已下載的離線地圖？")) {
    await Offline.clear();
    refreshOfflineStatus();
    toast("已清除離線地圖");
  }
});

function renderHistory() {
  const recs = Store.getRecords();
  const wrap = $("#historyList");
  const clearBtn = $("#btnClearAll");
  if (clearBtn) clearBtn.style.display = recs.length ? "block" : "none";
  if (!recs.length) { wrap.innerHTML = `<div class="empty"><span class="big">🚶</span>還沒有行程紀錄<br>到「記錄」分頁開始你的第一條路線</div>`; return; }
  wrap.innerHTML = recs.map(r => `
    <div class="hist-card" data-id="${r.id}">
      <div class="top">
        <b>${r.trailName || "自由路線"}</b>
        <span class="date">${new Date(r.date).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <div class="row">
        <span>📏 <b>${r.distanceKm.toFixed(2)}</b> km</span>
        <span>👣 <b>${r.steps.toLocaleString()}</b> 步</span>
        <span>🔥 <b>${r.kcal}</b> 大卡</span>
        <span>⏱ <b>${fmtTime(r.elapsedMs)}</b></span>
      </div>
      <div class="hist-actions">
        <button class="hist-gpx" data-id="${r.id}">⬇️ GPX</button>
        <button class="hist-del" data-id="${r.id}" aria-label="刪除這筆">🗑 刪除</button>
      </div>
    </div>`).join("");
  wrap.querySelectorAll(".hist-del").forEach(b => b.addEventListener("click", () => {
    if (confirm("確定刪除這筆行程紀錄？")) {
      Store.deleteRecord(b.dataset.id);
      renderHistory();
      toast("已刪除");
    }
  }));
  wrap.querySelectorAll(".hist-gpx").forEach(b => b.addEventListener("click", () => {
    const rec = Store.getRecords().find(r => r.id === b.dataset.id);
    if (rec) { GPX.exportRecord(rec); toast("已匯出 GPX"); }
  }));
}

// ---------- 分級說明按鈕 ----------
$("#btnGradeInfo").addEventListener("click", openGradeInfo);
$("#gradeMask").addEventListener("click", closeGradeInfo);

// ---------- 啟動 ----------
buildRegionChips();
render();
loadProfile();
