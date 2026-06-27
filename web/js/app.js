// ===== Trail Tracker 前端主程式 =====
const $ = s => document.querySelector(s);
const TRAILS = window.TRAILS || [];
const SRC_LABEL = { forestry: "林業署", osm: "OSM社群", osm_path: "OSM社群" };
const GRADES = window.GRADES || {};
const geoOf = t => (window.TRAILS_GEO || {})[t.id] || null;   // 路線幾何（延遲載入檔）
// 幾何檔 1.4MB：首屏不載，等真正需要（看詳情/地圖/記錄/篩選有路線）才抓，列表瀏覽更快
let _geoPromise = null;
function ensureGeo() {
  if (window.TRAILS_GEO) return Promise.resolve();
  if (_geoPromise) return _geoPromise;
  _geoPromise = new Promise(resolve => {
    const s = document.createElement("script");
    s.src = "js/trails-geo.js";
    s.onload = () => resolve();
    s.onerror = () => resolve();   // 失敗也放行，退化為「無路線」
    document.head.appendChild(s);
  });
  return _geoPromise;
}
// 骨架卡（載入占位）
function skelCards(n) {
  return `<div class="skel-list">${Array.from({ length: n }, () =>
    `<div class="skel-card"><div class="skel skel-line w60"></div><div class="skel skel-line w90"></div></div>`).join("")}</div>`;
}
// 元素滑進詳情面板可視範圍時觸發一次（延遲耗額度的 Places 查詢）
let _detailObs = [];
function clearDetailObs() { _detailObs.forEach(o => o.disconnect()); _detailObs = []; }
function whenVisible(el, cb) {
  if (!el) return;
  const root = document.getElementById("detailSheet");
  const io = new IntersectionObserver(es => {
    if (es.some(e => e.isIntersecting)) { io.disconnect(); cb(); }
  }, { root, rootMargin: "120px" });
  io.observe(el); _detailObs.push(io);
}

// 行內 SVG 線性圖示集（取代 emoji，視覺更一致）
const ICON = {
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  ruler: '<path d="M3 8.5 15.5 21 21 15.5 8.5 3 3 8.5Z"/><path d="m7 7 1.5 1.5M10 10l1.5 1.5M13 13l1.5 1.5"/>',
  up: '<path d="M5 19h14"/><path d="m7 14 5-7 5 7"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.2 5-5 2.2 2.2-5 5-2.2Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"/>',
  mountain: '<path d="m3 19 6-11 4 7 2-3 6 7H3Z"/>',
  food: '<path d="M5 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M19 3c-1.5 0-3 1.5-3 4v5h3V3Z"/>',
  landmark: '<path d="M3 21h18M5 21V10M19 21V10M9 21v-7h6v7M12 3 4 8h16l-8-5Z"/>',
};
function ic(name, cls) { return `<svg class="ic${cls ? " " + cls : ""}" viewBox="0 0 24 24">${ICON[name] || ""}</svg>`; }

// 分類標籤（由名稱/資料推導）
function tagsOf(t) {
  const n = t.name || "", g = [];
  if (/古道/.test(n)) g.push("古道");
  if (/瀑布/.test(n)) g.push("瀑布");
  if (/(海|濱|岬|灣|燈塔|岩岸|漁港)/.test(n)) g.push("海景");
  if (/(森林|林道|神木|巨木|杉林)/.test(n)) g.push("森林");
  if (/(湖|潭|埤|池)/.test(n)) g.push("湖泊");
  if (/(溫泉|泉)/.test(n)) g.push("溫泉");
  if (/環/.test(n)) g.push("環狀");
  if (t.family_friendly) g.push("親子");
  if (t.difficulty === 0) g.push("無障礙");
  if (t.difficulty >= 4) g.push("挑戰級");
  return g;
}
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
  $("#gradeSheet").scrollTop = 0;                 // 浮到最上層並回到頂部
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
let detailMap, detailOverlay, recMap, recLine, recMarker;
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    btn.classList.add("active");
    const view = btn.dataset.view;
    $("#view-" + view).classList.add("active");
    if (view === "record") {
      // 從底部分頁進入＝自由記錄，清掉先前選定步道的路線疊圖
      selectedTrailGeo = null;
      if (routeRefLayer && recMap) { recMap.removeLayer(routeRefLayer); routeRefLayer = null; }
      ensureGeo();                       // 預載幾何，供模擬挑步道/疊圖用
      setTimeout(initRecMap, 60);
    }
    if (view === "me") { renderHistory(); refreshOfflineStatus(); }
  });
});

// ---------- 探索：篩選與列表 ----------
// 複選：同類用 OR、跨類用 AND；「全部」＝清空該類；再按一次取消
let activeFilters = new Set();   // fav, done, family, d1..d45, tag:*
let activeRegions = new Set();   // 地區（可複選）
let curQuery = "";

function syncFilterUI() {
  const none = activeFilters.size === 0;
  document.querySelectorAll("[data-filter]").forEach(c =>
    c.classList.toggle("active", c.dataset.filter === "all" ? none : activeFilters.has(c.dataset.filter)));
}
function syncRegionUI() {
  const none = activeRegions.size === 0;
  document.querySelectorAll("[data-region]").forEach(c =>
    c.classList.toggle("active", c.dataset.region === "all" ? none : activeRegions.has(c.dataset.region)));
}
function toggleFilter(val) {
  if (val === "all") activeFilters.clear();
  else if (activeFilters.has(val)) activeFilters.delete(val);
  else activeFilters.add(val);
  syncFilterUI(); updateFilterDot(); render();
}
function toggleRegion(val) {
  if (val === "all") activeRegions.clear();
  else if (activeRegions.has(val)) activeRegions.delete(val);
  else activeRegions.add(val);
  syncRegionUI(); updateFilterDot(); render();
}
function setSort(val) {
  curSort = (curSort === val) ? "default" : val;     // 再按一次取消（回預設）
  document.querySelectorAll("[data-sort]").forEach(c => c.classList.toggle("active", c.dataset.sort === curSort));
  updateFilterDot(); render();
}
// 進階篩選啟用數量 → 篩選鈕上的小紅點
function updateFilterDot() {
  let n = activeFilters.size + activeRegions.size;
  if (curSort !== "default") n++;
  if (filterOpen) n++;
  if (filterGeo) n++;
  const dot = $("#filterDot"), btn = $("#btnFilter");
  if (dot) { dot.style.display = n ? "grid" : "none"; dot.textContent = n; }
  if (btn) btn.classList.toggle("active", n > 0);
  const fc = $("#fsCount"); if (fc) fc.textContent = curList ? curList.length : "";
}

