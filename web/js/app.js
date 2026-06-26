// ===== Trail Tracker 前端主程式 =====
const $ = s => document.querySelector(s);
const TRAILS = window.TRAILS || [];
const SRC_LABEL = { forestry: "林業署", osm: "OSM社群" };
const GRADES = window.GRADES || {};

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
    if (view === "me") renderHistory();
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

function matches(t) {
  if (curRegion !== "all" && t.region !== curRegion) return false;
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
  return `<div class="card" data-id="${t.id}">
    <h3>${t.name}</h3>
    <div class="meta">
      <span>📍 ${t.position || "—"}</span>
      <span><b>${len}</b></span>
      ${asc ? `<span>${asc}</span>` : ""}
      ${t.tour ? `<span>⏱ ${t.tour}</span>` : ""}
    </div>
    <div class="badges">
      <span class="badge diff d${d}">${t.difficulty_label}</span>
      ${t.family_friendly ? `<span class="badge family">👨‍👩‍👧 親子友善</span>` : ""}
      ${t.permit && t.permit !== "無" ? `<span class="badge ghost">需入山證</span>` : ""}
      <span class="badge src">${SRC_LABEL[t.source] || t.source}</span>
    </div>
  </div>`;
}

function render() {
  const list = TRAILS.filter(matches);
  $("#resultCount").textContent = `共 ${list.length} 條步道`;
  $("#trailList").innerHTML = list.length
    ? list.map(trailCard).join("")
    : `<div class="empty"><span class="big">🔍</span>找不到符合的步道</div>`;
  $("#trailList").querySelectorAll(".card").forEach(c =>
    c.addEventListener("click", () => openDetail(c.dataset.id)));
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
  $("#detailBody").innerHTML = `
    <h2>${t.name}</h2>
    <div class="badges">
      <span class="badge diff d${d}">難度：${t.difficulty_label}</span>
      ${t.family_friendly ? `<span class="badge family">👨‍👩‍👧 親子友善</span>` : ""}
      <span class="badge ghost">${t.region || ""}</span>
    </div>
    ${gradeExplain(t)}
    <div class="kv">
      <div class="item"><div class="l">長度</div><div class="v">${t.length_km != null ? t.length_km + " km" : "—"}</div></div>
      <div class="item"><div class="l">海拔範圍</div><div class="v">${t.alt_low ?? "?"}–${t.alt_high ?? "?"} m</div></div>
      <div class="item"><div class="l">累積爬升</div><div class="v">${t.ascent != null ? Math.round(t.ascent) + " m" : "—"}</div></div>
      <div class="item"><div class="l">預估時間</div><div class="v">${t.tour || "—"}</div></div>
    </div>
    <div class="item" style="background:var(--bg);border-radius:12px;padding:10px 12px;margin-bottom:12px">
      <div class="l" style="font-size:11.5px;color:var(--ink-soft)">路面・季節・交通</div>
      <div style="font-size:13.5px;margin-top:4px">🛤 ${t.pave || "—"}　🍂 ${t.best_season || "四季"}　${t.transport?.car ? "🚗 可開車" : ""} ${t.transport?.m_bus || t.transport?.l_bus ? "🚌 有公車" : ""}</div>
    </div>
    ${t.guide ? `<div class="guide">${t.guide}</div>` : ""}
    <div class="section-title" style="margin-top:18px">🍜 步道周邊美食</div>
    <div id="foodBox"><div class="food-loading">尋找附近美食中…</div></div>
    <button class="btn primary" id="btnGoRecord">📍 在此步道開始記錄</button>
    ${t.url ? `<a class="btn ghost" href="${t.url}" target="_blank" rel="noopener" style="text-decoration:none;text-align:center">查看官方頁面 ↗</a>` : ""}
    <div style="font-size:11px;color:var(--ink-soft);text-align:center;margin-top:14px">資料來源：林業及自然保育署 開放資料</div>
  `;
  $("#sheetMask").classList.add("show");
  $("#detailSheet").classList.add("show");
  loadFood(t);

  setTimeout(() => {
    if (!detailMap) detailMap = L.map("detailMap", { zoomControl: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
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
}
async function loadFood(t) {
  const box = $("#foodBox");
  if (!box) return;
  if (!t.lat) { box.innerHTML = `<div class="food-empty">此步道無座標，無法查詢周邊美食</div>`; return; }
  try {
    const items = await Food.nearby(t);
    if (!items.length) { box.innerHTML = `<div class="food-empty">附近 5 公里內暫無美食資料（山區步道常見）</div>`; return; }
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

function closeDetail() {
  $("#sheetMask").classList.remove("show");
  $("#detailSheet").classList.remove("show");
}
$("#sheetMask").addEventListener("click", closeDetail);

// ---------- 記錄頁 ----------
function initRecMap() {
  if (!recMap) {
    recMap = L.map("recMap", { zoomControl: false }).setView([25.033, 121.564], 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(recMap);
    recLine = L.polyline([], { color: "#2f7d4f", weight: 5 }).addTo(recMap);
  }
  recMap.invalidateSize();
}

Recorder.onUpdate(s => {
  $("#stDist").textContent = s.distanceKm.toFixed(2);
  $("#stSteps").textContent = s.steps.toLocaleString();
  $("#stKcal").textContent = s.kcal;
  $("#stTime").textContent = fmtTime(s.elapsedMs);
  $("#stPace").textContent = s.pace;
  if (s.error) $("#recStatus").innerHTML = `⚠️ ${s.error}（可改用模擬模式）`;
  else if (s.state === "running") $("#recStatus").innerHTML = `<span class="live">記錄中</span>`;
  else if (s.state === "paused") $("#recStatus").textContent = "已暫停";

  if (recLine && s.track.length) {
    const pts = s.track.map(p => [p.lat, p.lon]);
    recLine.setLatLngs(pts);
    const last = pts[pts.length - 1];
    if (!recMarker) recMarker = L.circleMarker(last, { radius: 7, color: "#fff", weight: 3, fillColor: "#e8893b", fillOpacity: 1 }).addTo(recMap);
    recMarker.setLatLng(last);
    if (s.state === "running") recMap.panTo(last);
  }
});

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

function renderHistory() {
  const recs = Store.getRecords();
  const wrap = $("#historyList");
  if (!recs.length) { wrap.innerHTML = `<div class="empty"><span class="big">🚶</span>還沒有行程紀錄<br>到「記錄」分頁開始你的第一條路線</div>`; return; }
  wrap.innerHTML = recs.map(r => `
    <div class="hist-card">
      <div class="top"><b>${r.trailName || "自由路線"}</b><span class="date">${new Date(r.date).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>
      <div class="row">
        <span>📏 <b>${r.distanceKm.toFixed(2)}</b> km</span>
        <span>👣 <b>${r.steps.toLocaleString()}</b> 步</span>
        <span>🔥 <b>${r.kcal}</b> 大卡</span>
        <span>⏱ <b>${fmtTime(r.elapsedMs)}</b></span>
      </div>
    </div>`).join("");
}

// ---------- 分級說明按鈕 ----------
$("#btnGradeInfo").addEventListener("click", openGradeInfo);
$("#gradeMask").addEventListener("click", closeGradeInfo);

// ---------- 啟動 ----------
buildRegionChips();
render();
loadProfile();