// 精選主題輯：點一下套用一組篩選，快速探索
const COLLECTIONS = [
  { t: "親子友善", s: "輕鬆好走帶小孩", f: ["family"], bg: "linear-gradient(135deg,#3f7a55,#2c5d3f)" },
  { t: "古道巡禮", s: "走進歷史與人文", f: ["tag:古道"], bg: "linear-gradient(135deg,#a06a3d,#7c4f2c)" },
  { t: "瀑布秘境", s: "清涼水景路線", f: ["tag:瀑布"], bg: "linear-gradient(135deg,#2f7e8c,#1f5a66)" },
  { t: "海岸線", s: "看海聽濤", f: ["tag:海景"], bg: "linear-gradient(135deg,#3b6ea5,#274d77)" },
  { t: "森林浴", s: "芬多精滿載", f: ["tag:森林"], bg: "linear-gradient(135deg,#4a8f55,#2f6b3a)" },
  { t: "湖泊倒影", s: "靜謐水畔", f: ["tag:湖泊"], bg: "linear-gradient(135deg,#3c7a8c,#285a69)" },
  { t: "輕鬆入門", s: "第一次健行", f: ["d1"], bg: "linear-gradient(135deg,#5aa06a,#3c7a4f)" },
  { t: "挑戰級", s: "進階者專屬", f: ["d45"], bg: "linear-gradient(135deg,#c2683d,#9a4f2c)" },
];
function buildCollections() {
  const box = $("#collections");
  if (!box) return;
  box.innerHTML = COLLECTIONS.map((c, i) =>
    `<button class="coll-card" data-coll="${i}" style="background:${c.bg}">
       <span class="coll-t">${c.t}</span><span class="coll-s">${c.s}</span></button>`).join("");
  box.querySelectorAll(".coll-card").forEach(b => b.addEventListener("click", () => {
    const c = COLLECTIONS[+b.dataset.coll];
    activeFilters = new Set(c.f); activeRegions.clear(); curQuery = ""; $("#searchInput").value = "";
    syncFilterUI(); syncRegionUI(); updateFilterDot(); render();
    $("#trailList").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}
// 預設瀏覽（無任何篩選/搜尋）才顯示精選輯，避免雜亂
function updateCollections() {
  const box = $("#collections");
  if (!box) return;
  const none = activeFilters.size === 0 && activeRegions.size === 0 && !curQuery && !mapOn;
  box.style.display = none ? "flex" : "none";
}

function buildFsRegion() {
  const regions = [...new Set(TRAILS.map(t => t.region).filter(Boolean))].sort();
  $("#fsRegion").innerHTML = `<button class="chip active" data-region="all">全部</button>` +
    regions.map(r => `<button class="chip" data-region="${r}">${r}</button>`).join("");
}

// 主列 + 篩選面板的難度/主題 chips（共用 data-filter，複選切換）
document.querySelectorAll("[data-filter]").forEach(c =>
  c.addEventListener("click", () => toggleFilter(c.dataset.filter)));
// 篩選面板事件委派（地區/排序）
$("#filterSheet").addEventListener("click", e => {
  const r = e.target.closest("[data-region]"); if (r) return toggleRegion(r.dataset.region);
  const s = e.target.closest("[data-sort]"); if (s) return setSort(s.dataset.sort);
});
$("#fsOpen").addEventListener("click", () => { filterOpen = !filterOpen; $("#fsOpen").classList.toggle("active", filterOpen); updateFilterDot(); render(); });
$("#fsGeo").addEventListener("click", () => {
  filterGeo = !filterGeo; $("#fsGeo").classList.toggle("active", filterGeo);
  if (filterGeo) ensureGeo().then(() => { updateFilterDot(); render(); });
  else { updateFilterDot(); render(); }
});
$("#fsGrade").addEventListener("click", openGradeInfo);
$("#fsReset").addEventListener("click", () => {
  filterOpen = false; filterGeo = false;
  $("#fsOpen").classList.remove("active"); $("#fsGeo").classList.remove("active");
  activeFilters.clear(); activeRegions.clear(); curSort = "default";
  syncFilterUI(); syncRegionUI();
  document.querySelectorAll("[data-sort]").forEach(c => c.classList.toggle("active", c.dataset.sort === "default"));
  updateFilterDot(); render();
});
$("#btnFilter").addEventListener("click", () => { updateFilterDot(); $("#filterMask").classList.add("show"); $("#filterSheet").classList.add("show"); });
function closeFilter() { $("#filterMask").classList.remove("show"); $("#filterSheet").classList.remove("show"); }
$("#filterMask").addEventListener("click", closeFilter);
$("#closeFilterBtn").addEventListener("click", closeFilter);
$("#fsApply").addEventListener("click", closeFilter);

let _searchTm;
$("#searchInput").addEventListener("input", e => {
  curQuery = e.target.value.trim();
  clearTimeout(_searchTm); _searchTm = setTimeout(render, 180);   // 防抖，打字更順
});

// 檢視模式：列表 / 地圖（分段控制）
document.querySelectorAll(".seg-btn[data-mode]").forEach(b => b.addEventListener("click", () => {
  const map = b.dataset.mode === "map";
  document.querySelectorAll(".seg-btn[data-mode]").forEach(x => x.classList.toggle("on", x === b));
  mapOn = map;
  $("#browseMap").style.display = map ? "block" : "none";
  $("#trailList").style.display = map ? "none" : "block";
  if (map) showBrowseMap(); else render();
}));

let myLoc = null;       // 使用者位置（附近排序用）
let pageSize = 60, shown = 0, curList = [];

let curSort = "default", filterOpen = false, filterGeo = false;
function isClosed(t) { return t.condition && /暫停|封閉|關閉/.test(t.condition.status || ""); }
function matchDiff(f, t) { return f === "d45" ? t.difficulty >= 4 : t.difficulty === +f.slice(1); }
function matches(t) {
  // 地區（複選 OR）
  if (activeRegions.size && !activeRegions.has(t.region)) return false;
  if (filterOpen && isClosed(t)) return false;
  if (filterGeo && !geoOf(t)) return false;
  // 旗標（各自 AND）
  if (activeFilters.has("fav") && !Store.isFav(t.id)) return false;
  if (activeFilters.has("done") && !Store.trailLog(t.id).done) return false;
  if (activeFilters.has("family") && !t.family_friendly) return false;
  // 難度（複選 OR）
  const diffs = [...activeFilters].filter(f => /^d\d/.test(f));
  if (diffs.length && !diffs.some(f => matchDiff(f, t))) return false;
  // 主題標籤（複選 OR）
  const tags = [...activeFilters].filter(f => f.startsWith("tag:")).map(f => f.slice(4));
  if (tags.length) { const tt = tagsOf(t); if (!tags.some(g => tt.includes(g))) return false; }
  if (curQuery) {
    const q = curQuery.toLowerCase().replace(/\s+/g, "");
    const hay = `${t.name} ${t.position || ""} ${t.region || ""} ${t.system || ""} ${tagsOf(t).join("")}`
      .toLowerCase().replace(/\s+/g, "");
    if (!hay.includes(q)) return false;
  }
  return true;
}

function trailCard(t) {
  const d = t.difficulty || 0;
  const len = t.length_km != null ? `${t.length_km} km` : "—";
  const asc = t.ascent != null ? `${Math.round(t.ascent)} m` : "";
  const dist = (myLoc && t.lat) ? `<span>${ic("compass")}${(haversine(myLoc, { lat: t.lat, lon: t.lon }) / 1000).toFixed(1)} km</span>` : "";
  const closed = t.condition && /暫停|封閉|關閉/.test(t.condition.status || "");
  // 陡度條：每公里爬升（≈400 m/km 視為極陡）
  let slope = "";
  if (t.ascent != null && t.length_km) {
    const w = Math.max(6, Math.min(100, Math.round(t.ascent / t.length_km / 4)));
    slope = `<div class="slope-row"><span class="slope-label">陡度</span><div class="slope-bar"><i style="width:${w}%"></i></div></div>`;
  }
  return `<div class="card" data-id="${t.id}">
    <button class="fav-star${Store.isFav(t.id) ? " on" : ""}" data-fav="${t.id}" aria-label="收藏 ${t.name}">${Store.isFav(t.id) ? "★" : "☆"}</button>
    <h3>${t.name}</h3>
    <div class="meta">
      <span>${ic("pin")}${t.position || "—"}</span>
      <span>${ic("ruler")}<b>${len}</b></span>
      ${asc ? `<span>${ic("up")}${asc}</span>` : ""}
      ${t.tour ? `<span>${ic("clock")}${t.tour}</span>` : ""}
      ${dist}
    </div>
    <div class="badges">
      <span class="badge diff d${d}"><span class="lvl">${d}</span>${t.difficulty_label}</span>
      ${Store.trailLog(t.id).done ? `<span class="badge done">✓ 已完成</span>` : ""}
      ${closed ? `<span class="badge closed">⚠️ ${t.condition.status}</span>` : ""}
      ${t.family_friendly ? `<span class="badge family">親子友善</span>` : ""}
      ${t.permit && t.permit !== "無" ? `<span class="badge ghost">需入山證</span>` : ""}
      <span class="badge src">${SRC_LABEL[t.source] || t.source}</span>
    </div>
    ${slope}
  </div>`;
}

function render() {
  curList = TRAILS.filter(matches);
  if (myLoc) curList.sort((a, b) =>
    (a.lat ? haversine(myLoc, { lat: a.lat, lon: a.lon }) : 9e9) -
    (b.lat ? haversine(myLoc, { lat: b.lat, lon: b.lon }) : 9e9));
  else if (curSort !== "default") {
    const ln = t => t.length_km == null ? 9e9 : t.length_km;
    const df = t => t.difficulty == null ? 99 : t.difficulty;
    const cmp = {
      "length-asc": (a, b) => ln(a) - ln(b), "length-desc": (a, b) => ln(b) - ln(a),
      "diff-asc": (a, b) => df(a) - df(b), "diff-desc": (a, b) => df(b) - df(a),
      "name": (a, b) => a.name.localeCompare(b.name, "zh-Hant"),
    }[curSort];
    if (cmp) curList.sort(cmp);
  }
  $("#resultCount").textContent = `共 ${curList.length} 條步道`;
  updateFilterDot();
  updateCollections();
  if (mapOn) { showBrowseMap(); return; }
  shown = 0;
  if (_io) _io.disconnect();
  $("#trailList").innerHTML = "";
  if (!curList.length) {
    $("#trailList").innerHTML = `<div class="empty"><span class="big">🥾</span>找不到符合的步道<br>
      <span style="font-size:12.5px">試試清除篩選或換個關鍵字</span><br>
      <button class="chip" style="margin-top:14px" onclick="document.getElementById('fsReset').click()">清除所有篩選</button></div>`;
    return;
  }
  renderMore();
}

let _io = null;
function ensureObserver() {
  if (!_io) _io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) renderMore(); }, { rootMargin: "700px" });
  return _io;
}
function bindCards() {
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
      if (added) { star.classList.remove("pop"); void star.offsetWidth; star.classList.add("pop"); }
      toast(added ? "已加入收藏" : "已移除收藏");
    });
  });
}
function renderMore() {
  const slice = curList.slice(shown, shown + pageSize);
  $("#trailList").insertAdjacentHTML("beforeend", slice.map(trailCard).join(""));
  shown += slice.length;
  bindCards();
  if (_io) _io.disconnect();
  const old = $("#listSentinel"); if (old) old.remove();
  if (shown < curList.length) {                       // 無限捲動：哨兵進入視窗即續載
    $("#trailList").insertAdjacentHTML("beforeend", `<div id="listSentinel" style="height:1px"></div>`);
    ensureObserver().observe($("#listSentinel"));
  }
}

// 地圖瀏覽模式
let browseMap = null, browseLayer = null, mapOn = false;
const DIFF_COLOR = { 0: "#3aa3a0", 1: "#46a24f", 2: "#6aa83e", 3: "#d8a127", 4: "#e07a2c", 5: "#d2542e", 6: "#b3322a" };
function showBrowseMap() {
  if (!browseMap) {
    browseMap = L.map("browseMap", { zoomControl: true }).setView([23.8, 121], 7);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      { attribution: "© OpenStreetMap", maxZoom: 18 }).addTo(browseMap);
    // 圖釘叢集：縮放時聚合，全台上千點也順暢
    browseLayer = (typeof L.markerClusterGroup === "function")
      ? L.markerClusterGroup({ maxClusterRadius: 50, chunkedLoading: true })
      : L.layerGroup();
    browseMap.addLayer(browseLayer);
    // 難度色彩圖例
    const lg = L.control({ position: "bottomright" });
    lg.onAdd = () => {
      const d = L.DomUtil.create("div", "map-legend");
      const rows = [[1, "輕鬆"], [2, "一般"], [3, "進階"], [4, "挑戰"], [5, "困難"]]
        .map(([n, l]) => `<span><i style="background:${DIFF_COLOR[n]}"></i>${l}</span>`).join("");
      d.innerHTML = `<b>難度</b>${rows}<span><i style="background:#b3322a"></i>封閉</span>`;
      return d;
    };
    lg.addTo(browseMap);
  }
  browseLayer.clearLayers();
  const list = curList.slice(0, 1500);   // 叢集後可放更多
  const bounds = [];
  list.forEach(t => {
    if (!t.lat) return;
    const closed = t.condition && /暫停|封閉|關閉/.test(t.condition.status || "");
    const mk = L.circleMarker([t.lat, t.lon], {
      radius: 6, color: "#fff", weight: 1.5,
      fillColor: closed ? "#b3322a" : (DIFF_COLOR[t.difficulty] || "#888"), fillOpacity: .92,
    }).addTo(browseLayer);
    const safeName = t.name.replace(/[<>&]/g, "");
    mk.bindPopup(`<b>${safeName}</b><br>${t.difficulty_label}${t.length_km ? " · " + t.length_km + "km" : ""}${closed ? "<br>⚠️ " + t.condition.status : ""}<br><a href="#" class="popup-go">查看詳情</a>`);
    mk.on("popupopen", e => {
      const a = e.popup.getElement().querySelector(".popup-go");
      if (a) a.addEventListener("click", ev => { ev.preventDefault(); openDetail(t.id); });
    });
    bounds.push([t.lat, t.lon]);
  });
  setTimeout(() => { browseMap.invalidateSize(); if (bounds.length) browseMap.fitBounds(bounds, { padding: [30, 30] }); }, 80);
}

// 附近排序
$("#btnNearMe").addEventListener("click", () => {
  const btn = $("#btnNearMe");
  if (myLoc) { myLoc = null; btn.classList.remove("active"); render(); toast("已關閉附近排序"); return; }
  if (!navigator.geolocation) { toast("此裝置不支援定位"); return; }
  toast("定位中…");
  navigator.geolocation.getCurrentPosition(
    pos => { myLoc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      btn.classList.add("active"); render(); toast("已依距離排序"); },
    () => { toast("定位失敗，請允許定位權限"); },
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

// 我的步記區塊
function myLogHtml(t) {
  const lg = Store.trailLog(t.id);
  const stars = [1, 2, 3, 4, 5].map(n => `<span class="rate-star${(lg.rating || 0) >= n ? " on" : ""}" data-r="${n}">★</span>`).join("");
  return `<div class="mylog">
    <div class="section-title" style="margin-top:16px">📒 我的步記</div>
    <button class="btn ghost logdone${lg.done ? " done" : ""}" id="logDone">${lg.done ? "✓ 已完成這條步道" : "標記為已完成"}</button>
    <div class="rate-row">我的評分 <span class="rate-stars" id="rateStars">${stars}</span></div>
    <textarea id="logNote" class="log-note" placeholder="寫點筆記（自動儲存）…">${(lg.note || "").replace(/</g, "&lt;")}</textarea>
  </div>`;
}

// ---------- 詳情面板 ----------
async function openDetail(id) {
  const t = TRAILS.find(x => x.id === id);
  if (!t) return;
  clearDetailObs();
  // 先開面板給回饋，再（首次）載入幾何
  $("#detailHero").innerHTML = "";
  $("#detailBody").innerHTML = `<div style="padding:54px 20px;text-align:center;color:var(--ink-soft)"><span class="spin"></span>載入中…</div>`;
  $("#sheetMask").classList.add("show");
  $("#detailSheet").classList.add("show");
  $("#detailSheet").scrollTop = 0;
  await ensureGeo();
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

  $("#detailHero").innerHTML = `
    <div class="detail-hero noimg" id="heroWrap">
      <div class="hero-cap">
        <h2>${t.name}</h2>
        <div class="badges">
          <span class="badge diff d${d}"><span class="lvl">${d}</span>${t.difficulty_label}</span>
          ${t.family_friendly ? `<span class="badge family">親子友善</span>` : ""}
          <span class="badge ghost">${t.region || ""}</span>
          <button class="fav-star detail${Store.isFav(t.id) ? " on" : ""}" id="favDetail">${Store.isFav(t.id) ? "★ 已收藏" : "☆ 收藏"}</button>
        </div>
      </div>
    </div>`;
  $("#detailBody").innerHTML = `
    ${conditionBanner(t)}
    ${tagsOf(t).length ? `<div class="tag-row">${tagsOf(t).map(g => `<span class="tag">${g}</span>`).join("")}</div>` : ""}
    ${gradeExplain(t)}
    ${kvHtml}
    <div class="section-title">${ic("sun")}天氣（步道所在地）</div>
    <div id="weatherBox"><div class="food-loading"><span class="spin"></span>查詢天氣中…</div></div>
    ${metaHtml}
    ${geoOf(t) ? `<div class="section-title">${ic("mountain")}海拔剖面</div><div id="profileBox"><div class="food-loading"><span class="spin"></span>計算海拔剖面中…</div></div>` : ""}
    ${t.guide ? `<div class="guide">${t.guide.replace(/\n/g, "<br>")}</div>` : ""}
    <div class="link-row">
      ${nav ? `<a class="link-btn" href="${nav}" target="_blank" rel="noopener">🧭 Google 地圖導航</a>` : ""}
      <a class="link-btn" href="${moreSearch}" target="_blank" rel="noopener">🔍 查更多步道資訊</a>
      <button class="link-btn" id="btnShareTrail">↗ 分享步道</button>
      ${t.url ? `<a class="link-btn" href="${t.url}" target="_blank" rel="noopener">↗ 官方/原始頁面</a>` : ""}
    </div>
    ${myLogHtml(t)}
    <button class="btn ghost" id="btnOffline" style="margin-top:10px">⬇️ 預載此步道離線地圖</button>
    <div id="offlineBox" class="offline-box" style="display:none"></div>
    <div id="amenBox" class="amen-box"></div>
    <div class="section-title">${ic("landmark")}附近人文景點</div>
    <div id="poiBox">${skelCards(3)}</div>
    <div class="section-title">${ic("food")}步道周邊美食</div>
    <div id="foodBox">${skelCards(3)}</div>
    <button class="btn primary" id="btnGoRecord">${ic("pin")}在此步道開始記錄</button>
    <div style="font-size:11px;color:var(--ink-soft);text-align:center;margin-top:14px">${credit}</div>
  `;
  loadPhoto(t);
  loadWeather(t);
  loadElevation(t);
  // Places 查詢（設施/美食/景點）較耗額度 → 滑到該區塊才查，省 Google 每日配額
  whenVisible($("#amenBox"), () => loadAmenities(t));
  whenVisible($("#poiBox"), () => loadAttractions(t));
  whenVisible($("#foodBox"), () => loadFood(t));

  setTimeout(() => {
    if (!detailMap) {
      detailMap = L.map("detailMap", { zoomControl: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        { attribution: "© OpenStreetMap", maxZoom: 18 }).addTo(detailMap);
      detailOverlay = L.layerGroup().addTo(detailMap);
    }
    detailOverlay.clearLayers();
    const geom = geoOf(t);
    if (geom && geom.length) {
      const lines = geom.map(seg => L.polyline(seg, { color: "#d2542e", weight: 4, opacity: .9 }));
      lines.forEach(l => l.addTo(detailOverlay));
      // #8 起點/終點標示（用最長段的端點；判斷環狀）
      const main = geom.reduce((a, b) => (b.length > a.length ? b : a), geom[0]);
      const start = main[0], end = main[main.length - 1];
      const loop = haversine({ lat: start[0], lon: start[1] }, { lat: end[0], lon: end[1] }) < 120;
      L.circleMarker(start, { radius: 7, color: "#fff", weight: 2, fillColor: "#2f7d4f", fillOpacity: 1 })
        .addTo(detailOverlay).bindPopup(loop ? "起／終點（環狀）" : "起點");
      if (!loop) L.circleMarker(end, { radius: 7, color: "#fff", weight: 2, fillColor: "#d2542e", fillOpacity: 1 })
        .addTo(detailOverlay).bindPopup("終點");
      const grp = L.featureGroup(lines);
      detailMap.fitBounds(grp.getBounds(), { padding: [20, 20] });
    } else if (t.lat) {
      detailMap.setView([t.lat, t.lon], 14);
      t.entrances.forEach(e => L.marker([e.lat, e.lon]).addTo(detailOverlay).bindPopup(e.memo || "步道入口"));
    } else {
      detailMap.setView([23.7, 121], 7);
    }
    detailMap.invalidateSize();
  }, 120);

  $("#btnGoRecord").addEventListener("click", () => {
    closeDetail();
    const g = geoOf(t), nm = t.name;
    document.querySelector('.tab[data-view="record"]').click();   // 會先清空 selectedTrailGeo
    selectedTrailGeo = g;                    // #9 再設定本步道路線（供疊圖與偏離判斷）
    Recorder._trailName = nm;
    $("#recStatus").textContent = `已選擇「${nm}」，按開始記錄`;
    setTimeout(() => { initRecMap(); drawSelectedRoute(); }, 80);
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

  // 我的步記
  const logDone = $("#logDone");
  if (logDone) logDone.addEventListener("click", () => {
    const done = !Store.trailLog(t.id).done;
    Store.setTrailLog(t.id, { done });
    logDone.classList.toggle("done", done);
    logDone.textContent = done ? "✓ 已完成這條步道" : "標記為已完成";
    toast(done ? "已標記完成 🎉" : "已取消完成");
  });
  $("#rateStars") && $("#rateStars").querySelectorAll(".rate-star").forEach(st =>
    st.addEventListener("click", () => {
      const r = +st.dataset.r;
      Store.setTrailLog(t.id, { rating: r });
      $("#rateStars").querySelectorAll(".rate-star").forEach(s => s.classList.toggle("on", +s.dataset.r <= r));
      toast(`已評 ${r} 星`);
    }));
  const note = $("#logNote");
  if (note) note.addEventListener("input", () => {
    clearTimeout(note._tm); note._tm = setTimeout(() => Store.setTrailLog(t.id, { note: note.value }), 600);
  });

  // 分享步道（含深連結 ?trail=id）
  const shareT = $("#btnShareTrail");
  if (shareT) shareT.addEventListener("click", () => {
    const url = `${location.origin}${location.pathname}?trail=${encodeURIComponent(t.id)}`;
    const text = `${t.name}（${t.difficulty_label}${t.length_km ? " · " + t.length_km + "km" : ""}）— 步道誌`;
    if (navigator.share) navigator.share({ title: t.name, text, url }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast("步道連結已複製"));
    else window.open(url, "_blank");
  });
}
async function loadAmenities(t) {
  const box = $("#amenBox");
  if (!box) return;
  try {
    const items = await Amenities.nearby(t);
    if (!items || !items.length) { box.style.display = "none"; return; }
    box.innerHTML = `<div class="amen-row">` + items.map(a =>
      `<span class="amen"><b>${a.label}</b> ${(a.dist / 1000).toFixed(1)}km</span>`).join("") + `</div>`;
  } catch { box.style.display = "none"; }
}

async function loadPhoto(t) {
  const hero = $("#heroWrap");
  if (!hero) return;
  try {
    const url = await Photos.forTrail(t);
    if (!url) return;                                   // 無照片：保留漸層等高線底
    const img = new Image();
    img.className = "";
    img.alt = t.name;
    img.onload = () => {
      hero.classList.remove("noimg");
      hero.insertAdjacentHTML("afterbegin", `<div class="hero-credit">Wikimedia Commons</div>`);
      hero.insertBefore(img, hero.firstChild);
      requestAnimationFrame(() => img.classList.add("loaded"));
    };
    img.src = url;
  } catch { /* 無照片就維持漸層底 */ }
}

async function loadElevation(t) {
  const box = $("#profileBox");
  if (!box) return;
  try {
    const p = await Profile.build(t.id, geoOf(t));
    if (!p) { box.style.display = "none"; return; }
    box.innerHTML = `<div class="profile-wrap" id="profWrap">${p.svg}
        <div class="prof-cursor" id="profCursor"></div><div class="prof-tip" id="profTip"></div></div>
      <div class="profile-stat">最低 ${p.min}m　最高 ${p.max}m　累積爬升 ↑${p.gain}m　全長約 ${p.distKm.toFixed(1)}km</div>
      <div class="profile-legend"><span style="color:#4a8f55">●</span>緩　<span style="color:#c39327">●</span>中　<span style="color:#c0542f">●</span>陡　<span style="color:var(--ink-faint)">·滑過看各點海拔</span></div>`;
    // 滑過/觸控顯示該點距離與海拔
    const wrap = $("#profWrap"), cur = $("#profCursor"), tip = $("#profTip");
    const move = clientX => {
      const r = wrap.getBoundingClientRect();
      const svgX = Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * p.W;
      let best = p.samples[0];
      for (const s of p.samples) if (Math.abs(s.x - svgX) < Math.abs(best.x - svgX)) best = s;
      const pct = best.x / p.W * 100;
      cur.style.left = pct + "%"; cur.style.display = "block";
      tip.style.left = pct + "%"; tip.style.display = "block";
      tip.textContent = `${best.d.toFixed(2)}km · ${best.e}m`;
    };
    wrap.addEventListener("pointermove", e => move(e.clientX));
    wrap.addEventListener("pointerdown", e => move(e.clientX));
    wrap.addEventListener("pointerleave", () => { cur.style.display = "none"; tip.style.display = "none"; });
  } catch {
    box.innerHTML = `<div class="food-empty">海拔剖面計算失敗（需網路）</div>`;
  }
}

async function loadWeather(t) {
  const box = $("#weatherBox");
  if (!box) return;
  if (!t.lat) { box.innerHTML = `<div class="food-empty">無座標，無法查天氣</div>`; return; }
  try {
    const d = await Weather.get(t.lat, t.lon);
    const c = d.current, dd = d.daily;
    const [emo, txt] = Weather.desc(c.weather_code);
    const days = ["日", "一", "二", "三", "四", "五", "六"];
    const fc = dd.time.map((t2, i) => {
      const [e2] = Weather.desc(dd.weather_code[i]);
      const wd = i === 0 ? "今天" : `週${days[new Date(t2).getDay()]}`;
      return `<div class="wx-day"><div class="wx-d">${wd}</div><div class="wx-e">${e2}</div>
        <div class="wx-t">${Math.round(dd.temperature_2m_min[i])}°/${Math.round(dd.temperature_2m_max[i])}°</div>
        <div class="wx-p">💧${dd.precipitation_probability_max[i] ?? "—"}%</div></div>`;
    }).join("");
    box.innerHTML = `<div class="wx-now">
        <span class="wx-now-e">${emo}</span>
        <span class="wx-now-t">${Math.round(c.temperature_2m)}°C</span>
        <span class="wx-now-d">${txt}　濕度 ${c.relative_humidity_2m}%　風 ${Math.round(c.wind_speed_10m)} km/h</span>
      </div>
      <div class="wx-fc">${fc}</div>
      <div class="food-credit">天氣資料：Open-Meteo</div>`;
  } catch {
    box.innerHTML = `<div class="food-empty">天氣查詢失敗（需網路）</div>`;
  }
}

let _foodItems = [], _foodSort = "distance";
async function loadFood(t) {
  const box = $("#foodBox");
  if (!box) return;
  if (!t.lat) { box.innerHTML = `<div class="food-empty">此步道無座標，無法查詢周邊美食</div>`; return; }
  box.innerHTML = `<div class="food-loading">尋找附近美食中…</div>`;
  try {
    _foodItems = await Food.nearby(t);
    renderFood();
  } catch (err) {
    box.innerHTML = err && err.nokey
      ? `<div class="food-empty">美食功能尚未設定（需在 Render 設定 GOOGLE_PLACES_KEY）</div>`
      : `<div class="food-empty">美食查詢失敗，請稍後再試（需網路）</div>`;
  }
}
function foodStars(f) {
  if (!f.rating) return `<span class="food-rating none">尚無評分</span>`;
  return `<span class="food-rating">★ ${f.rating.toFixed(1)}<small> (${f.reviews.toLocaleString()})</small></span>`;
}
function renderFood() {
  const box = $("#foodBox");
  if (!box) return;
  if (!_foodItems.length) { box.innerHTML = `<div class="food-empty">附近 8 公里內查無餐飲（山區步道常見）</div>`; return; }
  const items = Food.sortItems(_foodItems, _foodSort);
  box.innerHTML = `
    <div class="food-sort">排序
      <button class="food-sort-btn${_foodSort === "distance" ? " on" : ""}" data-fsort="distance">📍 距離</button>
      <button class="food-sort-btn${_foodSort === "rating" ? " on" : ""}" data-fsort="rating">★ 星級</button>
    </div>
    <div class="food-list">${items.map(f => `
      <a class="food-item" href="${f.uri || "#"}" target="_blank" rel="noopener">
        <span class="food-kind">${f.kind}</span>
        <span class="food-name">${f.name}</span>
        ${foodStars(f)}
        <span class="food-dist">${(f.dist / 1000).toFixed(1)}km</span>
      </a>`).join("")}</div>
    <div class="food-credit">星級・評論來源：Google 地圖</div>`;
  box.querySelectorAll(".food-sort-btn").forEach(b =>
    b.addEventListener("click", () => { _foodSort = b.dataset.fsort; renderFood(); }));
}

// 附近人文景點（歷史、廟宇、博物館、文化、觀光）
let _poiItems = [], _poiSort = "distance";
async function loadAttractions(t) {
  const box = $("#poiBox");
  if (!box) return;
  if (!t.lat) { box.innerHTML = `<div class="food-empty">此步道無座標，無法查詢周邊景點</div>`; return; }
  try {
    _poiItems = await Attractions.nearby(t);
    renderAttractions();
  } catch (err) {
    box.innerHTML = err && err.nokey
      ? `<div class="food-empty">景點功能尚未設定（需在 Render 設定 GOOGLE_PLACES_KEY）</div>`
      : `<div class="food-empty">景點查詢失敗，請稍後再試（需網路）</div>`;
  }
}
function renderAttractions() {
  const box = $("#poiBox");
  if (!box) return;
  if (!_poiItems.length) { box.innerHTML = `<div class="food-empty">附近 12 公里內查無人文景點</div>`; return; }
  const items = Attractions.sortItems(_poiItems, _poiSort);
  box.innerHTML = `
    <div class="food-sort">排序
      <button class="food-sort-btn${_poiSort === "distance" ? " on" : ""}" data-psort="distance">📍 距離</button>
      <button class="food-sort-btn${_poiSort === "rating" ? " on" : ""}" data-psort="rating">★ 評價</button>
    </div>
    <div class="poi-list">${items.map(p => `
      <a class="poi-item" href="${p.uri || "#"}" target="_blank" rel="noopener">
        <div class="poi-top">
          <span class="poi-kind">${p.kind}</span>
          <span class="poi-name">${p.name}</span>
          ${p.rating ? `<span class="poi-rating">★ ${p.rating.toFixed(1)}</span>` : ""}
        </div>
        ${p.summary ? `<div class="poi-sum">${p.summary}</div>` : ""}
        <div class="poi-dist">${(p.dist / 1000).toFixed(1)} km</div>
      </a>`).join("")}</div>
    <div class="food-credit">景點資料・介紹來源：Google 地圖</div>`;
  box.querySelectorAll(".food-sort-btn").forEach(b =>
    b.addEventListener("click", () => { _poiSort = b.dataset.psort; renderAttractions(); }));
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
  clearDetailObs();
  $("#sheetMask").classList.remove("show");
  $("#detailSheet").classList.remove("show");
}
$("#sheetMask").addEventListener("click", closeDetail);
$("#closeDetailBtn").addEventListener("click", closeDetail);
// Esc 關閉最上層的面板（無障礙）
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if ($("#gradeSheet").classList.contains("show")) return closeGradeInfo();
  if ($("#filterSheet").classList.contains("show")) return closeFilter();
  if ($("#trackSheet").classList.contains("show")) return closeTrackReview();
  if ($("#detailSheet").classList.contains("show")) return closeDetail();
});

// ---------- 記錄頁 ----------
// 行程軌跡回顧 / 結束總結
let trackMap = null, trackLayer = null, trackAnim = null, trackReplayLayer = null, trackPts = null, trackStats = null;
const _hav = (a, b) => haversine({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] });
// 結算頁滑行重播：marker 沿軌跡滑行、路線同步畫出（約8秒）
function playTrackReplay(pts) {
  if (trackAnim) { clearInterval(trackAnim); trackAnim = null; }
  if (!trackMap || !pts || pts.length < 2) return;
  if (trackReplayLayer) trackMap.removeLayer(trackReplayLayer);
  trackReplayLayer = L.layerGroup().addTo(trackMap);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + _hav(pts[i - 1], pts[i]));
  const total = cum[cum.length - 1] || 1;
  const grow = L.polyline([pts[0]], { color: "#2f7d4f", weight: 5 }).addTo(trackReplayLayer);
  const dot = L.circleMarker(pts[0], { radius: 7, color: "#fff", weight: 3, fillColor: "#e8893b", fillOpacity: 1 }).addTo(trackReplayLayer);
  const fullBounds = L.polyline(pts).getBounds();
  // 系統設定「減少動態」→ 直接顯示完整路線，不播放動畫
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    grow.setLatLngs(pts);
    L.circleMarker(pts[pts.length - 1], { radius: 6, color: "#fff", weight: 2, fillColor: "#d2542e", fillOpacity: 1 }).addTo(trackReplayLayer);
    trackMap.fitBounds(fullBounds, { padding: [24, 24] });
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
    live.innerHTML = `<b>${(d / 1000).toFixed(2)}</b> km　·　${fmtTime(totMs * frac)}`;
    barFill.style.width = (frac * 100) + "%";
    if (f >= frames || d >= total) {
      clearInterval(trackAnim); trackAnim = null;
      grow.setLatLngs(pts);
      L.circleMarker(pts[pts.length - 1], { radius: 6, color: "#fff", weight: 2, fillColor: "#d2542e", fillOpacity: 1 }).addTo(trackReplayLayer);
      live.innerHTML = `<b>${(trackStats ? trackStats.km : d / 1000).toFixed(2)}</b> km　·　${fmtTime(totMs)}　🏁`;
      trackMap.flyToBounds(fullBounds, { padding: [24, 24], duration: 0.8 });   // 走完拉遠看全程
    }
  }, interval);
}
function openTrackReview(rec) {
  if (!rec) return;
  const km = rec.distanceKm || 0, t3 = rec.distance3DKm;
  $("#trackBody").innerHTML = `
    <h2>${rec.trailName || "自由路線"}</h2>
    <div class="track-date">${new Date(rec.date).toLocaleString("zh-TW")}</div>
    <div class="kv">
      <div class="item"><div class="l">距離</div><div class="v">${km.toFixed(2)} km</div></div>
      <div class="item"><div class="l">時間</div><div class="v">${fmtTime(rec.elapsedMs)}</div></div>
      <div class="item"><div class="l">爬升／下降</div><div class="v">↑${rec.ascent || 0} ↓${rec.descent || 0}m</div></div>
      <div class="item"><div class="l">卡路里</div><div class="v">${rec.kcal} 大卡</div></div>
      <div class="item"><div class="l">步數</div><div class="v">${(rec.steps || 0).toLocaleString()}</div></div>
      ${t3 && t3 > km + 0.05 ? `<div class="item"><div class="l">含坡度距離</div><div class="v">${t3.toFixed(2)} km</div></div>` : ""}
    </div>
    <div class="link-row">
      <button class="link-btn" id="trackReplay">▶ 重播路徑</button>
      <button class="link-btn" id="trackCard">🖼 分享圖卡</button>
      <button class="link-btn" id="trackGpx">⬇️ 匯出 GPX</button>
      <button class="link-btn" id="trackShare">↗ 分享行程</button>
    </div>`;
  $("#trackMask").classList.add("show");
  $("#trackSheet").classList.add("show");
  $("#trackSheet").scrollTop = 0;
  setTimeout(() => {
    if (!trackMap) {
      trackMap = L.map("trackMap", { zoomControl: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 18 }).addTo(trackMap);
    }
    if (trackLayer) trackMap.removeLayer(trackLayer);
    trackLayer = L.layerGroup().addTo(trackMap);
    const pts = (rec.track || []).map(p => [p.lat, p.lon]);
    trackPts = pts;
    trackStats = { km, ms: rec.elapsedMs };
    trackMap.invalidateSize();
    if (pts.length > 1) {
      trackMap.fitBounds(L.polyline(pts).getBounds(), { padding: [24, 24] });
      L.circleMarker(pts[0], { radius: 6, color: "#fff", weight: 2, fillColor: "#2f7d4f", fillOpacity: 1 }).addTo(trackLayer);   // 起點
      playTrackReplay(pts);                       // 滑行重播
    } else if (pts.length === 1) {
      trackMap.setView(pts[0], 15);
      L.circleMarker(pts[0], { radius: 6, color: "#fff", weight: 2, fillColor: "#2f7d4f", fillOpacity: 1 }).addTo(trackLayer);
    } else { trackMap.setView([23.8, 121], 7); }
  }, 120);
  $("#trackReplay").addEventListener("click", () => { if (trackPts && trackPts.length > 1) playTrackReplay(trackPts); });
  $("#trackCard").addEventListener("click", () => shareHikeCard(rec));
  $("#trackGpx").addEventListener("click", () => { GPX.exportRecord(rec); toast("已匯出 GPX"); });
  $("#trackShare").addEventListener("click", () => {
    const text = `我走了 ${rec.trailName || "自由路線"}：${km.toFixed(2)} km、爬升 ↑${rec.ascent || 0}m、${rec.kcal} 大卡、${fmtTime(rec.elapsedMs)} ⛰️ — 步道誌`;
    if (navigator.share) navigator.share({ title: "我的健行紀錄", text }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast("已複製,可貼給朋友"));
    else toast(text);
  });
}
function closeTrackReview() { if (trackAnim) { clearInterval(trackAnim); trackAnim = null; } const lv = document.getElementById("replayLive"); if (lv) lv.style.display = "none"; const bb = document.getElementById("replayBar"); if (bb) bb.remove(); $("#trackMask").classList.remove("show"); $("#trackSheet").classList.remove("show"); }

// 成果分享圖卡：把這趟健行畫成一張可分享/下載的圖
async function shareHikeCard(rec) {
  try {
    const S = 1080, c = document.createElement("canvas");
    c.width = S; c.height = S;
    const x = c.getContext("2d");
    // 背景：深林漸層
    const g = x.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, "#1f4730"); g.addColorStop(.55, "#16301f"); g.addColorStop(1, "#102217");
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    // 品牌
    x.fillStyle = "rgba(220,232,210,.7)"; x.font = "600 30px serif";
    x.fillText("步道誌 · TRAIL TRACKER", 70, 96);
    // 步道名
    x.fillStyle = "#fbf8ee"; x.font = "700 64px 'Noto Serif TC', serif";
    const name = (rec.trailName || "自由路線").slice(0, 12);
    x.fillText(name, 70, 188);
    x.fillStyle = "rgba(231,237,222,.6)"; x.font = "400 28px serif";
    x.fillText(new Date(rec.date).toLocaleDateString("zh-TW"), 70, 234);
    // 路線縮圖
    const pts = (rec.track || []).map(p => [p.lat, p.lon]);
    if (pts.length > 1) {
      const las = pts.map(p => p[0]), los = pts.map(p => p[1]);
      const minLa = Math.min(...las), maxLa = Math.max(...las), minLo = Math.min(...los), maxLo = Math.max(...los);
      const bx = 70, by = 300, bw = S - 140, bh = 440, pad = 40;
      const spanLa = (maxLa - minLa) || 1e-6, spanLo = (maxLo - minLo) || 1e-6;
      const sc = Math.min((bw - 2 * pad) / spanLo, (bh - 2 * pad) / spanLa);
      const ox = bx + (bw - spanLo * sc) / 2, oy = by + (bh - spanLa * sc) / 2;
      x.strokeStyle = "rgba(232,137,59,.95)"; x.lineWidth = 7; x.lineJoin = "round"; x.lineCap = "round";
      x.beginPath();
      pts.forEach((p, i) => {
        const px = ox + (p[1] - minLo) * sc, py = oy + (maxLa - p[0]) * sc;
        i ? x.lineTo(px, py) : x.moveTo(px, py);
      });
      x.stroke();
    }
    // 大數字：距離
    x.fillStyle = "#fbf8ee"; x.font = "600 132px 'Fraunces', serif";
    x.fillText((rec.distanceKm || 0).toFixed(2), 70, 900);
    x.fillStyle = "rgba(231,237,222,.7)"; x.font = "500 40px serif"; x.fillText("公里", 72, 952);
    // 統計列
    const stats = [["時間", fmtTime(rec.elapsedMs)], ["爬升", "↑" + (rec.ascent || 0) + "m"], ["大卡", String(rec.kcal || 0)], ["步數", (rec.steps || 0).toLocaleString()]];
    const cw = (S - 140) / stats.length;
    stats.forEach(([l, v], i) => {
      const cx = 70 + cw * i;
      x.fillStyle = "#9fe0b0"; x.font = "600 46px 'Fraunces', serif"; x.fillText(v, cx, 1024);
      x.fillStyle = "rgba(231,237,222,.55)"; x.font = "400 26px serif"; x.fillText(l, cx, 1060);
    });
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    const file = new File([blob], "步道誌.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "我的健行紀錄" });
    } else {
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "步道誌健行卡.png"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast("圖卡已下載");
    }
  } catch (e) { toast("圖卡產生失敗"); }
}
$("#trackMask").addEventListener("click", closeTrackReview);
$("#closeTrackBtn").addEventListener("click", closeTrackReview);

let guideLine = null, selectedTrailGeo = null, routeRefLayer = null;
function drawSelectedRoute() {
  if (!recMap) return;
  if (routeRefLayer) { recMap.removeLayer(routeRefLayer); routeRefLayer = null; }
  if (!selectedTrailGeo || !selectedTrailGeo.length) return;
  routeRefLayer = L.layerGroup(selectedTrailGeo.map(seg =>
    L.polyline(seg, { color: "#2f7d4f", weight: 4, opacity: .55, dashArray: "6 6" }))).addTo(recMap);
  const b = L.featureGroup(selectedTrailGeo.map(s => L.polyline(s))).getBounds();
  if (b.isValid()) recMap.fitBounds(b, { padding: [20, 20] });
}
// 點到步道路線的最短距離（公尺）
function distToRoute(lat, lon) {
  if (!selectedTrailGeo) return null;
  let min = Infinity;
  for (const seg of selectedTrailGeo)
    for (const p of seg) {
      const d = haversine({ lat, lon }, { lat: p[0], lon: p[1] });
      if (d < min) min = d;
    }
  return min;
}
function initRecMap() {
  if (!recMap) {
    recMap = L.map("recMap", { zoomControl: false }).setView([25.033, 121.564], 15);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(recMap);
    recLine = L.polyline([], { color: "#2f7d4f", weight: 5 }).addTo(recMap);
  }
  recMap.invalidateSize();
  // 復原中的軌跡重畫
  if (recLine && Recorder.getState() !== "idle") {
    const pts = (Recorder.snapshot().track || []).map(p => [p.lat, p.lon]);
    if (pts.length) { recLine.setLatLngs(pts); setTimeout(() => recMap.fitBounds(L.polyline(pts).getBounds(), { padding: [20, 20] }), 60); }
  }
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
  // #11 每公里震動提示
  if (s.state === "running" && !s.autoPaused) {
    const kmDone = Math.floor(s.distanceKm);
    if (kmDone > lastKmMilestone) { lastKmMilestone = kmDone; if (navigator.vibrate) navigator.vibrate([120, 60, 120]); }
  }
  if (s.error) $("#recStatus").innerHTML = `⚠️ ${s.error}（可改用模擬模式）`;
  else if (s.state === "running" && s.autoPaused) $("#recStatus").innerHTML = `<span class="offroute">⏸ 自動暫停（偵測到靜止，移動即恢復）</span>`;
  else if (s.state === "running") {
    // #9 偏離步道路線提醒
    let off = null;
    if (selectedTrailGeo && s.track.length) {
      const last = s.track[s.track.length - 1];
      off = distToRoute(last.lat, last.lon);
    }
    $("#recStatus").innerHTML = (off != null && off > 60)
      ? `<span class="offroute">⚠️ 偏離步道約 ${Math.round(off)}m，請確認方向</span>`
      : `<span class="live">記錄中${off != null ? "・在路線上" : ""}</span>`;
  } else if (s.state === "paused") $("#recStatus").textContent = "已暫停";

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
    // 模擬高幀率：用 animate:false 讓地圖即時跟隨，路線從腳下滑過＝滑行感；真實 GPS 維持平滑動畫
    if (s.state === "running") recMap.panTo(last, sim() ? { animate: false } : undefined);
  }
});

// 省電模式 + 分享即時位置 + 公里里程碑
let lastKmMilestone = 0;
$("#lowPowerToggle").addEventListener("change", e => {
  Recorder.setLowPower(e.target.checked);
  toast(e.target.checked ? "已開省電模式（下次定位生效）" : "已關省電模式");
});
$("#btnShareLoc").addEventListener("click", () => {
  if (!navigator.geolocation) { toast("此裝置不支援定位"); return; }
  toast("定位中…");
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: la, longitude: lo } = pos.coords;
    const url = `https://www.google.com/maps?q=${la.toFixed(6)},${lo.toFixed(6)}`;
    const text = `我目前的位置：${url}`;
    if (navigator.share) navigator.share({ title: "我的即時位置", text, url }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast("位置連結已複製，可貼給聯絡人"));
    else window.open(url, "_blank");
  }, () => toast("定位失敗，請允許定位權限"), { enableHighAccuracy: true, timeout: 10000 });
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
// 從有路線幾何的步道挑一條（優先親子友善、長度適中）當模擬路線
function pickSimTrail() {
  const hasGeo = t => { const g = geoOf(t); return g && g.some(s => s.length > 5) ? g : null; };
  const cands = TRAILS.filter(hasGeo);
  if (!cands.length) return null;
  const nice = cands.filter(t => t.family_friendly && t.length_km >= 1 && t.length_km <= 8);
  const pool = nice.length ? nice : cands;
  return pool[Math.floor(Math.random() * pool.length)];
}
$("#btnStart").addEventListener("click", () => {
  initRecMap();
  // 模擬模式：沿步道真實路線行走（有動畫感）。沒選步道就自動挑一條真實步道。
  if (sim() && Recorder.getState() !== "paused") {
    if (!(selectedTrailGeo && selectedTrailGeo.length)) {
      const t = pickSimTrail();
      if (t) {
        selectedTrailGeo = geoOf(t);
        Recorder._trailName = t.name;
        $("#recStatus").textContent = `模擬「${t.name}」路線`;
        drawSelectedRoute();
        toast(`模擬：沿「${t.name}」前進`);
      }
    } else {
      toast("模擬：沿此步道路線前進");
    }
    const route = selectedTrailGeo && selectedTrailGeo.length
      ? selectedTrailGeo.reduce((a, b) => (b.length > a.length ? b : a))   // 取最長一段
      : null;
    Recorder.setSimRoute(route);
  }
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
  recPreloaded = false; lastKmMilestone = 0;   // 下次記錄重新預載/里程碑
  $("#btnStart").textContent = "▶ 開始";
  $("#btnStart").style.display = "block";
  $("#btnPause").style.display = "none";
  $("#btnStop").style.display = "none";
  if (recMarker) { recMap.removeLayer(recMarker); recMarker = null; }
  recLine.setLatLngs([]);
  if (rec) {
    rec.trailName = Recorder._trailName || "自由路線";
    Store.addRecord(rec);
    $("#recStatus").textContent = "準備就緒，按「開始」記錄路徑";
    openTrackReview(rec);              // 結束後顯示總結頁
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
$("#btnDiag").addEventListener("click", () => {
  const errs = (window.ttErrors ? window.ttErrors() : []);
  const info = `步道誌診斷\n版本SW:${"v34"}\n螢幕:${innerWidth}x${innerHeight}\n步道資料:${TRAILS.length}條\n近期錯誤(${errs.length}):\n` +
    (errs.slice(0, 8).map(e => `· ${e.t.slice(5, 16)} ${e.m}`).join("\n") || "（無）");
  if (navigator.clipboard) navigator.clipboard.writeText(info).then(() => toast(errs.length ? `已複製診斷(${errs.length}筆錯誤)，可貼給開發者` : "已複製診斷，目前無錯誤"));
  else alert(info);
});
$("#btnClearTiles").addEventListener("click", async () => {
  if (confirm("確定清除已下載的離線地圖？")) {
    await Offline.clear();
    refreshOfflineStatus();
    toast("已清除離線地圖");
  }
});

function renderStats() {
  const box = $("#meStats");
  if (!box) return;
  const recs = Store.getRecords();
  const favs = TRAILS.filter(t => Store.isFav(t.id)).length;
  const doneTrails = new Set(TRAILS.filter(t => Store.trailLog(t.id).done).map(t => t.id)).size;
  const km = recs.reduce((s, r) => s + (r.distanceKm || 0), 0);
  const asc = recs.reduce((s, r) => s + (r.ascent || 0), 0);
  const kcal = recs.reduce((s, r) => s + (r.kcal || 0), 0);
  const ms = recs.reduce((s, r) => s + (r.elapsedMs || 0), 0);
  const now = new Date(), moKm = recs.filter(r => { const d = new Date(r.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })
    .reduce((s, r) => s + (r.distanceKm || 0), 0);
  const hrs = ms / 3.6e6;
  const cell = (v, l) => `<div class="mstat"><div class="mv">${v}</div><div class="ml">${l}</div></div>`;
  box.innerHTML = `<div class="mstat-grid">
    ${cell(recs.length, "出行次數")}
    ${cell(km.toFixed(1), "總里程 km")}
    ${cell("↑" + Math.round(asc), "總爬升 m")}
    ${cell(hrs >= 1 ? hrs.toFixed(1) : (ms / 6e4).toFixed(0), hrs >= 1 ? "總時數 hr" : "總時數 分")}
    ${cell(kcal.toLocaleString(), "總卡路里")}
    ${cell(moKm.toFixed(1), "本月 km")}
    ${cell("✓" + doneTrails, "完成步道")}
    ${cell("★" + favs, "收藏步道")}
  </div>`;
}
function renderHistory() {
  renderStats();
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
        <span>📏 <b>${r.distanceKm.toFixed(2)}</b> km${r.distance3DKm && r.distance3DKm > r.distanceKm + 0.05 ? ` <small>(含坡度 ${r.distance3DKm.toFixed(2)})</small>` : ""}</span>
        <span>👣 <b>${r.steps.toLocaleString()}</b> 步</span>
        <span>🔥 <b>${r.kcal}</b> 大卡</span>
        <span>⏱ <b>${fmtTime(r.elapsedMs)}</b></span>
      </div>
      ${r.ascent ? `<div class="row"><span>⛰️ 爬升 <b>↑${r.ascent}</b>m${r.descent ? ` 下降 <b>↓${r.descent}</b>m` : ""}</span></div>` : ""}
      <div class="hist-actions">
        <button class="hist-view" data-id="${r.id}">🗺️ 回顧軌跡</button>
        <button class="hist-gpx" data-id="${r.id}">⬇️ GPX</button>
        <button class="hist-del" data-id="${r.id}" aria-label="刪除這筆">🗑 刪除</button>
      </div>
    </div>`).join("");
  wrap.querySelectorAll(".hist-view").forEach(b => b.addEventListener("click", () => {
    const rec = Store.getRecords().find(r => r.id === b.dataset.id);
    if (rec) openTrackReview(rec);
  }));
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
$("#gradeMask").addEventListener("click", closeGradeInfo);
$("#closeGradeBtn").addEventListener("click", closeGradeInfo);

// ---------- 外觀主題 ----------
function applyTheme(mode) {
  const dark = mode === "dark" || (mode === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#13160f" : "#16301f");
  document.querySelectorAll(".theme-opt").forEach(b => b.classList.toggle("on", b.dataset.themeOpt === mode));
}
function initTheme() {
  const mode = localStorage.getItem("tt_theme") || "auto";
  applyTheme(mode);
  document.querySelectorAll(".theme-opt").forEach(b => b.addEventListener("click", () => {
    localStorage.setItem("tt_theme", b.dataset.themeOpt);
    applyTheme(b.dataset.themeOpt);
  }));
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if ((localStorage.getItem("tt_theme") || "auto") === "auto") applyTheme("auto");
  });
}

// ---------- 崩潰復原：載入時若有未結束的記錄，復原為暫停狀態 ----------
function restoreActiveRecording() {
  if (!Recorder.hasActive || !Recorder.hasActive()) return;
  const s = Recorder.restore();
  if (!s) return;
  recPreloaded = true; lastKmMilestone = Math.floor(s.distanceKm);
  $("#btnStart").textContent = "▶ 繼續";
  $("#btnStart").style.display = "block";
  $("#btnPause").style.display = "none";
  $("#btnStop").style.display = "block";
  $("#recStatus").innerHTML = `已復原上次未結束的記錄（${s.distanceKm.toFixed(2)} km），可「繼續」或「結束」`;
  toast("已復原未結束的記錄");
}

// ---------- 啟動 ----------
buildFsRegion();
buildCollections();
initTheme();
render();
loadProfile();
restoreActiveRecording();
// 即時路況（若有設定代理）→ 抓最新並重繪
if (typeof Conditions !== "undefined") Conditions.refresh(TRAILS).then(n => { if (n > 0) render(); });
// 深連結 ?trail=id → 直接開啟該步道
(function () {
  const id = new URLSearchParams(location.search).get("trail");
  if (id && TRAILS.some(t => t.id === id)) setTimeout(() => openDetail(id), 200);
})();

// #22 首次使用導覽
(function onboarding() {
  if (localStorage.getItem("tt_onboarded") || new URLSearchParams(location.search).get("trail")) return;
  const ov = document.createElement("div");
  ov.className = "onboard";
  ov.innerHTML = `<div class="onboard-card">
    <div class="onboard-mark">⛰</div>
    <h2>歡迎使用步道誌</h2>
    <ul>
      <li>🧭 <b>探索</b>：搜尋全台 2200+ 步道，看分級、實際路線、海拔剖面、天氣與周邊美食</li>
      <li>📍 <b>記錄</b>：邊走邊記里程、爬升、卡路里；中斷可復原，離線也能用</li>
      <li>👤 <b>我的</b>：行程回顧、收藏、標記已完成的步道</li>
    </ul>
    <p>💡 出發前在步道詳情按「⬇️ 預載離線地圖」，山區沒訊號也看得到地圖。</p>
    <button class="btn primary" id="onboardGo">開始探索</button>
  </div>`;
  document.body.appendChild(ov);
  ov.querySelector("#onboardGo").addEventListener("click", () => { localStorage.setItem("tt_onboarded", "1"); ov.remove(); });
})();
