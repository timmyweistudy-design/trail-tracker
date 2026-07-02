// ===== Gather the Trail 前端主程式 =====
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
// 詳情欄位（guide/entrances/交通…）拆出懶載，首屏更輕
let _detailPromise = null;
function ensureDetail() {
  if (window.TRAILS_DETAIL) return Promise.resolve();
  if (_detailPromise) return _detailPromise;
  _detailPromise = new Promise(resolve => {
    const s = document.createElement("script");
    s.src = "js/trails-detail.js";
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
  return _detailPromise;
}
function mergeDetail(t) { const d = (window.TRAILS_DETAIL || {})[t.id]; if (d) Object.assign(t, d); return t; }
// 真實登山客走法：把路段建成路徑圖，沿實際路徑走；遇叉路/死路「原路折返」回岔口再走下一條，
// 不會憑空斜穿。只有資料本身斷成不相連的區塊時，才不得已直線接過去。
function chainSegments(geo) {
  const segs = (geo || []).filter(s => s && s.length >= 2).map(s => s.slice());
  if (segs.length <= 1) return segs[0] || [];

  // 公尺距離（小範圍用平面近似即可）
  const M = 111320;
  const distM = (a, b) => { const dx = (a[1] - b[1]) * M * Math.cos(a[0] * Math.PI / 180), dy = (a[0] - b[0]) * M; return Math.hypot(dx, dy); };
  const TOLM = 45;   // 端點落在他段某頂點 45m 內 → 視為交會（含中段分岔）

  // ── 1. 交會點切段(noding)：支線常從另一段「中間」分出，需在該頂點切開並對齊座標 ──
  const cuts = segs.map(s => new Set([0, s.length - 1]));
  for (let i = 0; i < segs.length; i++) {
    for (const ei of [0, segs[i].length - 1]) {
      const p = segs[i][ei];
      for (let j = 0; j < segs.length; j++) {
        if (j === i) continue;
        let bd = Infinity, bk = -1;
        for (let k = 0; k < segs[j].length; k++) { const d = distM(segs[j][k], p); if (d < bd) { bd = d; bk = k; } }
        if (bd <= TOLM) { cuts[j].add(bk); segs[i][ei] = segs[j][bk].slice(); }   // 吸附到交會頂點
      }
    }
  }
  // ── 2. 依切點把每段拆成多條子邊 ──
  const subs = [];
  segs.forEach((s, i) => {
    const idx = [...cuts[i]].sort((a, b) => a - b);
    for (let c = 0; c < idx.length - 1; c++) { const a = idx[c], b = idx[c + 1]; if (b > a) subs.push(s.slice(a, b + 1)); }
  });

  // ── 3. 用子邊端點建節點圖（交會點此時座標已一致）──
  const TOL2 = 1e-8;                    // 端點距離 < ~10m 視為同一節點
  const nodes = [];
  const nodeOf = pt => {
    for (let i = 0; i < nodes.length; i++) { const dx = pt[0] - nodes[i][0], dy = pt[1] - nodes[i][1]; if (dx * dx + dy * dy < TOL2) return i; }
    nodes.push([pt[0], pt[1]]); return nodes.length - 1;
  };
  const edges = subs.map(s => ({ a: nodeOf(s[0]), b: nodeOf(s[s.length - 1]), pts: s, used: false }));
  const adj = nodes.map(() => []);
  edges.forEach(e => { adj[e.a].push({ e, fwd: true }); adj[e.b].push({ e, fwd: false }); });

  const route = [];
  const pushPts = (pts, fwd) => {
    const arr = fwd ? pts : pts.slice().reverse();
    for (let k = route.length ? 1 : 0; k < arr.length; k++) route.push(arr[k]);   // 略過與上一點重複的岔口點
  };
  const dfs = node => {
    for (const link of adj[node]) {
      if (link.e.used) continue;
      link.e.used = true;
      pushPts(link.e.pts, link.fwd);                 // 沿這條岔路走出去
      dfs(link.fwd ? link.e.b : link.e.a);           // 繼續從對端往下走
      pushPts(link.e.pts, !link.fwd);                // 走到底→原路折返回此岔口
    }
  };
  // 先從只有一條路的端點(步道起終點)出發，較自然；逐個連通區塊處理
  const order = nodes.map((_, i) => i).sort((a, b) => adj[a].length - adj[b].length);
  for (const sn of order) if (adj[sn].some(l => !l.e.used)) dfs(sn);
  return route.length ? route : segs[0];
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
  steps: '<path d="M7 13c-1.4 0-2.3-1.5-2.3-4S5.6 4 7 4s1.9 1.9 1.9 4.4S8.4 13 7 13Z"/><path d="M5 13.5V16a2 2 0 0 1-4 0"/><path d="M17 20c-1.2 0-2-1.4-2-3.6S15.8 11 17 11s1.7 1.9 1.7 4.1S18.2 20 17 20Z"/><path d="M19 20.5V22"/>',
  flame: '<path d="M12 3c1 3.2 4 4.3 4 8.2a4 4 0 0 1-8 0c0-1.6.6-2.6 1.4-3.4.2 1.6.9 2.4 1.8 2.4-.2-2.4-1.2-4 .8-7.2Z"/>',
  fire: '<path d="M12 3c1 3.2 4 4.3 4 8.2a4 4 0 0 1-8 0c0-1.6.6-2.6 1.4-3.4.2 1.6.9 2.4 1.8 2.4-.2-2.4-1.2-4 .8-7.2Z"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z"/>',
  route: '<circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="5" r="2.2"/><path d="M8 19h6a4 4 0 0 0 0-8H10a4 4 0 0 1 0-8h6"/>',
  alert: '<path d="M12 4 2.5 20h19L12 4Z"/><path d="M12 10v4"/><circle cx="12" cy="17.3" r=".4" fill="currentColor" stroke="none"/>',
  // ── 擴充：統一墨線圖示，取代功能性 emoji ──
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  chat: '<path d="M4 5h16v11H8l-4 4V5Z"/>',
  heart: '<path d="M12 20S4 14.5 4 9.2A3.8 3.8 0 0 1 12 7a3.8 3.8 0 0 1 8 2.2C20 14.5 12 20 12 20Z"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4V4Z"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9h16M8 3v4M16 3v4"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4V8Z"/><circle cx="12" cy="13" r="3"/>',
  map: '<path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z"/><path d="M19 17H6"/>',
  medal: '<circle cx="12" cy="14" r="5"/><path d="M9 9 6 3M15 9l3-6M11 13l1-1v4"/>',
  footprints: '<path d="M7 13c-1.4 0-2.3-1.5-2.3-4S5.6 4 7 4s1.9 1.9 1.9 4.4S8.4 13 7 13Z"/><path d="M5 13.5V16a2 2 0 0 1-4 0"/><path d="M17 20c-1.2 0-2-1.4-2-3.6S15.8 11 17 11s1.7 1.9 1.7 4.1S18.2 20 17 20Z"/><path d="M19 20.5V22"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  share: '<circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="m8 11 8-4M8 13l8 4"/>',
  repeat: '<path d="M4 9V8a3 3 0 0 1 3-3h10l-2.5-2.5M20 15v1a3 3 0 0 1-3 3H7l2.5 2.5"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m14 6 4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.2A3 3 0 0 1 16 11M21 20a6 6 0 0 0-4-5.7"/>',
  leaf: '<path d="M4 20C3 11 9 4 20 4c0 11-7 17-16 16Z"/><path d="M4 20 14 10"/>',
  paw: '<ellipse cx="7" cy="9" rx="1.6" ry="2.2"/><ellipse cx="12" cy="7" rx="1.6" ry="2.4"/><ellipse cx="17" cy="9" rx="1.6" ry="2.2"/><path d="M12 12c-3 0-5 2-5 4.2C7 18 9 19 12 19s5-1 5-2.8C17 14 15 12 12 12Z"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".6" fill="currentColor" stroke="none"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-1.5 5"/><path d="M20 5v6h-6"/>',
  sparkle: '<path d="M12 3c.7 4.4 1.6 5.3 6 6-4.4.7-5.3 1.6-6 6-.7-4.4-1.6-5.3-6-6 4.4-.7 5.3-1.6 6-6Z"/>',
  megaphone: '<path d="M4 10v4l9 4V6l-9 4Z"/><path d="M13 8.5a4 4 0 0 1 0 7M4 12H3"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  trophy: '<path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M10 14h4l-.5 4h-3L10 14ZM8 21h8"/>',
  download: '<path d="M12 4v10m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/>',
  compare: '<path d="M8 4 4 8l4 4M4 8h11M16 12l4 4-4 4M20 16H9"/>',
  external: '<path d="M14 4h6v6M20 4l-8 8M18 13v6H5V6h6"/>',
  play: '<path d="M7 5l12 7-12 7V5Z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/>',
  battery: '<rect x="3" y="8" width="15" height="8" rx="2"/><path d="M21 11v2"/><path d="M6 11v2M9 11v2"/>',
  logout: '<path d="M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8"/><path d="M14 12H9m11 0-4-4m4 4-4 4"/>',
  backup: '<path d="M12 16V6m0 0-4 4m4-4 4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  restore: '<path d="M12 6v10m0 0 4-4m-4 4-4-4"/><path d="M4 8V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2"/>',
};
function ic(name, cls) { return `<svg class="ic${cls ? " " + cls : ""}" viewBox="0 0 24 24">${ICON[name] || ""}</svg>`; }
// 空狀態手繪山林插圖
const EMPTY_ART = `<svg class="empty-art" viewBox="0 0 120 84">
  <circle cx="94" cy="20" r="9" fill="none" stroke="var(--accent)" stroke-width="2"/>
  <path d="M4 74 L38 26 L58 52 L76 28 L116 74 Z" fill="var(--brand-soft)" stroke="var(--brand)" stroke-width="2" stroke-linejoin="round"/>
  <path d="M38 26 L30 40 L46 40 Z M76 28 L68 42 L86 42 Z" fill="#fff" opacity=".6"/>
  <path d="M4 74 H116" stroke="var(--brand-mid)" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const TAG_ICON = { 古道: "🛤", 瀑布: "💧", 海景: "🌊", 森林: "🌲", 湖泊: "🏞", 溫泉: "♨️", 環狀: "🔄", 親子: "🧸", 無障礙: "♿", 挑戰級: "⚡" };
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
// 內嵌輸入框（取代原生 prompt），回傳 Promise<string|null>
function askInput(opts) {
  return new Promise(resolve => {
    const ov = document.createElement("div");
    ov.className = "input-modal";
    const esc = v => String(v == null ? "" : v).replace(/</g, "&lt;").replace(/"/g, "&quot;");
    const field = opts.multiline
      ? `<textarea id="imField" rows="4" placeholder="${esc(opts.placeholder)}">${esc(opts.value)}</textarea>`
      : `<input id="imField" type="${opts.type || "text"}" inputmode="${opts.type === "number" ? "decimal" : "text"}" placeholder="${esc(opts.placeholder)}" value="${esc(opts.value)}"${opts.max ? ` maxlength="${opts.max}"` : ""}>`;
    ov.innerHTML = `<div class="input-card">
      <div class="im-title">${opts.title}</div>${field}
      <div class="im-btns"><button class="btn ghost" id="imCancel">取消</button><button class="btn primary" id="imOk">確定</button></div>
    </div>`;
    document.body.appendChild(ov);
    const f = ov.querySelector("#imField");
    setTimeout(() => { f.focus(); if (f.select) f.select(); }, 30);
    const done = v => { ov.remove(); resolve(v); };
    ov.querySelector("#imOk").onclick = () => done(f.value);
    ov.querySelector("#imCancel").onclick = () => done(null);
    ov.addEventListener("click", e => { if (e.target === ov) done(null); });
    f.addEventListener("keydown", e => {
      if (e.key === "Enter" && !opts.multiline) { e.preventDefault(); done(f.value); }
      else if (e.key === "Escape") done(null);
    });
  });
}
// 里程碑彩帶
function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = document.createElement("div"); c.className = "confetti";
  const cols = ["#e8c87a", "#9fe0b0", "#c2683d", "#3f7a55", "#fbf8ee"];
  let h = "";
  for (let i = 0; i < 64; i++) h += `<i style="left:${Math.random() * 100}%;background:${cols[i % cols.length]};animation-duration:${(1 + Math.random()).toFixed(2)}s;animation-delay:${(Math.random() * .35).toFixed(2)}s"></i>`;
  c.innerHTML = h; document.body.appendChild(c);
  setTimeout(() => c.remove(), 2400);
}

// ---------- 分頁切換 ----------
let detailMap, detailOverlay, detailPoiLayer, recMap, recLine, recMarker, petMarker, _detailScroll = null;
function petEmojiNow() { return PET_STAGES[petStageIndex(totalKm())].e; }
// 把美食/景點標在詳情地圖（不改視角，可縮放查看周邊）
function plotPoi(items, color) {
  if (!detailMap || !detailPoiLayer || !items) return;
  items.forEach(p => {
    if (p.lat == null) return;
    L.circleMarker([p.lat, p.lon], { radius: 5, color: "#fff", weight: 1.5, fillColor: color, fillOpacity: .95 })
      .addTo(detailPoiLayer)
      .bindPopup(`<b>${(p.name || "").replace(/[<>&]/g, "")}</b><br>${p.kind}${p.rating ? " · ★" + p.rating.toFixed(1) : ""}`);
  });
}
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    btn.classList.add("active");
    const view = btn.dataset.view;
    $("#view-" + view).classList.add("active");
    if (view === "record") {
      requestEntryPerms();   // 首次進記錄頁＝這一下點擊就是手勢，一次問完定位+方位權限
      // 從底部分頁進入＝自由記錄，清掉先前選定步道的路線疊圖
      selectedTrailGeo = null; selectedTrailId = null;
      if (routeRefLayer && recMap) { recMap.removeLayer(routeRefLayer); routeRefLayer = null; }
      ensureGeo();                       // 預載幾何，供模擬挑步道/疊圖用
      ensureMeAvatar();                  // 預取頭像供「我」的地圖標記
      setTimeout(initRecMap, 60);
      // 與小隊同行預設開啟：有目前小隊＋已登入就自動連上（地圖建好後）
      setTimeout(() => { if (typeof Team !== "undefined" && Team.autoLive && typeof recMap !== "undefined" && recMap) Team.autoLive(recMap); }, 200);
      renderRecIdle();
    }
    if (view === "pet") {
      renderPet(); renderQuests(); renderBadges();
      if (typeof Pets !== "undefined") {
        Pets.claimGifts().then(n => { if (n > 0) { toast(`收到好友送的 ${n} 🍓！`); renderPet(); } });
        Pets.renderFriends();
      }
    }
    if (view === "me") { renderHistory(); refreshOfflineStatus(); renderAccent(); renderProColor(); renderMeProfileCard(); if (typeof Premium !== "undefined") Premium.refresh().then(() => { Premium.renderBox($("#premiumBox")); renderAccent(); renderProColor(); renderMeProfileCard(); applySeason(); }); }
    if (view === "social" && typeof SocialUI !== "undefined") SocialUI.onShow();
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
  if (val === "distance") return setDistanceSort();   // 依距離需先定位，特別處理
  if (myLoc) { myLoc = null; nearRadius = 0; $("#nearRow").style.display = "none"; }   // 切換到其他排序→關閉附近
  curSort = (curSort === val) ? "default" : val;     // 再按一次取消（回預設）
  document.querySelectorAll("[data-sort]").forEach(c => c.classList.toggle("active", c.dataset.sort === curSort));
  updateFilterDot(); render();
}
// 依距離排序：取得定位後依與使用者的距離排序，並顯示半徑篩選列
function setDistanceSort() {
  if (curSort === "distance") {   // 再按一次→關閉
    curSort = "default"; myLoc = null; nearRadius = 0; $("#nearRow").style.display = "none";
    document.querySelectorAll("[data-sort]").forEach(c => c.classList.toggle("active", c.dataset.sort === "default"));
    updateFilterDot(); render(); toast("已關閉依距離排序"); return;
  }
  if (!navigator.geolocation) { toast("此裝置不支援定位"); return; }
  toast("定位中…");
  navigator.geolocation.getCurrentPosition(
    pos => {
      myLoc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      curSort = "distance";
      document.querySelectorAll("[data-sort]").forEach(c => c.classList.toggle("active", c.dataset.sort === "distance"));
      $("#nearRow").style.display = "flex";
      updateFilterDot(); render(); toast("已依距離排序");
    },
    () => toast("定位失敗，請允許定位權限"),
    { enableHighAccuracy: true, timeout: 10000 });
}
// 進階篩選啟用數量 → 篩選鈕上的小紅點
function updateFilterDot() {
  let n = activeFilters.size + activeRegions.size;
  if (curSort !== "default") n++;
  if (filterOpen) n++;
  if (filterGeo) n++;
  if (maxLen) n++;
  if (maxAsc) n++;
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
// 依收藏/已完成步道的常見主題，推一個個人化分類
function favoriteTag() {
  const seen = TRAILS.filter(t => Store.isFav(t.id) || Store.trailLog(t.id).done);
  if (seen.length < 2) return null;
  const counts = {};
  seen.forEach(t => tagsOf(t).forEach(g => counts[g] = (counts[g] || 0) + 1));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= 2 ? top[0] : null;
}
let _collList = [];
function buildCollections() {
  const box = $("#collections");
  if (!box) return;
  const ft = favoriteTag();
  _collList = ft ? [{ t: "為你推薦", s: `你常走「${ft}」`, f: ["tag:" + ft], bg: "linear-gradient(135deg,#c79a3d,#9a6f2c)" }, ...COLLECTIONS] : COLLECTIONS.slice();
  box.innerHTML = _collList.map((c, i) =>
    `<button class="coll-card" data-coll="${i}" style="background:${c.bg}">
       <span class="coll-t">${c.t}</span><span class="coll-s">${c.s}</span></button>`).join("");
  box.querySelectorAll(".coll-card").forEach(b => b.addEventListener("click", () => {
    const c = _collList[+b.dataset.coll];
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
$("#lenRange").addEventListener("input", e => {
  const v = +e.target.value; maxLen = v >= 30 ? 0 : v;
  $("#lenVal").textContent = maxLen ? `≤ ${maxLen} km` : "不限";
  updateFilterDot(); render();
});
$("#ascRange").addEventListener("input", e => {
  const v = +e.target.value; maxAsc = v >= 2000 ? 0 : v;
  $("#ascVal").textContent = maxAsc ? `≤ ${maxAsc} m` : "不限";
  updateFilterDot(); render();
});
$("#fsGrade").addEventListener("click", openGradeInfo);
$("#fsReset").addEventListener("click", () => {
  filterOpen = false; filterGeo = false; maxLen = 0; maxAsc = 0;
  $("#fsOpen").classList.remove("active"); $("#fsGeo").classList.remove("active");
  $("#lenRange").value = 30; $("#ascRange").value = 2000; $("#lenVal").textContent = "不限"; $("#ascVal").textContent = "不限";
  activeFilters.clear(); activeRegions.clear(); curSort = "default";
  myLoc = null; nearRadius = 0; $("#nearRow").style.display = "none";   // 一併關閉依距離排序
  syncFilterUI(); syncRegionUI();
  document.querySelectorAll("[data-sort]").forEach(c => c.classList.toggle("active", c.dataset.sort === "default"));
  updateFilterDot(); render();
});
$("#btnFilter").addEventListener("click", () => { updateFilterDot(); $("#filterMask").classList.add("show"); $("#filterSheet").classList.add("show"); $("#closeFilterBtn").focus({ preventScroll: true }); });

// 篩選預設組（口袋路線）
function getPresets() { try { return JSON.parse(localStorage.getItem("tt_presets")) || []; } catch { return []; } }
function savePresets(a) { localStorage.setItem("tt_presets", JSON.stringify(a)); }
function currentFilterState() { return { filters: [...activeFilters], regions: [...activeRegions], sort: curSort, open: filterOpen, geo: filterGeo, maxLen, maxAsc }; }
function applyPreset(p) {
  activeFilters = new Set(p.filters || []); activeRegions = new Set(p.regions || []);
  curSort = p.sort || "default"; filterOpen = !!p.open; filterGeo = !!p.geo; maxLen = p.maxLen || 0; maxAsc = p.maxAsc || 0;
  if (curSort === "distance" && !myLoc) curSort = "default";   // 口袋路線不保存定位，無位置時回預設
  syncFilterUI(); syncRegionUI();
  document.querySelectorAll("[data-sort]").forEach(c => c.classList.toggle("active", c.dataset.sort === curSort));
  $("#fsOpen").classList.toggle("active", filterOpen); $("#fsGeo").classList.toggle("active", filterGeo);
  $("#lenRange").value = maxLen || 30; $("#ascRange").value = maxAsc || 2000;
  $("#lenVal").textContent = maxLen ? `≤ ${maxLen} km` : "不限"; $("#ascVal").textContent = maxAsc ? `≤ ${maxAsc} m` : "不限";
  if (filterGeo) ensureGeo().then(() => { updateFilterDot(); render(); }); else { updateFilterDot(); render(); }
}
function buildPresets() {
  const ps = getPresets(), grp = $("#fsPresetGroup"), box = $("#fsPresets");
  if (!grp) return;
  grp.style.display = ps.length ? "" : "none";
  box.innerHTML = ps.map((p, i) => `<button class="chip preset" data-i="${i}">${p.name}<span class="px" data-del="${i}">✕</span></button>`).join("");
  box.querySelectorAll(".chip.preset").forEach(b => b.addEventListener("click", e => {
    if (e.target.dataset.del != null) { const a = getPresets(); a.splice(+e.target.dataset.del, 1); savePresets(a); buildPresets(); return; }
    applyPreset(ps[+b.dataset.i]);
  }));
}
const PRESET_FREE = 3;
$("#fsSavePreset").addEventListener("click", () => {
  if (!activeFilters.size && !activeRegions.size && curSort === "default" && !filterOpen && !filterGeo && !maxLen && !maxAsc) { toast("先設定一些篩選再儲存"); return; }
  if (!(typeof Premium !== "undefined" && Premium.isOn()) && getPresets().length >= PRESET_FREE) {
    toast(`免費口袋路線上限 ${PRESET_FREE} 組，升級 Premium 無限`);
    if (typeof Premium !== "undefined") Premium.openUpgrade();
    return;
  }
  askInput({ title: "為這組篩選命名", value: "常用篩選", max: 10 }).then(name => {
    if (name == null) return;
    const a = getPresets(); a.push({ name: name.trim().slice(0, 10) || "常用", ...currentFilterState() }); savePresets(a);
    buildPresets(); toast("已存成口袋路線");
  });
});
function closeFilter() { $("#filterMask").classList.remove("show"); $("#filterSheet").classList.remove("show"); }
$("#filterMask").addEventListener("click", closeFilter);
$("#closeFilterBtn").addEventListener("click", closeFilter);
$("#fsApply").addEventListener("click", closeFilter);

let _searchTm;
$("#searchInput").addEventListener("input", e => {
  curQuery = e.target.value.trim();
  buildSuggest(curQuery);
  clearTimeout(_searchTm); _searchTm = setTimeout(render, 180);   // 防抖，打字更順
});
$("#searchInput").addEventListener("focus", e => buildSuggest(e.target.value.trim()));
// 語音搜尋
(function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = $("#searchMic"); if (!mic) return;
  if (!SR) { mic.style.display = "none"; return; }
  mic.addEventListener("click", () => {
    const r = new SR(); r.lang = "zh-TW"; r.interimResults = false; r.maxAlternatives = 1;
    mic.classList.add("listening"); toast("請說出步道名稱…");
    r.onresult = e => {
      const txt = (e.results[0][0].transcript || "").replace(/[。，、？！\s]/g, "");
      $("#searchInput").value = txt; curQuery = txt; buildSuggest(txt); render();
    };
    r.onend = () => mic.classList.remove("listening");
    r.onerror = () => { mic.classList.remove("listening"); toast("語音辨識失敗，請再試一次"); };
    try { r.start(); } catch (e) { mic.classList.remove("listening"); }
  });
})();
$("#searchInput").addEventListener("blur", () => setTimeout(() => { $("#searchSuggest").style.display = "none"; }, 150));
// 搜尋建議下拉：即時列出符合的步道名，點一下直接進詳情
function buildSuggest(q) {
  const box = $("#searchSuggest");
  q = q.toLowerCase().replace(/\s+/g, "");
  if (!q) { box.style.display = "none"; return; }
  const hits = [];
  for (const t of TRAILS) {
    const n = (t.name || "").toLowerCase().replace(/\s+/g, "");
    if (n.includes(q)) hits.push(t);
    if (hits.length >= 30) break;
  }
  hits.sort((a, b) => (a.name.toLowerCase().startsWith(q) ? 0 : 1) - (b.name.toLowerCase().startsWith(q) ? 0 : 1));
  const top = hits.slice(0, 6);
  if (!top.length) { box.style.display = "none"; return; }
  box.innerHTML = top.map(t =>
    `<button class="sug" data-id="${t.id}">${ic("pin")}<span class="sug-n">${t.name}</span><span class="sug-r">${t.region || ""}</span></button>`).join("");
  box.style.display = "block";
  box.querySelectorAll(".sug").forEach(b => b.addEventListener("mousedown", e => {
    e.preventDefault(); box.style.display = "none"; openDetail(b.dataset.id);
  }));
}

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

let curSort = "default", filterOpen = false, filterGeo = false, nearRadius = 0, maxLen = 0, maxAsc = 0;   // 0 = 不限
function isClosed(t) { return t.condition && /暫停|封閉|關閉/.test(t.condition.status || ""); }
function matchDiff(f, t) { return f === "d45" ? t.difficulty >= 4 : t.difficulty === +f.slice(1); }
// render 期間快取收藏/步記，避免每張卡重複解析 localStorage
let _favSet = new Set(), _logCache = {};
function refreshCardCache() {
  try { _favSet = new Set(JSON.parse(localStorage.getItem("tt_favs") || "[]")); } catch { _favSet = new Set(); }
  try { _logCache = JSON.parse(localStorage.getItem("tt_log") || "{}"); } catch { _logCache = {}; }
}
const isFavC = id => _favSet.has(id);
const logC = id => _logCache[id] || {};
function matches(t) {
  // 地區（複選 OR）
  if (activeRegions.size && !activeRegions.has(t.region)) return false;
  if (filterOpen && isClosed(t)) return false;
  if (filterGeo && !geoOf(t)) return false;
  // 旗標（各自 AND）
  if (activeFilters.has("fav") && !isFavC(t.id)) return false;
  if (activeFilters.has("done") && !logC(t.id).done) return false;
  if (activeFilters.has("family") && !t.family_friendly) return false;
  if (activeFilters.has("rated4") && (logC(t.id).rating || 0) < 4) return false;
  if (maxLen && (t.length_km == null || t.length_km > maxLen)) return false;
  if (maxAsc && (t.ascent == null || t.ascent > maxAsc)) return false;
  if (nearRadius && myLoc) { if (!t.lat || haversine(myLoc, { lat: t.lat, lon: t.lon }) > nearRadius * 1000) return false; }
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
  const closed = t.condition && /暫停|封閉|關閉/.test(t.condition.status || "");
  // 陡度條：每公里爬升（≈400 m/km 視為極陡）
  let slope = "";
  if (t.ascent != null && t.length_km) {
    const w = Math.max(6, Math.min(100, Math.round(t.ascent / t.length_km / 4)));
    slope = `<div class="slope-row"><span class="slope-label">陡度</span><div class="slope-bar"><i style="width:${w}%"></i></div></div>`;
  }
  const fav = isFavC(t.id), done = logC(t.id).done;
  const distKm = (myLoc && t.lat) ? (haversine(myLoc, { lat: t.lat, lon: t.lon }) / 1000).toFixed(1) : null;
  // 山誌式 hero 數據（襯線數字當主角，最多三格）
  const stats = [`<div class="jstat"><div class="jnum">${t.length_km != null ? t.length_km : "—"}</div><div class="jlbl">公里</div></div>`];
  const gainC = (typeof Profile !== "undefined" && Profile.cachedGain) ? Profile.cachedGain(t.id) : null;
  const ascShow = gainC != null ? gainC : (t.ascent != null ? Math.round(t.ascent) : null);
  if (ascShow != null) stats.push(`<div class="jstat"><div class="jnum" data-card-asc>↑${ascShow}</div><div class="jlbl">累積爬升 m</div></div>`);
  if (t.tour) stats.push(`<div class="jstat"><div class="jnum jnum-sm">${t.tour}</div><div class="jlbl">建議時程</div></div>`);
  else if (distKm) stats.push(`<div class="jstat"><div class="jnum">${distKm}</div><div class="jlbl">公里外</div></div>`);
  const locExtra = (distKm && t.tour) ? `<span class="jloc-dot">·</span>${ic("compass")}<span>${distKm} km</span>` : "";
  return `<div class="card jcard" data-id="${t.id}">
    <span class="jbar d${d}"></span>
    <button class="fav-star${fav ? " on" : ""}" data-fav="${t.id}" aria-label="收藏 ${t.name}">${fav ? "★" : "☆"}</button>
    <button class="done-check${done ? " on" : ""}" data-done="${t.id}" aria-label="標記完成 ${t.name}" title="標記完成">✓</button>
    <h3>${t.name}</h3>
    <div class="jloc">${ic("pin")}<span>${t.position || "—"}</span>${locExtra}</div>
    <div class="jstats">${stats.join('<span class="jstats-div"></span>')}</div>
    <div class="badges">
      <span class="badge diff d${d}"><span class="lvl">${d}</span>${t.difficulty_label}</span>
      ${closed ? `<span class="badge closed">${ic("alert")} ${t.condition.status}</span>` : ""}
      ${t.family_friendly ? `<span class="badge family">親子友善</span>` : ""}
      ${t.permit && t.permit !== "無" ? `<span class="badge ghost">需入山證</span>` : ""}
      <span class="badge src">${SRC_LABEL[t.source] || t.source}</span>
    </div>
    ${slope}
  </div>`;
}

function render() {
  refreshCardCache();
  curList = TRAILS.filter(matches);
  if (myLoc) curList.sort((a, b) =>
    (a.lat ? haversine(myLoc, { lat: a.lat, lon: a.lon }) : 9e9) -
    (b.lat ? haversine(myLoc, { lat: b.lat, lon: b.lon }) : 9e9));
  else if (curQuery && curSort === "default") {
    // 搜尋相關度：名稱開頭命中 > 名稱包含 > 林務署官方優先 > 短的優先
    const q = curQuery.toLowerCase().replace(/\s+/g, "");
    const score = t => {
      const n = (t.name || "").toLowerCase().replace(/\s+/g, "");
      return (n.startsWith(q) ? 0 : n.includes(q) ? 1 : 2) * 10 + (t.source === "forestry" ? 0 : 3);
    };
    curList.sort((a, b) => score(a) - score(b) || (a.length_km ?? 9e9) - (b.length_km ?? 9e9));
  }
  else if (curSort !== "default") {
    const ln = t => t.length_km == null ? 9e9 : t.length_km;
    const df = t => t.difficulty == null ? 99 : t.difficulty;
    const cmp = {
      "length-asc": (a, b) => ln(a) - ln(b), "length-desc": (a, b) => ln(b) - ln(a),
      "diff-asc": (a, b) => df(a) - df(b), "diff-desc": (a, b) => df(b) - df(a),
      "rating-desc": (a, b) => (Store.trailLog(b.id).rating || 0) - (Store.trailLog(a.id).rating || 0),
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
    $("#trailList").innerHTML = `<div class="empty">${EMPTY_ART}找不到符合的步道<br>
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
      if (e.target.closest(".fav-star") || e.target.closest(".done-check")) return;
      openDetail(c.dataset.id);
    });
    const star = c.querySelector(".fav-star");
    if (star) star.addEventListener("click", () => {
      if (!Store.isFav(star.dataset.fav) && !favAddAllowed()) return;
      const added = Store.toggleFav(star.dataset.fav);
      star.classList.toggle("on", added); star.textContent = added ? "★" : "☆";
      if (added) { star.classList.remove("pop"); void star.offsetWidth; star.classList.add("pop"); }
      toast(added ? "已加入收藏" : "已移除收藏");
    });
    const chk = c.querySelector(".done-check");
    if (chk) chk.addEventListener("click", () => {
      const done = !Store.trailLog(chk.dataset.done).done;
      Store.setTrailLog(chk.dataset.done, { done });
      chk.classList.toggle("on", done);
      if (done) { chk.classList.remove("pop"); void chk.offsetWidth; chk.classList.add("pop"); }
      toast(done ? "已標記完成 ✓" : "已取消完成");
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
// 底圖：Esri 地形(含立體陰影) / 衛星影像 — 比 OpenTopoMap 精緻
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
function baseTopo() { return L.tileLayer(`${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`, { attribution: "© Esri 地形", maxZoom: 18, maxNativeZoom: 18 }); }
function baseSat() { return L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, { attribution: "© Esri、Maxar 衛星影像", maxZoom: 18, maxNativeZoom: 18 }); }
// 指北針：讀裝置方位，轉動手機時指針跟著轉、指向實際北方
let _compassOn = false, _heading = 0, _gpsHeading = null;
function rotateCompasses() { document.querySelectorAll(".compass-rose").forEach(r => r.style.transform = `rotate(${-_heading}deg)`); }
// 更新記錄地圖「我」的面朝錐：優先用手機羅盤(站著轉身也動)，沒有才用 GPS 行進方向
function updateMeCone() {
  if (!recMarker || !recMarker._av || !recMarker.getElement) return;
  const el = recMarker.getElement(); const dir = el && el.querySelector(".tm-dir"); if (!dir) return;
  const head = (_compassOn && _heading != null) ? _heading : _gpsHeading;
  if (head != null) { dir.style.transform = `rotate(${head}deg)`; dir.style.display = "block"; } else dir.style.display = "none";
}
function onOrient(e) {
  let h = e.webkitCompassHeading;
  if (h == null && e.absolute && e.alpha != null) h = 360 - e.alpha;
  if (h == null) return;
  _heading = h; rotateCompasses(); updateMeCone();
}
function enableCompass() {
  if (_compassOn) return;
  const start = () => { _compassOn = true; window.addEventListener("deviceorientationabsolute", onOrient, true); window.addEventListener("deviceorientation", onOrient, true); document.querySelectorAll(".map-compass").forEach(c => c.classList.add("on")); toast("指北針已啟用，轉動手機看看"); };
  const DOE = window.DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === "function") {
    DOE.requestPermission().then(p => p === "granted" ? start() : toast("需允許「動作與方向」權限")).catch(() => toast("此裝置無法啟用指北針"));
  } else if (window.DeviceOrientationEvent) start();
  else toast("此裝置不支援方位感測");
}
// 一次問完定位＋方位權限（iOS 方位必須由使用者手勢觸發，故綁在「進 App 的第一次點擊」）
let _entryPermAsked = false;
function requestEntryPerms() {
  if (_entryPermAsked) return; _entryPermAsked = true;
  try { enableCompass(); } catch (e) { /* */ }
  if (navigator.geolocation) { try { navigator.geolocation.getCurrentPosition(() => {}, () => {}, { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }); } catch (e) { /* */ } }
}
// 進 App 第一次互動就問（splash 退場後你碰螢幕的第一下即觸發）
window.addEventListener("pointerdown", requestEntryPerms, { once: true });
window.addEventListener("keydown", requestEntryPerms, { once: true });
function addCompass(map) {
  const c = L.control({ position: "topright" });
  c.onAdd = () => {
    const d = L.DomUtil.create("div", "map-compass" + (_compassOn ? " on" : ""));
    d.title = "指北針（點一下啟用）";
    d.innerHTML = `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18.5" fill="rgba(255,253,248,.94)" stroke="rgba(0,0,0,.15)"/><g class="compass-rose" style="transform-origin:20px 20px;transform:rotate(${-_heading}deg)"><polygon points="20,4 24.5,21 15.5,21" fill="#c0392b"/><polygon points="20,36 24.5,19 15.5,19" fill="#9aa0a6"/><text x="20" y="13.5" text-anchor="middle" font-size="8" font-weight="700" fill="#fff">N</text></g></svg>`;
    L.DomEvent.disableClickPropagation(d);
    d.addEventListener("click", enableCompass);
    return d;
  };
  c.addTo(map);
}
// 地圖全螢幕（用 CSS 假全螢幕，iOS 也支援）
function addFullscreen(map) {
  const c = L.control({ position: "topright" });
  c.onAdd = () => {
    const d = L.DomUtil.create("div", "map-fs-btn");
    d.innerHTML = "⛶"; d.title = "全螢幕";
    L.DomEvent.disableClickPropagation(d);
    d.addEventListener("click", () => {
      const el = map.getContainer();
      const fs = !el.classList.contains("map-fs");
      if (fs) {   // 放大：把地圖搬到 body，脫離捲動/transform 容器 → fixed 才會正確貼齊整個畫面
        el._fsHolder = document.createComment("mfs");
        el.parentNode.insertBefore(el._fsHolder, el);
        document.body.appendChild(el);
        el.classList.add("map-fs"); document.body.classList.add("map-fs-open");
        d.innerHTML = "✕";
      } else {    // 關閉：搬回原位
        el.classList.remove("map-fs"); document.body.classList.remove("map-fs-open");
        if (el._fsHolder) { el._fsHolder.parentNode.insertBefore(el, el._fsHolder); el._fsHolder.remove(); el._fsHolder = null; }
        d.innerHTML = "⛶";
      }
      const fix = () => map.invalidateSize({ animate: false });
      requestAnimationFrame(() => requestAnimationFrame(fix));
      setTimeout(fix, 150); setTimeout(fix, 400);
    });
    return d;
  };
  c.addTo(map);
}
function addBaseWithToggle(map) {   // 加地形(預設)+衛星，明顯的分段切換鈕
  const topo = baseTopo().addTo(map), sat = baseSat();
  const ctrl = L.control({ position: "bottomleft" });
  ctrl.onAdd = () => {
    const d = L.DomUtil.create("div", "basemap-toggle");
    d.innerHTML = `<button class="bm on" data-l="topo">${ic("mountain")} 地形</button><button class="bm" data-l="sat">${ic("globe")} 衛星</button>`;
    L.DomEvent.disableClickPropagation(d);
    d.addEventListener("click", e => {
      const b = e.target.closest(".bm"); if (!b) return;
      if (b.dataset.l === "sat") { map.removeLayer(topo); sat.addTo(map); }
      else { map.removeLayer(sat); topo.addTo(map); }
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
function showBrowseMap() {
  if (!browseMap) {
    browseMap = L.map("browseMap", { zoomControl: true }).setView([23.8, 121], 7);
    addBaseWithToggle(browseMap);
    addCompass(browseMap);       // 指北針只在主頁面地圖
    addFullscreen(browseMap);    // 全螢幕也只在主頁面地圖（正常排版，假全螢幕可正確覆蓋）
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
    const col = closed ? "#b3322a" : (DIFF_COLOR[t.difficulty] || "#888");
    const mk = L.marker([t.lat, t.lon], { icon: pinIcon(col, closed ? "!" : (t.difficulty ?? "")) }).addTo(browseLayer);
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

// 附近半徑篩選（依距離排序開啟後出現）
$("#nearRow").querySelectorAll("[data-radius]").forEach(b => b.addEventListener("click", () => {
  nearRadius = +b.dataset.radius;
  $("#nearRow").querySelectorAll("[data-radius]").forEach(x => x.classList.toggle("active", x === b));
  render();
}));

// 步道路況/封閉警示橫幅
function fmtYmd(s) { return s && s.length === 8 ? `${s.slice(0, 4)}/${s.slice(4, 6)}/${s.slice(6)}` : s; }
function condStamp() {
  const u = (typeof Conditions !== "undefined" && Conditions.lastUpdated()) || 0;
  if (!u) return "";
  return `　·　即時更新於 ${new Date(u).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
}
function conditionBanner(t) {
  const c = t.condition;
  // 有官方公告（落石／坍方／崩塌／封閉等）→ 紅/黃警示橫幅
  if (c && c.status) {
    const closed = /暫停|封閉|關閉/.test(c.status);
    return `<div class="cond-banner ${closed ? "danger" : "warn"}">
      <div class="cond-h">${closed ? "⛔" : "⚠️"} ${c.status}${c.section ? `（${c.section}）` : ""}</div>
      ${c.title ? `<div class="cond-body">${c.title}</div>` : ""}
      ${c.reopen ? `<div class="cond-meta">預計重新開放：${fmtYmd(c.reopen)}　${c.dep || ""}</div>` : ""}
      <div class="cond-meta">資料來源：林業及自然保育署（請以官方公告為準）${condStamp()}</div>
    </div>`;
  }
  // 林業署步道、無公告 → 綠色「通行正常」（給每條步道明確即時狀態）
  if (t.source === "forestry") {
    return `<div class="cond-banner ok">
      <div class="cond-h">✅ 目前無封閉公告，通行正常</div>
      <div class="cond-meta">資料來源：林業及自然保育署即時路況${condStamp()}　·　出發前仍請留意現場天候與狀況</div>
    </div>`;
  }
  // OSM 步道：無官方即時路況來源 → 中性提示，誠實告知
  return `<div class="cond-banner note">
    <div class="cond-h">ℹ️ 無官方即時路況資料</div>
    <div class="cond-meta">此步道非林業署轄管，目前無即時封閉公告來源。出發前請查詢當地主管單位公告或近期山友回報。</div>
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

function myLogHtml() { return ""; }   // 我的步記已移除（完成→圖卡勾勾、分享→記錄總結頁）

// ---------- 詳情面板 ----------
let _detailTrail = null;
function currentDetailTrail() { return $("#detailSheet").classList.contains("show") ? _detailTrail : null; }
async function openDetail(id) {
  const t = TRAILS.find(x => x.id === id);
  if (!t) return;
  _detailTrail = t;
  clearDetailObs();
  // 先開面板給回饋，再（首次）載入幾何
  $("#detailHero").innerHTML = "";
  $("#detailBody").innerHTML = `<div style="padding:54px 20px;text-align:center;color:var(--ink-soft)"><span class="spin"></span>載入中…</div>`;
  $("#sheetMask").classList.add("show");
  $("#detailSheet").classList.add("show");
  $("#detailSheet").scrollTop = 0;
  $("#closeDetailBtn").focus({ preventScroll: true });
  await Promise.all([ensureGeo(), ensureDetail()]);
  mergeDetail(t);                       // 併入 guide/entrances/交通等詳情欄位
  const d = t.difficulty || 0;
  // 只列出有資料的欄位（OSM 步道欄位較少，避免顯示空白「—」）
  const kv = [];
  if (t.length_km != null) kv.push(["長度", `${t.length_km} km${t.source === "osm" ? "（估）" : ""}`]);
  if (t.alt_high != null || t.alt_low != null) kv.push(["海拔範圍", `${t.alt_low ?? "?"}–${t.alt_high ?? "?"} m`]);
  const ascCached = (typeof Profile !== "undefined" && Profile.cachedGain) ? Profile.cachedGain(t.id) : null;
  const ascInit = ascCached != null ? ascCached : (t.ascent != null ? Math.round(t.ascent) : null);
  if (ascInit != null || geoOf(t)) kv.push(["累積爬升", `<span id="kvAscent">${ascInit != null ? ascInit + " m" : "計算中…"}</span>`]);
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
  const hasGeo = !!geoOf(t);
  $("#detailBody").innerHTML = `
    <div class="detail-nav" id="detailNav">
      <button data-sec="top">概覽</button>
      <button data-sec="secWx">天氣</button>
      ${hasGeo ? `<button data-sec="secElev">海拔</button>` : ""}
      <button data-sec="secPoi">景點</button>
      <button data-sec="secFood">美食</button>
    </div>
    <div id="condLive">${conditionBanner(t)}</div>
    ${tagsOf(t).length ? `<div class="tag-row">${tagsOf(t).map(g => `<span class="tag">${TAG_ICON[g] ? TAG_ICON[g] + " " : ""}${g}</span>`).join("")}</div>` : ""}
    ${gradeExplain(t)}
    ${kvHtml}
    <div class="section-title collapsible" id="secWx">${ic("sun")}天氣（步道所在地）</div>
    <div id="weatherBox"><div class="food-loading"><span class="spin"></span>查詢天氣中…</div></div>
    ${metaHtml}
    ${hasGeo ? `<div class="section-title collapsible" id="secElev">${ic("mountain")}海拔剖面</div><div id="profileBox"><div class="food-loading"><span class="spin"></span>計算海拔剖面中…</div></div>` : ""}
    ${t.guide ? `<div class="guide">${t.guide.replace(/\n/g, "<br>")}</div>` : ""}
    <div class="link-row">
      ${nav ? `<a class="link-btn" href="${nav}" target="_blank" rel="noopener">${ic("compass")} 導航</a>` : ""}
      <a class="link-btn" href="${moreSearch}" target="_blank" rel="noopener">${ic("search")} 查資訊</a>
      <button class="link-btn" id="btnShareTrail">${ic("share")} 分享</button>
      <button class="link-btn" id="btnEventTrail">${ic("calendar")} 揪團</button>
      <button class="link-btn" id="btnCompare">${ic("compare")} ${compareSet.has(t.id) ? "移出比較" : "加入比較"}</button>
      ${t.url ? `<a class="link-btn" href="${t.url}" target="_blank" rel="noopener">${ic("external")} 原始頁</a>` : ""}
    </div>
    ${myLogHtml(t)}
    <button class="btn ghost" id="btnOffline" style="margin-top:10px">${ic("download")} 預載此步道離線地圖</button>
    <div id="offlineBox" class="offline-box" style="display:none"></div>
    <div id="amenBox" class="amen-box"></div>
    <div class="section-title collapsible" id="secPoi">${ic("landmark")}附近人文景點</div>
    <div id="poiBox">${skelCards(3)}</div>
    <div class="section-title collapsible" id="secFood">${ic("food")}步道周邊美食</div>
    <div id="foodBox">${skelCards(3)}</div>
    <div id="trailFeedBox"></div>
    <button class="btn primary" id="btnGoRecord">${ic("pin")}在此步道開始記錄</button>
    <div style="font-size:11px;color:var(--ink-soft);text-align:center;margin-top:14px">${credit}</div>
  `;
  // 詳情子頁籤：點一下捲到該區塊
  const navBtns = $("#detailNav").querySelectorAll("button");
  navBtns.forEach(b => b.addEventListener("click", () => {
    const sheet = $("#detailSheet"), sec = b.dataset.sec;
    if (sec === "top") { sheet.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const el = document.getElementById(sec);
    if (el) sheet.scrollTo({ top: el.offsetTop - 52, behavior: "smooth" });
  }));
  // scroll-spy：捲動時高亮目前區塊
  const sheetEl = $("#detailSheet");
  const secIds = ["top", "secWx", "secElev", "secPoi", "secFood"];
  if (_detailScroll) sheetEl.removeEventListener("scroll", _detailScroll);
  _detailScroll = () => {
    const y = sheetEl.scrollTop + 70; let cur = "top";
    for (const id of secIds) { const el = id !== "top" && document.getElementById(id); if (el && el.offsetTop <= y) cur = id; }
    navBtns.forEach(b => b.classList.toggle("on", b.dataset.sec === cur));
  };
  sheetEl.addEventListener("scroll", _detailScroll, { passive: true });
  _detailScroll();
  // 區塊可收合
  $("#detailBody").querySelectorAll(".section-title.collapsible").forEach(hd => hd.addEventListener("click", () => {
    const collapsed = hd.classList.toggle("collapsed");
    const box = hd.nextElementSibling;
    if (box) box.style.display = collapsed ? "none" : "";
  }));
  loadPhoto(t);
  loadWeather(t);
  loadElevation(t);
  loadTrailFeed(t);
  // Places 查詢（設施/美食/景點）較耗額度 → 滑到該區塊才查，省 Google 每日配額
  whenVisible($("#amenBox"), () => loadAmenities(t));
  whenVisible($("#poiBox"), () => loadAttractions(t));
  whenVisible($("#foodBox"), () => loadFood(t));

  setTimeout(() => {
    if (!detailMap) {
      detailMap = L.map("detailMap", { zoomControl: false });
      addBaseWithToggle(detailMap);
      detailOverlay = L.layerGroup().addTo(detailMap);
      detailPoiLayer = L.layerGroup().addTo(detailMap);
    }
    detailOverlay.clearLayers();
    detailPoiLayer.clearLayers();
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
      (t.entrances || []).forEach(e => L.marker([e.lat, e.lon]).addTo(detailOverlay).bindPopup(e.memo || "步道入口"));
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
    selectedTrailId = t.id;                  // 記住步道 id，發文時連回該步道
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
    if (!Store.isFav(t.id) && !favAddAllowed()) return;
    const added = Store.toggleFav(t.id);
    favD.classList.toggle("on", added); favD.textContent = added ? "★ 已收藏" : "☆ 收藏";
    toast(added ? "已加入收藏" : "已移除收藏");
  });

  // 分享步道（含深連結 ?trail=id）
  const shareT = $("#btnShareTrail");
  if (shareT) shareT.addEventListener("click", () => {
    const url = `${location.origin}${location.pathname}?trail=${encodeURIComponent(t.id)}`;
    const text = `${t.name}（${t.difficulty_label}${t.length_km ? " · " + t.length_km + "km" : ""}）— 循徑拾光`;
    if (navigator.share) navigator.share({ title: t.name, text, url }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast("步道連結已複製"));
    else window.open(url, "_blank");
  });
  const evT = $("#btnEventTrail");
  if (evT) evT.addEventListener("click", () => { if (typeof Events !== "undefined") Events.open(t); else toast("社群尚未啟用"); });
  const cmp = $("#btnCompare");
  if (cmp) cmp.addEventListener("click", () => {
    if (compareSet.has(t.id)) compareSet.delete(t.id);
    else { if (compareSet.size >= 3) { toast("最多比較 3 條"); return; } compareSet.add(t.id); }
    const inSet = compareSet.has(t.id);
    cmp.innerHTML = `${ic("compare")} ${inSet ? "移出比較" : "加入比較"}`;   // 動作格內 2 行自動換行
    toast(inSet ? "已加入比較" : "已移出比較");
    updateCompareBar();
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
    const urls = await Photos.forTrailMulti(t, 5);
    if (!urls || !urls.length) return;                  // 無照片：保留漸層等高線底
    hero.classList.remove("noimg");
    const car = document.createElement("div");
    car.className = "hero-carousel";
    car.innerHTML = urls.map(u => `<img alt="${t.name}" src="${u}" loading="lazy">`).join("")
      + (urls.length > 1 ? `<div class="hero-dots">${urls.map((_, i) => `<span class="${i ? "" : "on"}"></span>`).join("")}</div>` : "");
    hero.insertBefore(car, hero.firstChild);
    hero.insertAdjacentHTML("afterbegin", `<div class="hero-credit">Wikimedia Commons${urls.length > 1 ? " · 左右滑看更多" : ""}</div>`);
    car.querySelectorAll("img").forEach((im, idx) => {
      if (im.complete && im.naturalWidth) im.classList.add("loaded");
      else { im.addEventListener("load", () => im.classList.add("loaded")); im.addEventListener("error", () => im.classList.add("loaded")); }
      im.addEventListener("click", () => openLightbox(urls, idx));   // 點圖放大
    });
    if (urls.length > 1) {
      const dots = car.querySelector(".hero-dots");
      car.addEventListener("scroll", () => {
        const i = Math.round(car.scrollLeft / car.clientWidth);
        dots.querySelectorAll("span").forEach((s, k) => s.classList.toggle("on", k === i));
      }, { passive: true });
    }
  } catch { /* 無照片就維持漸層底 */ }
}

// 照片燈箱：全螢幕放大、可左右滑
function openLightbox(urls, start) {
  const ov = document.createElement("div");
  ov.className = "lightbox";
  ov.innerHTML = `<button class="lb-close" aria-label="關閉">✕</button>
    <div class="lb-track">${urls.map(u => `<div class="lb-slide"><img src="${u}" alt=""></div>`).join("")}</div>`;
  document.body.appendChild(ov);
  const track = ov.querySelector(".lb-track");
  track.scrollLeft = (start || 0) * track.clientWidth;
  const close = () => ov.remove();
  ov.querySelector(".lb-close").addEventListener("click", close);
  ov.addEventListener("click", e => { if (e.target === ov || e.target.classList.contains("lb-slide")) close(); });
  const esc = e => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); } };
  document.addEventListener("keydown", esc);
}

async function loadElevation(t) {
  const box = $("#profileBox");
  if (!box) return;
  try {
    const p = await Profile.build(t.id, geoOf(t));
    if (!p) { box.style.display = "none"; return; }
    if (p.gain != null) {
      const kvA = $("#kvAscent"); if (kvA) kvA.textContent = p.gain + " m";   // 詳情頁即時覆蓋
      // 同步更新探索列表中該步道卡的累積爬升（不必重開 App）
      const sel = (window.CSS && CSS.escape) ? CSS.escape(t.id) : t.id;
      document.querySelectorAll(`#trailList .card[data-id="${sel}"] [data-card-asc]`).forEach(el => { el.textContent = "↑" + p.gain; });
    }
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
    const wd = i => i === 0 ? "今天" : `週${days[new Date(dd.time[i]).getDay()]}`;
    // 最適出發日：降雨機率低 + 體感舒適(均溫近 22°C)
    let best = 0, bestScore = Infinity;
    for (let i = 0; i < dd.time.length; i++) {
      const pp = dd.precipitation_probability_max[i] ?? 50;
      const avg = (dd.temperature_2m_max[i] + dd.temperature_2m_min[i]) / 2;
      // 舒適帶 16–26°C 不罰；過冷過熱加倍罰；降雨為主、≥70% 額外重罰
      const tempPen = avg < 16 ? (16 - avg) * 2 : avg > 26 ? (avg - 26) * 2 : 0;
      const score = pp * 1.3 + tempPen + (pp >= 70 ? 25 : 0);
      if (score < bestScore) { bestScore = score; best = i; }
    }
    // 溫度曲線(最高溫)
    const tmax = dd.temperature_2m_max, lo = Math.min(...tmax), hi = Math.max(...tmax), span = (hi - lo) || 1;
    const W = 280, H = 44, pad = 6, n = tmax.length;
    const xy = tmax.map((v, i) => [pad + (W - 2 * pad) * i / (n - 1), pad + (H - 2 * pad) * (1 - (v - lo) / span)]);
    const line = xy.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(0)},${p[1].toFixed(0)}`).join(" ");
    const dots = xy.map((p, i) => `<circle cx="${p[0].toFixed(0)}" cy="${p[1].toFixed(0)}" r="${i === best ? 4 : 2.5}" fill="${i === best ? "#e8893b" : "var(--brand-mid)"}"/>`).join("");
    const fc = dd.time.map((t2, i) => {
      const [e2] = Weather.desc(dd.weather_code[i]);
      return `<div class="wx-day${i === best ? " best" : ""}"><div class="wx-d">${wd(i)}</div><div class="wx-e">${e2}</div>
        <div class="wx-t">${Math.round(dd.temperature_2m_min[i])}°/${Math.round(dd.temperature_2m_max[i])}°</div>
        <div class="wx-p">💧${dd.precipitation_probability_max[i] ?? "—"}%</div></div>`;
    }).join("");
    box.innerHTML = `<div class="wx-now">
        <span class="wx-now-e">${emo}</span>
        <span class="wx-now-t">${Math.round(c.temperature_2m)}°C</span>
        <span class="wx-now-d">${txt}　濕度 ${c.relative_humidity_2m}%　風 ${Math.round(c.wind_speed_10m)} km/h</span>
      </div>
      <div class="wx-best">🌤 最適合出發：<b>${wd(best)}</b>（降雨 ${dd.precipitation_probability_max[best] ?? "—"}%、${Math.round(dd.temperature_2m_min[best])}–${Math.round(dd.temperature_2m_max[best])}°）</div>
      <svg class="wx-curve" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${line}" fill="none" stroke="var(--brand-mid)" stroke-width="2"/>${dots}</svg>
      <div class="wx-fc">${fc}</div>
      <div class="food-credit">天氣資料：Open-Meteo · 7 日預報</div>`;
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
    plotPoi(_foodItems, "#c2683d");
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
      <button class="food-sort-btn${_foodSort === "distance" ? " on" : ""}" data-fsort="distance">${ic("pin")}距離</button>
      <button class="food-sort-btn${_foodSort === "rating" ? " on" : ""}" data-fsort="rating">${ic("star")}星級</button>
    </div>
    <div class="food-list">${items.map(f => `
      <a class="food-item" href="${f.uri || "#"}" target="_blank" rel="noopener">
        <span class="food-kind">${f.kind}</span>
        <span class="food-name">${f.name}</span>
        ${foodStars(f)}
        <span class="food-dist">${(f.dist / 1000).toFixed(1)}km</span>
      </a>`).join("")}</div>
    <div class="food-credit">🟠 已標於上方地圖　·　星級來源：Google 地圖</div>`;
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
    plotPoi(_poiItems, "#3b6ea5");
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
      <button class="food-sort-btn${_poiSort === "distance" ? " on" : ""}" data-psort="distance">${ic("pin")}距離</button>
      <button class="food-sort-btn${_poiSort === "rating" ? " on" : ""}" data-psort="rating">${ic("star")}評價</button>
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
    <div class="food-credit">🔵 已標於上方地圖　·　來源：Google 地圖</div>`;
  box.querySelectorAll(".food-sort-btn").forEach(b =>
    b.addEventListener("click", () => { _poiSort = b.dataset.psort; renderAttractions(); }));
}

// Premium：離線地圖免費 5 次，用完才需升級。回傳是否允許本次下載（允許則計入並提醒剩餘）。
// 非會員離線地圖：以容量（MB）計額度，一次大量下載也照實際大小扣，會員不限
const OFFLINE_FREE_MB = 50;
const TILE_EST_MB = 0.02;   // 估每張圖磚約 20 KB（顯示用；實際扣款以下載 bytes 為準）
function offlineMbUsed() { return +(localStorage.getItem("tt_offline_mb") || 0); }
function addOfflineMb(mb) { if (mb > 0) localStorage.setItem("tt_offline_mb", String(+(offlineMbUsed() + mb).toFixed(2))); }
function offlineAllow(tiles, silent) {
  if (typeof Premium !== "undefined" && Premium.isOn()) return true;   // 會員無限
  const need = (tiles ? tiles.length : 0) * TILE_EST_MB;
  const left = OFFLINE_FREE_MB - offlineMbUsed();
  if (need > left) {
    if (!silent) {
      toast(`免費離線地圖額度不足（剩 ${Math.max(0, left).toFixed(1)} MB，這次約需 ${need.toFixed(1)} MB），升級 Premium 無限下載`);
      if (typeof Premium !== "undefined") Premium.openUpgrade();
    }
    return false;
  }
  return true;
}

// Premium：免費收藏上限 20，會員無限。回傳是否可再加收藏。
const FAV_FREE = 20;
function favAddAllowed() {
  if (typeof Premium !== "undefined" && Premium.isOn()) return true;
  if (Store.getFavs().length >= FAV_FREE) {
    toast(`免費收藏上限 ${FAV_FREE} 條，升級 Premium 無限收藏`);
    if (typeof Premium !== "undefined") Premium.openUpgrade();
    return false;
  }
  return true;
}

// 預載此步道範圍的離線地圖圖磚
// 一鍵下載全台離線地圖（概覽，縮放 7–13；自動壓低 zmax 以控制張數）
async function downloadAllTaiwan() {
  const bbox = { n: 25.35, s: 21.85, e: 122.05, w: 119.95 };
  let zmax = 13;
  while (zmax > 9 && Offline.tileList(bbox, 7, zmax).length > 6000) zmax--;
  const tiles = Offline.tileList(bbox, 7, zmax);
  const btn = $("#btnAllOffline"), box = $("#allOfflineBox");
  if (!confirm(`下載全台離線地圖（縮放 7–${zmax}）約 ${tiles.length} 張圖磚、約 ${(tiles.length * 0.02).toFixed(0)} MB？\n\n可離線看全島概覽；個別步道細節請另在步道詳情按「預載離線地圖」。\n下載需幾分鐘，請保持開啟。`)) return;
  if (!offlineAllow(tiles)) return;   // 非會員：MB 額度制
  box.style.display = "block";
  btn.disabled = true; btn.textContent = "下載中…";
  try {
    const r = await Offline.download(tiles, (done, total) => {
      box.innerHTML = `下載全台地圖中… ${done}/${total}<div class="offline-bar"><i style="width:${Math.round(done / total * 100)}%"></i></div>`;
    });
    addOfflineMb(r.mb);
    box.innerHTML = `✅ 已下載 ${r.ok}/${r.total} 張圖磚，全台概覽地圖可離線看了。`;
    btn.textContent = "✓ 已下載全台離線地圖";
    refreshOfflineStatus();
  } catch {
    box.innerHTML = "下載失敗，請確認網路後再試。";
    btn.disabled = false; btn.innerHTML = `${ic("globe")} 一鍵下載全台離線地圖（概覽）`;
  }
}
// 一鍵預載所有收藏步道的離線地圖
async function downloadFavOffline() {
  const favs = TRAILS.filter(t => Store.isFav(t.id) && t.lat);
  const btn = $("#btnFavOffline"), box = $("#favOfflineBox");
  if (!favs.length) { toast("尚無含座標的收藏步道"); return; }
  const seen = new Set(); let tiles = [];
  for (const t of favs) {
    const bbox = Offline.bboxFor(t);
    const { zmin, zmax } = Offline.planZoom(bbox);
    for (const k of Offline.tileList(bbox, zmin, zmax)) {
      const key = JSON.stringify(k);
      if (!seen.has(key)) { seen.add(key); tiles.push(k); }
    }
  }
  if (!offlineAllow(tiles)) return;   // 非會員：MB 額度制
  box.style.display = "block";
  box.innerHTML = `準備下載 ${favs.length} 條收藏、約 ${tiles.length} 張圖磚（約 ${(tiles.length * 0.02).toFixed(1)} MB）…`;
  btn.disabled = true; btn.textContent = "下載中…";
  try {
    const r = await Offline.download(tiles, (done, total) => {
      box.innerHTML = `下載中… ${done}/${total}<div class="offline-bar"><i style="width:${Math.round(done / total * 100)}%"></i></div>`;
    });
    addOfflineMb(r.mb);
    box.innerHTML = `✅ 已下載 ${r.ok}/${r.total} 張圖磚，${favs.length} 條收藏步道可離線看地圖了。`;
    btn.textContent = "✓ 已預載收藏";
    refreshOfflineStatus();
  } catch {
    box.innerHTML = "下載失敗，請確認網路後再試。";
    btn.disabled = false; btn.innerHTML = `${ic("download")} 預載所有收藏步道的離線地圖`;
  }
}
async function downloadOffline(t, btn) {
  if (!t.lat) { toast("此步道無座標，無法下載地圖"); return; }
  const box = $("#offlineBox");
  const bbox = Offline.bboxFor(t);
  const { zmin, zmax } = Offline.planZoom(bbox);
  const tiles = Offline.tileList(bbox, zmin, zmax);
  if (!offlineAllow(tiles)) return;   // 非會員：MB 額度制
  box.style.display = "block";
  box.innerHTML = `準備下載約 ${tiles.length} 張圖磚（約 ${(tiles.length * 0.02).toFixed(1)} MB）…`;
  btn.disabled = true; btn.textContent = "下載中…";
  try {
    const r = await Offline.download(tiles, (done, total) => {
      box.innerHTML = `下載離線地圖中… ${done}/${total}
        <div class="offline-bar"><i style="width:${Math.round(done / total * 100)}%"></i></div>`;
    });
    addOfflineMb(r.mb);
    box.innerHTML = `✅ 已下載 ${r.ok}/${r.total} 張圖磚，此步道範圍可離線看地圖了。`;
    btn.textContent = "✓ 已預載離線地圖";
  } catch {
    box.innerHTML = "下載失敗，請確認網路後再試。";
    btn.disabled = false; btn.innerHTML = `${ic("download")} 預載此步道離線地圖`;
  }
}

function closeDetail() {
  clearDetailObs();
  $("#sheetMask").classList.remove("show");
  $("#detailSheet").classList.remove("show");
}
$("#sheetMask").addEventListener("click", closeDetail);
$("#closeDetailBtn").addEventListener("click", closeDetail);
// 下拉關閉手勢（拖曳握把往下滑關閉面板）
function makeSheetDraggable(sheet, closeFn) {
  const grip = sheet.querySelector(".grip"); if (!grip) return;
  let startY = null, dy = 0;
  grip.addEventListener("touchstart", e => { startY = e.touches[0].clientY; dy = 0; sheet.style.transition = "none"; }, { passive: true });
  grip.addEventListener("touchmove", e => { if (startY == null) return; dy = Math.max(0, e.touches[0].clientY - startY); sheet.style.transform = `translateY(${dy}px)`; }, { passive: true });
  grip.addEventListener("touchend", () => {
    if (startY == null) return;
    sheet.style.transition = ""; sheet.style.transform = "";
    if (dy > 110) closeFn();
    startY = null;
  });
}
["detailSheet:closeDetail", "trackSheet:closeTrackReview", "filterSheet:closeFilter", "gradeSheet:closeGradeInfo"].forEach(pair => {
  const [id, fn] = pair.split(":");
  const el = document.getElementById(id);
  if (el) makeSheetDraggable(el, () => window[fn] && window[fn]());
});

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
let trackMap = null, trackLayer = null, trackAnim = null, trackReplayLayer = null, trackPts = null, trackSegsLL = null, trackStats = null;
const _hav = (a, b) => haversine({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] });
// 結算頁滑行重播：marker 沿軌跡滑行、路線同步畫出（約8秒）
function playTrackReplay(pts, segLL) {
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
      grow.setLatLngs(finalLL);
      L.circleMarker(pts[pts.length - 1], { radius: 6, color: "#fff", weight: 2, fillColor: "#d2542e", fillOpacity: 1 }).addTo(trackReplayLayer);
      live.innerHTML = `<b>${(trackStats ? trackStats.km : d / 1000).toFixed(2)}</b> km　·　${fmtTime(totMs)}　🏁`;
      trackMap.flyToBounds(fullBounds, { padding: [24, 24], duration: 0.8 });   // 走完拉遠看全程
    }
  }, interval);
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
async function loadTrailFeed(t) {
  const box = $("#trailFeedBox"); if (!box) return;
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
function openTrackReview(rec) {
  if (!rec) return;
  _shotUrls.forEach(u => URL.revokeObjectURL(u)); _shotUrls = [];   // 回收上一份結算的照片 URL
  const km = rec.distanceKm || 0, t3 = rec.distance3DKm;
  $("#trackBody").innerHTML = `
    <h2>${rec.trailName || "自由路線"}</h2>
    <div class="track-date">${new Date(rec.date).toLocaleString("zh-TW")}</div>
    <div class="kv">
      <div class="item"><div class="l">距離</div><div class="v">${km.toFixed(2)} km</div></div>
      <div class="item"><div class="l">時間</div><div class="v">${fmtTime(rec.elapsedMs)}</div></div>
      <div class="item"><div class="l">總爬升${rec.altCorrected ? " ·已校正" : ""}</div><div class="v">↑${rec.ascent || 0} m</div></div>
      <div class="item"><div class="l">總下降</div><div class="v">↓${rec.descent || 0} m</div></div>
      <div class="item"><div class="l">卡路里</div><div class="v">${rec.kcal} 大卡</div></div>
      <div class="item"><div class="l">步數</div><div class="v">${(rec.steps || 0).toLocaleString()}</div></div>
      ${t3 && t3 > km + 0.05 ? `<div class="item"><div class="l">含坡度距離</div><div class="v">${t3.toFixed(2)} km</div></div>` : ""}
    </div>
    ${(rec.id === hikePhotosRecId && hikePhotos.length) ? `<div class="section-title">${ic("camera")}隨手拍（${hikePhotos.length}）<span class="shot-hint">點照片存到相簿</span></div>
      <div class="hike-shots">${hikePhotos.map((p, i) => `<figure class="shot" data-i="${i}"><img src="${(u => { _shotUrls.push(u); return u; })(URL.createObjectURL(p.file))}" alt=""><figcaption>${new Date(p.t).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })} · ${p.km.toFixed(2)}km</figcaption></figure>`).join("")}</div>` : ""}
    <div class="link-row">
      <button class="link-btn" id="trackReplay">${ic("play")} 重播路徑</button>
      <button class="link-btn" id="trackCard">${ic("camera")} 分享圖卡</button>
      <button class="link-btn" id="trackGpx">${ic("download")} 下載路線檔</button>
      <button class="link-btn" id="trackShare">${ic("share")} 分享行程</button>
      ${rec.sim ? "" : `<button class="link-btn" id="trackSocial">${ic("megaphone")} 分享到社群</button>`}
    </div>`;
  $("#trackMask").classList.add("show");
  $("#trackSheet").classList.add("show");
  $("#trackSheet").scrollTop = 0;
  setTimeout(() => {
    if (!trackMap) {
      trackMap = L.map("trackMap", { zoomControl: false });
      baseTopo().addTo(trackMap);
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
  $("#trackCard").addEventListener("click", () => shareHikeCard(rec));
  $("#trackGpx").addEventListener("click", () => { GPX.exportRecord(rec); toast("已下載路線檔"); });
  $("#trackShare").addEventListener("click", () => {
    const text = `我走了 ${rec.trailName || "自由路線"}：${km.toFixed(2)} km、爬升 ↑${rec.ascent || 0}m、${rec.kcal} 大卡、${fmtTime(rec.elapsedMs)} ⛰️ — 循徑拾光`;
    if (navigator.share) navigator.share({ title: "我的健行紀錄", text }).catch(() => {});
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
    x.fillText("循徑拾光 · GATHER THE TRAIL", 70, 96);
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
      (rec.track || []).forEach((p, i) => {
        const px = ox + (p.lon - minLo) * sc, py = oy + (maxLa - p.lat) * sc;
        (i && !p.gap) ? x.lineTo(px, py) : x.moveTo(px, py);   // gap＝暫停跳段，不連線
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
    const file = new File([blob], "循徑拾光.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "我的健行紀錄" });
    } else {
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "循徑拾光健行卡.png"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast("圖卡已下載");
    }
  } catch (e) { toast("圖卡產生失敗"); }
}
$("#trackMask").addEventListener("click", closeTrackReview);
$("#closeTrackBtn").addEventListener("click", closeTrackReview);

let guideLine = null, selectedTrailGeo = null, routeRefLayer = null, selectedTrailId = null;
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
    baseTopo().addTo(recMap); addCompass(recMap); addFullscreen(recMap);
    recLine = L.polyline([], { color: "#2f7d4f", weight: 5 }).addTo(recMap);
  }
  recMap.invalidateSize();
  // 復原中的軌跡重畫（依 gap 分段，暫停跳段不連線）
  if (recLine && Recorder.getState() !== "idle") {
    const tr = Recorder.snapshot().track || [];
    const pts = tr.map(p => [p.lat, p.lon]);
    if (pts.length) { recLine.setLatLngs(trackSegments(tr).map(s => s.map(p => [p.lat, p.lon]))); setTimeout(() => recMap.fitBounds(L.polyline(pts).getBounds(), { padding: [20, 20] }), 60); }
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
  if (!series || series.length < 3) { box.style.display = "none"; return; }
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
  box.style.display = "block";
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="rec-spark" preserveAspectRatio="none">
      <path d="${area}" fill="rgba(63,122,85,.18)"/>
      <path d="${line}" fill="none" stroke="var(--brand-mid)" stroke-width="2" stroke-linejoin="round"/>
    </svg><div class="rec-spark-cap">即時海拔 ${Math.round(es[es.length - 1])}m　·　${Math.round(minE)}–${Math.round(maxE)}m</div>`;
}
// 隨拍隨傳：記錄中拍照，存當下時間與里程；結算頁顯示、可選擇分享
let hikePhotos = [], hikePhotosRecId = null, recSnap = null, _shotUrls = [];
let _liveElev = null, _liveElevAt = 0, _liveElevLen = 0, _liveElevBusy = false;
Recorder.onUpdate(s => {
  recSnap = s;
  $("#stDist").textContent = s.distanceKm.toFixed(2);
  $("#stSteps").textContent = s.steps.toLocaleString();
  $("#stKcal").textContent = s.kcal;
  $("#stTime").textContent = fmtTime(s.elapsedMs);
  $("#stPace").textContent = (s.state === "running" && s.instKmh != null) ? s.instKmh.toFixed(1) : "--";
  if (s.state === "idle") { _liveElev = null; _liveElevAt = 0; _liveElevLen = 0; }   // 新記錄重置
  // GPS 高度常為 null → 即時爬升會卡在 0；用地形 DEM 節流校正，讓即時值接近結算值
  if (s.state === "running" && navigator.onLine && typeof Elevation !== "undefined" && s.track && s.track.length >= 8) {
    const now = Date.now();
    if (!_liveElevBusy && now - _liveElevAt > 30000 && s.track.length - _liveElevLen >= 8) {
      _liveElevBusy = true; _liveElevAt = now; _liveElevLen = s.track.length;
      Elevation.correct(s.track.slice()).then(c => { if (c) _liveElev = c; _liveElevBusy = false; }).catch(() => { _liveElevBusy = false; });
    }
  }
  const ad = (_liveElev && (s.ascent || 0) < _liveElev.ascent) ? _liveElev : s;   // 取較準（GPS 為 0 時用 DEM）
  if ($("#stAscent")) $("#stAscent").textContent = `↑${Math.round(ad.ascent || 0)}`;
  if ($("#stDescent")) $("#stDescent").textContent = `↓${Math.round(ad.descent || 0)}`;
  drawRecSpark(s.altSeries);
  // #11 每公里震動提示 + 果實收集提示（每走 1 km 得 1 顆 🍓）
  if (s.state === "running" && !s.autoPaused) {
    const kmDone = Math.floor(s.distanceKm);
    if (kmDone > lastKmMilestone) {
      const gained = kmDone - lastKmMilestone;
      lastKmMilestone = kmDone;
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
      if (!sim()) toast(`🍓 收集到果實 +${gained}！已走 ${kmDone} km，繼續加油`);
    }
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
    recLine.setLatLngs(trackSegments(s.track).map(seg => seg.map(p => [p.lat, p.lon])));   // 依 gap 分段畫線
    const last = pts[pts.length - 1];
    const meAv = window.__meAvatar;   // 登入且有頭像才用頭像標記
    if (meAv) {
      // 自己的原點＝頭像 + 寵物徽章（與隊友一致）；移除浮動寵物避免重複
      if (!recMarker || !recMarker._av) {
        if (recMarker) recMap.removeLayer(recMarker);
        const mePro = (typeof Premium !== "undefined" && Premium.isOn()) ? " pro" : "";
        recMarker = L.marker(last, { icon: L.divIcon({ className: "team-marker me-marker" + mePro, html: `<div class="tm-av"><div class="tm-dir"><span class="tm-cone"></span></div><img src="${meAv}" alt=""><span class="tm-pet">${petEmojiNow()}</span></div>`, iconSize: [32, 32], iconAnchor: [16, 16] }), zIndexOffset: 1100 }).addTo(recMap);
        recMarker._av = true;
      }
      recMarker.setLatLng(last);
      if (s.heading != null) _gpsHeading = s.heading;
      updateMeCone();   // 面朝方向：羅盤優先，否則 GPS 行進方向
      if (petMarker) { recMap.removeLayer(petMarker); petMarker = null; }
    } else {
      if (!recMarker || recMarker._av) {
        if (recMarker) recMap.removeLayer(recMarker);
        recMarker = L.circleMarker(last, { radius: 7, color: "#fff", weight: 3, fillColor: "#e8893b", fillOpacity: 1 }).addTo(recMap);
      }
      recMarker.setLatLng(last);
      // 山林夥伴同行：寵物跟在當前位置上方
      if (!petMarker) petMarker = L.marker(last, {
        icon: L.divIcon({ className: "pet-marker", html: `<span class="pm-e">${petEmojiNow()}</span>`, iconSize: [34, 34], iconAnchor: [17, 30] }),
        interactive: false, zIndexOffset: 1000,
      }).addTo(recMap);
      petMarker.setLatLng(last);
    }
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
// 螢幕保持喚醒：勾選後記錄中螢幕不熄滅（持久化記住選擇；裝置不支援則隱藏此選項）
(() => {
  const chk = $("#wakeLockToggle"), opt = $("#wakeLockOpt");
  if (!chk) return;
  if (!("wakeLock" in navigator)) { if (opt) opt.style.display = "none"; return; }
  chk.checked = localStorage.getItem("tt_wakelock") === "1";
  Recorder.setWake(chk.checked);
  chk.addEventListener("change", e => {
    localStorage.setItem("tt_wakelock", e.target.checked ? "1" : "0");
    Recorder.setWake(e.target.checked);
    toast(e.target.checked ? "已開螢幕保持喚醒（記錄中螢幕不熄滅）" : "已關螢幕保持喚醒");
  });
})();
$("#simToggle").addEventListener("change", e => {
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
$("#btnSnap").addEventListener("click", () => $("#snapInput").click());
$("#snapInput").addEventListener("change", e => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  const km = recSnap ? (recSnap.distanceKm || 0) : 0;
  hikePhotos.push({ file: f, t: Date.now(), km });
  $("#snapCount").textContent = ` (${hikePhotos.length})`;
  toast(`已拍照 · ${km.toFixed(2)}km`);
});
$("#btnTeam").addEventListener("click", () => { initRecMap(); if (typeof Team !== "undefined") Team.openSheet(); });
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

// 開始記錄時，背景預載當前位置周邊圖磚（保險，避免途中失去訊號）。
// 這也是離線地圖：非會員縮小範圍（±1km、縮放 14–15）並計入 MB 額度；額度不足只跳過預載、不影響記錄。Premium 完整預載（±2km、14–16）。
let recPreloaded = false;
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
// 開始記錄（本人按鈕 / 小隊隊長廣播都走這裡）
function startRecordingUI() {
  initRecMap();
  ensureMeAvatar();
  const ri = $("#recIdle"); if (ri) ri.style.display = "none";
  // 模擬模式：沿步道真實路線行走（有動畫感）。沒選步道就自動挑一條真實步道。
  if (sim() && Recorder.getState() !== "paused") {
    if (!(selectedTrailGeo && selectedTrailGeo.length)) {
      const t = pickSimTrail();
      if (t) {
        selectedTrailGeo = geoOf(t);
        selectedTrailId = t.id;
        Recorder._trailName = t.name;
        $("#recStatus").textContent = `模擬「${t.name}」路線`;
        drawSelectedRoute();
        toast(`模擬：沿「${t.name}」前進`);
      }
    } else {
      toast("模擬：沿此步道路線前進");
    }
    const route = selectedTrailGeo && selectedTrailGeo.length ? chainSegments(selectedTrailGeo) : null;   // 串接全部路段，整條走完
    Recorder.setSimRoute(route);
  }
  if (Recorder.getState() === "paused") Recorder.resume(sim());
  else { hikePhotos = []; $("#snapCount").textContent = ""; Recorder.start(sim()); }   // 新的一趟：清空隨手拍
  $("#btnStart").style.display = "none";
  $("#btnPause").style.display = "block";
  $("#btnStop").style.display = "block";
  if (!sim()) $("#btnSnap").style.display = "block";   // 模擬不拍照
}
$("#btnStart").addEventListener("click", () => {
  // 小隊同行中：只有隊長能開始，且需全員（含隊長）已按「準備」；隊長開始時廣播全隊一起開始
  if (typeof TeamLive !== "undefined" && TeamLive.isOn() && Recorder.getState() === "idle") {
    if (!TeamLive.isLeader()) { toast("小隊記錄由隊長開始：請先按「✋ 準備」，等隊長按開始"); return; }
    if (!TeamLive.allReady()) {
      const nr = TeamLive.notReadyNames();
      toast(nr.length ? `還沒準備：${nr.join("、")}（全員按「準備」後才能一起開始）` : "還有隊員未準備，全員按「準備」後才能一起開始");
      return;
    }
    TeamLive.sendStart();
  }
  startRecordingUI();
});
// 收到隊長的開始廣播 → 已按準備的隊員自動一起開始記錄
if (typeof TeamLive !== "undefined" && TeamLive.onStart) TeamLive.onStart(() => {
  if (Recorder.getState() === "running") return;
  const tab = document.querySelector('.tab[data-view="record"]'); if (tab) tab.click();
  toast("👑 隊長開始了！小隊一起記錄");
  startRecordingUI();
});
$("#btnPause").addEventListener("click", () => {
  Recorder.pause();
  $("#btnStart").textContent = "▶ 繼續";
  $("#btnStart").style.display = "block";
  $("#btnPause").style.display = "none";
});
async function finishRecording(autoVehicle) {
  const rec = Recorder.stop();
  recPreloaded = false; lastKmMilestone = 0;   // 下次記錄重新預載/里程碑
  $("#btnStart").textContent = "▶ 開始";
  $("#btnStart").style.display = "block";
  $("#btnPause").style.display = "none";
  $("#btnStop").style.display = "none";
  $("#btnSnap").style.display = "none";
  if (rec) hikePhotosRecId = rec.id;   // 隨手拍歸屬這趟，結算頁才顯示
  if (recMarker) { recMap.removeLayer(recMarker); recMarker = null; }
  if (petMarker) { recMap.removeLayer(petMarker); petMarker = null; }
  recLine.setLatLngs([]);
  if (autoVehicle) toast("偵測到車輛速度（>20km/h），已自動結束記錄");
  if (rec) {
    rec.trailName = Recorder._trailName || "自由路線";
    if (selectedTrailId) rec.trailId = selectedTrailId;   // 連回步道，供社群貼文點擊開啟
    // 地形海拔校正(DEM)：自動內建，用準確的水平軌跡查真實地面高度重算爬升/下降（GPS 高度太雜）
    // 模擬也校正：沿真實步道座標查地形，原路折返自然會有對應的下降（不再只計爬升）
    if (!rec.vehicle && rec.track && rec.track.length > 1 && navigator.onLine && typeof Elevation !== "undefined") {
      $("#recStatus").textContent = "海拔校正中…";
      const corr = await Promise.race([Elevation.correct(rec.track), new Promise(r => setTimeout(() => r(null), 6000))]);
      if (corr) { rec.ascent = corr.ascent; rec.descent = corr.descent; rec.altHigh = corr.altHigh; rec.altLow = corr.altLow; rec.altCorrected = true; }
    }
    Store.addRecord(rec);
    if (isFootRec(rec)) bumpAffinity(8);   // 只有走路/跑步加深羈絆
    checkPetEvolve();
    $("#recStatus").textContent = autoVehicle ? "偵測到車輛速度，已自動結束" : "準備就緒，按「開始」記錄路徑";
    openTrackReview(rec);              // 結束後顯示總結頁
    if (isFootRec(rec)) confetti();
    renderRecIdle();
  } else {
    toast(autoVehicle ? "偵測到車輛速度，已停止（路徑太短，未儲存）" : "路徑太短，未儲存");
    $("#recStatus").textContent = "準備就緒，按「開始」記錄路徑";
  }
}
$("#btnStop").addEventListener("click", () => finishRecording(false));
// 偵測到車輛速度(>20km/h)→記錄器自動斷掉→跑與按「結束」相同的收尾流程
Recorder.onAutoStop(() => finishRecording(true));

// ---------- 我的 ----------
function loadProfile() {
  const p = Store.getProfile();
  if (p.weight) $("#pfWeight").value = p.weight;
  if (p.height) $("#pfHeight").value = p.height;
  if (p.pack) $("#pfPack").value = p.pack;
}
$("#btnSaveProfile").addEventListener("click", () => {
  Store.saveProfile({ weight: Number($("#pfWeight").value) || 60, height: Number($("#pfHeight").value) || 170, pack: Math.max(0, Number($("#pfPack").value) || 0) });
  toast("已儲存個人資料");
});
$("#btnExportGpxAll").addEventListener("click", () => {
  GPX.exportAll(Store.getRecords()) ? toast("已下載全部行程路線檔") : toast("尚無行程可下載");
});

async function refreshOfflineStatus() {
  const el = $("#offlineStatus");
  if (!el) return;
  const n = await Offline.cachedCount();
  el.textContent = n ? `已快取地圖圖磚：${n} 張（約 ${(n * 0.02).toFixed(1)} MB）` : "尚未下載任何離線地圖";
  const q = $("#offlineQuota");
  if (q) {
    if (typeof Premium !== "undefined" && Premium.isOn()) q.innerHTML = `<span class="oq-pro">${ic("sparkle")} Premium：無限下載</span>`;
    else { const left = Math.max(0, OFFLINE_FREE_MB - offlineMbUsed()); q.innerHTML = `免費額度：剩 <b>${left.toFixed(1)}</b> / ${OFFLINE_FREE_MB} MB（含記錄時預載）<div class="oq-up-line"><a class="oq-up" id="oqUp">升級 Premium 無限下載</a></div>`; const up = $("#oqUp"); if (up) up.addEventListener("click", () => { if (typeof Premium !== "undefined") Premium.openUpgrade(); }); }
  }
}
$("#btnDiag").addEventListener("click", () => {
  const errs = (window.ttErrors ? window.ttErrors() : []);
  const info = `循徑拾光診斷\n版本SW:${"v34"}\n螢幕:${innerWidth}x${innerHeight}\n步道資料:${TRAILS.length}條\n近期錯誤(${errs.length}):\n` +
    (errs.slice(0, 8).map(e => `· ${e.t.slice(5, 16)} ${e.m}`).join("\n") || "（無）");
  if (navigator.clipboard) navigator.clipboard.writeText(info).then(() => toast(errs.length ? `已複製診斷(${errs.length}筆錯誤)，可貼給開發者` : "已複製診斷，目前無錯誤"));
  else alert(info);
});
$("#btnFootMap").addEventListener("click", () => { if (typeof Premium !== "undefined" && !Premium.gate()) return; openFootprintMap(); });
$("#btnAllOffline").addEventListener("click", downloadAllTaiwan);
$("#btnFavOffline").addEventListener("click", downloadFavOffline);

// Premium：雲端備份 / 還原（跨裝置）
async function cloudClient() {
  if (typeof Supa === "undefined" || !Supa.ready()) { toast("社群尚未啟用"); return null; }
  const c = Supa.client(); const { data: u } = await c.auth.getUser();
  if (!u || !u.user) { toast("請先到社群分頁登入"); return null; }
  return { c, uid: u.user.id };
}
const _cbk = $("#btnCloudBackup");
if (_cbk) _cbk.addEventListener("click", async () => {
  if (typeof Premium !== "undefined" && !Premium.gate()) return;
  const x = await cloudClient(); if (!x) return;
  try {
    toast("備份到雲端中…");
    const { error } = await x.c.from("backups").upsert({ user_id: x.uid, data: Store.exportAll(), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    toast(error ? "備份失敗：" + error.message : "已備份到雲端 ✓");
  } catch (e) { toast("備份失敗：" + (e && e.message || e)); }
});
const _crs = $("#btnCloudRestore");
if (_crs) _crs.addEventListener("click", async () => {
  if (typeof Premium !== "undefined" && !Premium.gate()) return;
  const x = await cloudClient(); if (!x) return;
  try {
    const { data, error } = await x.c.from("backups").select("data, updated_at").eq("user_id", x.uid).maybeSingle();
    if (error) { toast("還原失敗：" + error.message); return; }
    if (!data) { toast("雲端尚無備份，請先按「雲端備份」"); return; }
    const when = new Date(data.updated_at).toLocaleString("zh-TW");
    const merge = confirm(`雲端備份（${when}）\n\n要『合併』到現有資料嗎？\n確定 = 合併\n取消 = 完全取代`);
    Store.importAll(data.data, merge ? "merge" : "replace");
    renderHistory(); render();
    // 主題/外觀與寵物、任務、成就一併還原後重繪
    try { initTheme(); renderPet(); renderQuests(); renderBadges(); renderStats(); loadProfile(); } catch (e) { /* 個別區塊未載入時忽略 */ }
    toast("已從雲端還原 ✓");
  } catch (e) { toast("還原失敗：" + (e && e.message || e)); }
});
if (typeof Premium !== "undefined") { setTimeout(() => Premium.refresh(), 1500); Premium.handleReturn(); }   // 啟動後同步會員狀態 + 處理結帳返回

// 進階分析：整頁 PRO（與年度回顧一致）
const _aBtn = $("#btnAnalytics");
if (_aBtn) _aBtn.addEventListener("click", () => { if (typeof Premium !== "undefined" && !Premium.gate()) return; openAnalytics(); });
// 年度回顧（PRO）
const _yBtn = $("#btnYearReview");
if (_yBtn) _yBtn.addEventListener("click", () => { if (typeof Premium !== "undefined" && !Premium.gate()) return; openYearReview(); });
// 動畫數字 span（配合 countUp）
function cuSpan(to, pre, dec) { return `<span class="cu" data-to="${to}" data-pre="${pre || ""}" data-dec="${dec || 0}">${pre || ""}0</span>`; }
function runCountUps(root) { root.querySelectorAll(".cu").forEach(countUp); }
// 折線圖（配速趨勢用）
function sparkLine(vals) {
  if (!vals || vals.length < 2) return "";
  const W = 280, H = 64, pad = 8;
  const mn = Math.min(...vals), mx = Math.max(...vals), sp = (mx - mn) || 1;
  const xy = vals.map((v, i) => [pad + (W - 2 * pad) * i / (vals.length - 1), pad + (H - 2 * pad) * (1 - (v - mn) / sp)]);
  const line = xy.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)},${H - pad} L${xy[0][0].toFixed(1)},${H - pad} Z`;
  const dots = xy.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.2" fill="var(--accent)"/>`).join("");
  return `<svg class="ana-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${area}" fill="rgba(194,104,61,.16)"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>${dots}</svg>`;
}
// 難度雷達圖（6 軸）
function diffRadar(vals, labels) {
  const cx = 100, cy = 100, R = 64, N = vals.length, max = Math.max(1, ...vals);
  const pt = (i, rr) => { const a = (-90 + i * (360 / N)) * Math.PI / 180; return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]; };
  const poly = rr => vals.map((_, i) => pt(i, rr).map(n => n.toFixed(1)).join(",")).join(" ");
  let grid = [R * .34, R * .67, R].map(rr => `<polygon points="${poly(rr)}" fill="none" stroke="var(--line-soft)" stroke-width="1"/>`).join("");
  let axes = vals.map((_, i) => { const [ax, ay] = pt(i, R); return `<line x1="${cx}" y1="${cy}" x2="${ax.toFixed(1)}" y2="${ay.toFixed(1)}" stroke="var(--line-soft)" stroke-width="1"/>`; }).join("");
  const dp = vals.map((v, i) => pt(i, R * (v / max)).map(n => n.toFixed(1)).join(",")).join(" ");
  const data = `<polygon points="${dp}" fill="rgba(194,104,61,.28)" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>`;
  let labs = labels.map((l, i) => { const [lx, ly] = pt(i, R + 16); return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="9.5" fill="var(--ink-soft)" text-anchor="middle" dominant-baseline="middle">${l}<tspan dx="2">${vals[i]}</tspan></text>`; }).join("");
  return `<svg class="ana-radar" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet">${grid}${axes}${data}${labs}</svg>`;
}
// 軌跡縮圖（純 SVG 路線形狀），track = [{lat,lon}]
function routeMini(track, cls) {
  if (!track || track.length < 2) return "";
  let minLa = 1e9, maxLa = -1e9, minLo = 1e9, maxLo = -1e9;
  for (const p of track) { minLa = Math.min(minLa, p.lat); maxLa = Math.max(maxLa, p.lat); minLo = Math.min(minLo, p.lon); maxLo = Math.max(maxLo, p.lon); }
  const w = 100, h = 56, pad = 6, sx = (maxLo - minLo) || 1e-6, sy = (maxLa - minLa) || 1e-6;
  const sc = Math.min((w - 2 * pad) / sx, (h - 2 * pad) / sy);
  const ox = (w - sx * sc) / 2, oy = (h - sy * sc) / 2;
  const lines = trackSegments(track).map(seg =>
    `<polyline points="${seg.map(p => `${(ox + (p.lon - minLo) * sc).toFixed(1)},${(oy + (maxLa - p.lat) * sc).toFixed(1)}`).join(" ")}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`).join("");
  return `<svg class="route-mini ${cls || ""}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">${lines}</svg>`;
}
function openYearReview() {
  const year = new Date().getFullYear();
  const all = realRecords();
  const recs = all.filter(r => (r.date || "").slice(0, 4) === String(year));
  const sum = (a, f) => a.reduce((s, r) => s + (f(r) || 0), 0);
  const km = sum(recs, r => r.distanceKm), asc = sum(recs, r => r.ascent), hrs = sum(recs, r => r.elapsedMs) / 3.6e6;
  const steps = sum(recs, r => r.steps), kcal = sum(recs, r => r.kcal);
  const distinct = new Set(recs.map(r => r.trailName || "自由路線")).size;
  let longest = 0, maxAlt = 0, longestRec = null; recs.forEach(r => { if ((r.distanceKm || 0) > longest) { longest = r.distanceKm || 0; longestRec = r; } maxAlt = Math.max(maxAlt, r.altHigh || 0); });
  const mo = {}; recs.forEach(r => { const m = +(r.date || "").slice(5, 7); if (m) mo[m] = (mo[m] || 0) + 1; });
  const busiest = Object.keys(mo).sort((a, b) => mo[b] - mo[a])[0];
  const tc = {}; recs.forEach(r => { const nm = r.trailName || "自由路線"; tc[nm] = (tc[nm] || 0) + 1; });
  const top = Object.keys(tc).sort((a, b) => tc[b] - tc[a])[0];
  const lastKm = sum(all.filter(r => (r.date || "").slice(0, 4) === String(year - 1)), r => r.distanceKm);
  const delta = km - lastKm;
  const mk = Array(12).fill(0); recs.forEach(r => { const m = +(r.date || "").slice(5, 7); if (m) mk[m - 1] += r.distanceKm || 0; });
  const mkMax = Math.max(1, ...mk);
  const ov = document.createElement("div"); ov.className = "pet-modal";
  ov.innerHTML = `<div class="pet-modal-card yr-card anim-seq">
    <button class="sheet-close" id="yrX" aria-label="關閉">${ic("x")}</button>
    <div class="yr-head"><div class="yr-year">${year}</div><div class="yr-title">我的山行回顧</div></div>
    ${recs.length ? `
    <div class="yr-grid">
      <div class="yr-stat"><b>${cuSpan(recs.length, "", 0)}</b><span>趟旅程</span></div>
      <div class="yr-stat"><b>${cuSpan(km, "", 0)}</b><span>公里</span></div>
      <div class="yr-stat"><b>${cuSpan(asc, "↑", 0)}</b><span>公尺爬升</span></div>
      <div class="yr-stat"><b>${cuSpan(hrs, "", 0)}</b><span>小時</span></div>
    </div>
    <div class="yr-sub">
      <div><b>${cuSpan(steps, "", 0)}</b><span>步</span></div>
      <div><b>${cuSpan(kcal, "", 0)}</b><span>大卡</span></div>
      <div><b>${cuSpan(distinct, "", 0)}</b><span>條步道</span></div>
    </div>
    <div class="yr-months">${mk.map((v, i) => `<div class="yr-mo"><div class="yr-mo-v">${v > 0 ? (v >= 10 ? Math.round(v) : v.toFixed(1)) : ""}</div><div class="yr-mo-bar" style="height:${Math.round(v / mkMax * 46) + 3}px;animation-delay:${(i * 0.04).toFixed(2)}s"></div><span>${i + 1}</span></div>`).join("")}</div>
    <div class="yr-mo-cap">每月里程（單位：km）</div>
    ${longestRec && longestRec.track && longestRec.track.length > 1 ? `<div class="yr-route"><div class="yr-route-l">最遠的一條 ‧ ${(longestRec.trailName || "自由路線")}（${longest.toFixed(1)} km）</div>${routeMini(longestRec.track, "yr-route-svg")}</div>` : ""}
    <div class="yr-lines">
      ${longest ? `<div>單次最長 <b>${longest.toFixed(1)} km</b></div>` : ""}
      ${maxAlt ? `<div>最高造訪海拔 <b>${maxAlt} m</b></div>` : ""}
      ${busiest ? `<div>最常出門 <b>${busiest} 月</b></div>` : ""}
      ${top ? `<div>最愛步道 <b>${top}</b></div>` : ""}
      <div>較去年里程 <b>${delta >= 0 ? "↑ +" : "↓ "}${Math.abs(delta).toFixed(0)} km</b></div>
      <div class="yr-foot">↑ 累積爬升約 ${(asc / 3952).toFixed(1)} 座玉山</div>
    </div>
    <div class="yr-btns"><button class="btn primary" id="yrShare">${ic("share")} 分享</button><button class="btn ghost yr-imgbtn" id="yrImg">${ic("camera")} 存成圖片</button></div>`
    : `<div class="social-empty" style="color:#fff">${year} 還沒有行程，今年一起多走幾趟吧！</div>`}
  </div>`;
  document.body.appendChild(ov);
  runCountUps(ov);
  const close = () => ov.remove();
  ov.querySelector("#yrX").addEventListener("click", close);
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  const sh = ov.querySelector("#yrShare");
  if (sh) sh.addEventListener("click", () => {
    const text = `我的 ${year} 山行回顧：${recs.length} 趟、${km.toFixed(0)} km、累積爬升 ↑${Math.round(asc)} m（約 ${(asc / 3952).toFixed(1)} 座玉山）— 循徑拾光`;
    if (navigator.share) navigator.share({ title: "我的山行回顧", text }).catch(() => { });
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast("已複製回顧文字"));
    else toast(text);
  });
  const ib = ov.querySelector("#yrImg");
  const ps = (typeof petStats === "function") ? petStats() : null;
  if (ib) ib.addEventListener("click", () => drawYearImage({ year, n: recs.length, km, asc, hrs, steps, distinct, top, longest, pet: ps, avatar: window.__meAvatar }));
}
// 年度回顧 → 畫成可分享圖片（canvas，不需外部套件）
function drawYearImage(d) {
  if (d.avatar) { const img = new Image(); img.crossOrigin = "anonymous"; img.onload = () => build(img); img.onerror = () => build(null); img.src = d.avatar; }
  else build(null);
  function build(avImg) {
  const W = 540, H = 760, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#1f4730"); g.addColorStop(.6, "#16301f"); g.addColorStop(1, "#112619");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = "rgba(224,177,90,.10)"; x.lineWidth = 1.5;
  for (let yy = 80; yy < H; yy += 46) { x.beginPath(); for (let xx = 0; xx <= W; xx += 12) x.lineTo(xx, yy + Math.sin((xx / W) * 6.28) * 10); x.stroke(); }
  x.textAlign = "center";
  // 頭像 + 寵物
  const acx = W / 2, acy = 78, r = 40;
  if (avImg) {
    x.save(); x.beginPath(); x.arc(acx, acy, r, 0, 7); x.closePath(); x.clip();
    x.drawImage(avImg, acx - r, acy - r, r * 2, r * 2); x.restore();
    x.beginPath(); x.arc(acx, acy, r, 0, 7); x.lineWidth = 3; x.strokeStyle = "#e0b15a"; x.stroke();
  }
  if (d.pet) { x.font = "30px sans-serif"; x.fillText(d.pet.emoji || "🐾", avImg ? acx + r - 4 : acx, avImg ? acy + r - 2 : acy + 12); }
  x.fillStyle = "#e0b15a"; x.font = "700 76px 'Noto Serif TC', serif"; x.fillText(String(d.year), W / 2, 200);
  x.fillStyle = "#f3efe4"; x.font = "600 21px 'Noto Serif TC', serif"; x.fillText("我的山行回顧", W / 2, 234);
  const stats = [[d.n, "趟旅程"], [Math.round(d.km), "公里"], ["↑" + Math.round(d.asc), "公尺爬升"], [Math.round(d.hrs), "小時"]];
  stats.forEach((s, i) => {
    const cx = W / 2 + (i % 2 ? 120 : -120), cy = 310 + Math.floor(i / 2) * 124;
    x.fillStyle = "rgba(255,255,255,.07)"; roundRect(x, cx - 110, cy - 46, 220, 104, 14); x.fill();
    x.fillStyle = "#fff"; x.font = "700 38px 'Fraunces', serif"; x.fillText(String(s[0]), cx, cy + 4);
    x.fillStyle = "rgba(243,239,228,.75)"; x.font = "400 15px sans-serif"; x.fillText(s[1], cx, cy + 32);
  });
  x.fillStyle = "rgba(243,239,228,.9)"; x.font = "400 16px sans-serif"; x.textAlign = "center";
  let ly = 596;
  if (d.top) { x.fillText("最愛步道 ‧ " + d.top, W / 2, ly); ly += 30; }
  if (d.longest) { x.fillText("單次最長 " + d.longest.toFixed(1) + " km", W / 2, ly); ly += 30; }
  if (d.pet) { x.fillText("夥伴 " + (d.pet.name || "") + " Lv." + d.pet.level, W / 2, ly); ly += 30; }
  x.fillText("探索 " + d.distinct + " 條步道 ‧ 約 " + (d.asc / 3952).toFixed(1) + " 座玉山", W / 2, ly);
  x.fillStyle = "#e0b15a"; x.font = "700 19px 'Noto Serif TC', serif"; x.fillText("循徑拾光 · Gather the Trail", W / 2, H - 32);
  try { exportCanvas(c, d, avImg); } catch (e) { if (avImg) build(null); else toast("產生圖片失敗"); }
  }
}
function exportCanvas(c, d, avImg) {
  c.toBlob(async (blob) => {
    if (!blob) { toast("產生圖片失敗"); return; }
    const file = new File([blob], `循徑拾光-${d.year}-回顧.png`, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "我的山行回顧" }); return; } catch (e) { }
    }
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("已存成圖片");
  }, "image/png");
}
function roundRect(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
function openAnalytics() {
  const recs = realRecords();
  const pro = (typeof Premium !== "undefined") && Premium.isOn();
  const n = recs.length;
  const totKm = recs.reduce((s, r) => s + (r.distanceKm || 0), 0);
  const totAsc = recs.reduce((s, r) => s + (r.ascent || 0), 0);
  const totHrs = recs.reduce((s, r) => s + (r.elapsedMs || 0), 0) / 3.6e6;
  // 每月里程
  const by = {};
  for (const r of recs) { const m = (r.date || "").slice(0, 7); if (!m) continue; (by[m] = by[m] || { km: 0, asc: 0, n: 0, kcal: 0 }); by[m].km += r.distanceKm || 0; by[m].asc += r.ascent || 0; by[m].kcal += r.kcal || 0; by[m].n++; }
  const months = Object.keys(by).sort().reverse().slice(0, 12);
  const maxKm = Math.max(1, ...months.map(m => by[m].km));
  const maxKcal = Math.max(1, ...months.map(m => by[m].kcal));
  const card = (to, pre, dec, l) => `<div class="ana-card"><div class="ana-cv">${cuSpan(to, pre, dec)}</div><div class="ana-cl">${l}</div></div>`;
  const pb = (label, val) => `<div class="ana-pb"><span>${label}</span><b>${val}</b></div>`;

  // ── 進階（PRO）數據 ──
  let longest = null, steepest = null, fastest = 0;
  for (const r of recs) {
    if (!longest || (r.distanceKm || 0) > (longest.distanceKm || 0)) longest = r;
    if (!steepest || (r.ascent || 0) > (steepest.ascent || 0)) steepest = r;
    const hrs = (r.elapsedMs || 0) / 3.6e6; if (hrs > 0.05) fastest = Math.max(fastest, (r.distanceKm || 0) / hrs);
  }
  const tc = {}; recs.forEach(r => { const nm = r.trailName || "自由路線"; tc[nm] = (tc[nm] || 0) + 1; });
  const favTrail = Object.keys(tc).sort((a, b) => tc[b] - tc[a])[0];
  const avgPace = totHrs > 0 ? totKm / totHrs : 0;
  // 難度分布（用 TRAILS 對照 trailId）
  const tmap = new Map(); if (typeof TRAILS !== "undefined") TRAILS.forEach(t => tmap.set(String(t.id), t.difficulty || 0));
  const diffN = [0, 0, 0, 0, 0, 0, 0];
  recs.forEach(r => { const d = r.trailId != null ? (tmap.get(String(r.trailId)) || 0) : 0; if (d >= 1 && d <= 6) diffN[d]++; });
  const DLBL = ["", "輕鬆", "一般", "進階", "挑戰", "困難", "雪季"];
  const maxD = Math.max(1, ...diffN);
  // 年度比較
  const yr = {}; recs.forEach(r => { const y = (r.date || "").slice(0, 4); if (y) yr[y] = (yr[y] || 0) + (r.distanceKm || 0); });
  const years = Object.keys(yr).sort().reverse().slice(0, 4);
  const maxY = Math.max(1, ...years.map(y => yr[y]));
  // 一週節律
  const wd = [0, 0, 0, 0, 0, 0, 0]; recs.forEach(r => { const d = new Date(r.date); if (!isNaN(d)) wd[d.getDay()]++; });
  const WLBL = ["日", "一", "二", "三", "四", "五", "六"]; const maxW = Math.max(1, ...wd);
  // 配速趨勢（近 14 趟，由舊到新）
  const paced = recs.filter(r => (r.elapsedMs || 0) > 6e4 && (r.distanceKm || 0) > 0)
    .slice(0, 14).reverse().map(r => r.distanceKm / (r.elapsedMs / 3.6e6));

  const proInner = `
    <div class="ana-sec">個人紀錄</div>
    <div class="ana-pbs">
      ${pb("單次最長", (longest ? longest.distanceKm || 0 : 0).toFixed(2) + " km")}
      ${pb("單次最大爬升", "↑" + Math.round(steepest ? steepest.ascent || 0 : 0) + " m")}
      ${pb("最快平均配速", fastest.toFixed(1) + " km/h")}
      ${pb("整體平均配速", avgPace.toFixed(1) + " km/h")}
      ${pb("最常走", favTrail ? favTrail + "（" + tc[favTrail] + " 次）" : "—")}
    </div>
    ${paced.length >= 2 ? `<div class="ana-sec">配速趨勢</div>${sparkLine(paced)}<div class="ana-spark-cap">近 ${paced.length} 趟平均配速（km/h，由舊到新）</div>` : ""}
    <div class="ana-sec">難度分布</div>
    ${diffN.slice(1).some(c => c > 0) ? diffRadar(diffN.slice(1), DLBL.slice(1)) : `<div class="ana-empty-note">尚無對應到分級步道的紀錄</div>`}
    <div class="ana-sec">年度里程</div>
    <div class="ana-list">${years.map(y => `<div class="ana-row"><div class="ana-m">${y}</div><div class="ana-bar"><i style="width:${Math.round(yr[y] / maxY * 100)}%"></i></div><div class="ana-v"><b>${yr[y].toFixed(1)}</b> km</div></div>`).join("")}</div>
    <div class="ana-sec">每月卡路里消耗</div>
    <div class="ana-list">${months.map(m => `
      <div class="ana-row"><div class="ana-m">${m.replace("-", " / ")}</div>
        <div class="ana-bar kcal"><i style="width:${Math.round(by[m].kcal / maxKcal * 100)}%"></i></div>
        <div class="ana-v"><b>${Math.round(by[m].kcal).toLocaleString()}</b> kcal</div></div>`).join("")}</div>
    <div class="ana-sec">一週節律</div>
    <div class="ana-week">${wd.map((c, i) => `<div class="aw"><div class="aw-v">${c}</div><div class="aw-bar" style="height:${Math.round(c / maxW * 46) + 4}px"></div><div class="aw-l">${WLBL[i]}</div></div>`).join("")}</div>
    <div class="ana-spark-cap">各星期的出行次數（單位：次）</div>
    <button class="btn ghost" id="anaCompare" style="margin-top:10px">${ic("users")} 好友里程比較</button>
    <div class="ana-exp">
      <button class="btn ghost" id="anaCsv">${ic("download")} CSV</button>
      <button class="btn ghost" id="anaGpx">${ic("download")} GPX</button>
      <button class="btn ghost" id="anaKml">${ic("download")} KML</button>
    </div>`;

  const proLocked = `
    <div class="ana-lock">
      <div class="ana-lock-ic">${ic("sparkle")}</div>
      <b>進階分析（PRO）</b>
      <div class="ana-lock-d">個人紀錄・配速・難度分布・年度比較・一週節律・匯出 CSV/GPX</div>
      <button class="btn primary" id="anaUp" style="max-width:220px;margin:12px auto 0">升級 Premium 解鎖</button>
    </div>`;

  const totSteps = recs.reduce((s, r) => s + (r.steps || 0), 0);
  const distinct = new Set(recs.map(r => r.trailName || "自由路線")).size;
  const ov = document.createElement("div"); ov.className = "pet-modal";
  ov.innerHTML = `<div class="pet-modal-card anim-seq">
    <button class="sheet-close" id="anaX" aria-label="關閉">${ic("x")}</button>
    <h2>${ic("target")} 進階分析</h2>
    ${n ? `
    <div class="ana-cards">
      ${card(n, "", 0, "總出行")}
      ${card(totKm, "", 1, "總里程 km")}
      ${card(totAsc, "↑", 0, "總爬升 m")}
      ${card(totHrs, "", 1, "總時數 小時")}
      ${card(totSteps, "", 0, "總步數")}
      ${card(distinct, "", 0, "探索步道")}
    </div>
    <div class="ana-sec">每月里程</div>
    <div class="ana-list">${months.map(m => `
      <div class="ana-row"><div class="ana-m">${m.replace("-", " / ")}</div>
        <div class="ana-bar"><i style="width:${Math.round(by[m].km / maxKm * 100)}%"></i></div>
        <div class="ana-v"><b>${by[m].km.toFixed(1)}</b>km ・ ↑${Math.round(by[m].asc)}m ・ ${by[m].n}次</div></div>`).join("")}</div>
    ${pro ? proInner : proLocked}`
    : `<div class="social-empty"><span class="ee">${ic("target")}</span>還沒有行程可分析，先去走一條吧。</div>`}
  </div>`;
  document.body.appendChild(ov);
  runCountUps(ov);
  const close = () => ov.remove();
  ov.querySelector("#anaX").addEventListener("click", close);
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  const up = ov.querySelector("#anaUp"); if (up) up.addEventListener("click", () => { close(); if (typeof Premium !== "undefined") Premium.openUpgrade(); });
  const csv = ov.querySelector("#anaCsv"); if (csv) csv.addEventListener("click", () => exportRecordsCsv(recs));
  const gpx = ov.querySelector("#anaGpx"); if (gpx) gpx.addEventListener("click", () => { if (typeof GPX !== "undefined" && GPX.exportAll) (GPX.exportAll(recs) ? toast("已下載全部 GPX") : toast("無可匯出的軌跡")); });
  const kml = ov.querySelector("#anaKml"); if (kml) kml.addEventListener("click", () => exportRecordsKml(recs));
  const cmp = ov.querySelector("#anaCompare"); if (cmp) cmp.addEventListener("click", openCompare);
}
// KML 匯出（每趟一條 LineString，可匯入 Google Earth）
function exportRecordsKml(recs) {
  const tracks = recs.filter(r => r.track && r.track.length > 1);
  if (!tracks.length) { toast("無可匯出的軌跡"); return; }
  const esc = s => String(s || "").replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  const pm = tracks.map(r => {
    const coords = r.track.map(p => `${p.lon},${p.lat}${p.alt != null ? "," + Math.round(p.alt) : ""}`).join(" ");
    return `<Placemark><name>${esc(r.trailName || "自由路線")}（${(r.distanceKm || 0).toFixed(1)}km）</name><LineString><tessellate>1</tessellate><coordinates>${coords}</coordinates></LineString></Placemark>`;
  }).join("");
  const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>循徑拾光 行程</name>${pm}</Document></kml>`;
  const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = "trail-records.kml"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); toast("已匯出 KML");
}
// 好友里程比較：我 + 我追蹤的人，依累積里程排行
async function openCompare() {
  if (typeof Supa === "undefined" || !Supa.ready()) { toast("社群尚未啟用"); return; }
  const c = Supa.client(); const { data: u } = await c.auth.getUser();
  if (!u || !u.user) { toast("請先到社群分頁登入"); return; }
  const ov = document.createElement("div"); ov.className = "pet-modal";
  ov.innerHTML = `<div class="pet-modal-card"><button class="sheet-close" id="cmpX">${ic("x")}</button><h2>${ic("users")} 好友里程比較</h2><div id="cmpBody"><div class="feed-loading"><span class="spin"></span></div></div></div>`;
  document.body.appendChild(ov);
  ov.querySelector("#cmpX").addEventListener("click", () => ov.remove());
  ov.addEventListener("click", e => { if (e.target === ov) ov.remove(); });
  try {
    const { data: fol } = await c.from("follows").select("following_id").eq("follower_id", u.user.id);
    const ids = [u.user.id, ...((fol || []).map(r => r.following_id))];
    const { data: profs } = await c.from("profiles").select("id, handle, display_name, total_km, pet_level").in("id", ids);
    const list = (profs || []).map(p => ({ ...p, km: +(p.total_km || 0) })).sort((a, b) => b.km - a.km);
    const body = ov.querySelector("#cmpBody"); if (!body) return;
    if (list.length < 2) { body.innerHTML = `<div class="social-empty"><span class="ee">${ic("users")}</span>追蹤更多山友，就能一起比里程！</div>`; return; }
    const max = Math.max(1, ...list.map(p => p.km));
    body.innerHTML = `<div class="cmp-list">${list.map((p, i) => `<div class="cmp-row${p.id === u.user.id ? " me" : ""}"><span class="cmp-rank">${i + 1}</span><span class="cmp-name">${(p.display_name || p.handle || "山友")}${p.id === u.user.id ? "（我）" : ""}</span><div class="cmp-bar"><i style="width:${Math.round(p.km / max * 100)}%"></i></div><b class="cmp-km">${p.km.toFixed(0)}</b></div>`).join("")}</div>`;
  } catch (e) { const b = ov.querySelector("#cmpBody"); if (b) b.innerHTML = `<div class="social-empty">載入失敗</div>`; }
}
function exportRecordsCsv(recs) {
  const head = "日期,步道,公里,累積爬升m,下降m,大卡,時間分鐘\n";
  const rows = recs.map(r => [
    (r.date || "").slice(0, 10), `"${(r.trailName || "自由路線").replace(/"/g, "'")}"`,
    (r.distanceKm || 0).toFixed(2), Math.round(r.ascent || 0), Math.round(r.descent || 0),
    r.kcal || 0, Math.round((r.elapsedMs || 0) / 60000),
  ].join(",")).join("\n");
  const blob = new Blob(["﻿" + head + rows], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = "trail-records.csv"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("已匯出 CSV");
}
$("#btnClearTiles").addEventListener("click", async () => {
  if (confirm("確定清除已下載的離線地圖？")) {
    await Offline.clear();
    refreshOfflineStatus();
    toast("已清除離線地圖");
  }
});

// 山林夥伴：靠累積里程進化的虛擬寵物
const PET_STAGES = [
  { km: 0, e: "🥚", n: "神秘之卵", d: "靜靜等待破殼的那一刻……多走幾步喚醒牠。" },
  { km: 3, e: "🐛", n: "草叢幼蟲", d: "剛孵化的小生命，在步道邊探出了頭。" },
  { km: 12, e: "🦋", n: "翩翩彩蝶", d: "蛻變成蝶，隨你翻山越嶺。" },
  { km: 30, e: "🦊", n: "靈巧山狐", d: "穿梭林間的夥伴，腳程越來越好。" },
  { km: 70, e: "🐅", n: "山林猛虎", d: "氣勢威猛，群山都是牠的領地。" },
  { km: 130, e: "🐲", n: "初醒幼龍", d: "傳說的力量正在覺醒……" },
  { km: 220, e: "🐉", n: "騰雲神龍", d: "已達最終型態！與你一同騰雲駕霧。" },
];
const PET_TAPS = ["要再去走走嗎？", "今天也一起爬山吧！", "我準備好出發了！", "下一座山在等我們～", "腳力越來越好囉！", "謝謝你帶我看風景 🌲"];
// 棲息地背景（隨進化升級）
const PET_BG = [
  "linear-gradient(140deg,#403626,#2a2418)", "linear-gradient(140deg,#33502d,#1d3019)",
  "linear-gradient(140deg,#356b4a,#1f4730)", "linear-gradient(140deg,#2a5a3a,#16301f)",
  "linear-gradient(140deg,#5a4a2a,#2c2a1a)", "linear-gradient(140deg,#3a3a6b,#1f2547)",
  "linear-gradient(140deg,#2b5a3a,#234a6b 55%,#16301f)",
];
// 排除模擬；過快(交通工具)的移動段在記錄端就已不計入里程
const isFootRec = r => !r.sim && !r.vehicle;   // 模擬、車速自動斷掉的整趟都不計里程
function realRecords() { return Store.getRecords().filter(isFootRec); }
function debugKm() { return +(localStorage.getItem("tt_debug_km") || 0); }   // 測試用里程偏移
function realTotalKm() { return realRecords().reduce((s, r) => s + (r.distanceKm || 0), 0) + debugKm(); }
function petBase() { return +(localStorage.getItem("tt_pet_base") || 0); }
function feedBonusKm() { return +(localStorage.getItem("tt_pet_feedkm") || 0); }
function totalKm() { return Math.max(0, realTotalKm() - petBase()) + feedBonusKm(); }   // 成長里程＝走路 + 照顧獎勵
// 🍓 果實：每走 1 km 得 1 顆，餵食消耗
function berriesEarned() { return Math.floor(realTotalKm()); }
function berryBonus() { return +(localStorage.getItem("tt_pet_berry_bonus") || 0); }   // 每日任務等額外果實
function addBerryBonus(n) { localStorage.setItem("tt_pet_berry_bonus", String(berryBonus() + n)); }
function berriesBalance() { return Math.max(0, berriesEarned() + berryBonus() - (+(localStorage.getItem("tt_pet_berry_spent") || 0))); }
// ❤️ 親密度 0–100（久未互動緩降，永不影響等級）
function affinity() {
  const raw = +(localStorage.getItem("tt_pet_aff") || 0);
  const t = localStorage.getItem("tt_pet_aff_t");
  const idle = t ? Math.max(0, daysSince(t) - 1) : 0;
  return Math.max(0, Math.min(100, Math.round(raw - idle * 2)));
}
function petHearts() { return Math.max(0, Math.min(5, Math.floor(affinity() / 20))); }
function bumpAffinity(amt) {
  const cur = affinity();
  localStorage.setItem("tt_pet_aff", String(Math.max(0, Math.min(100, cur + amt))));
  localStorage.setItem("tt_pet_aff_t", new Date().toISOString());
}
// 每日任務/目標一律用「本地日期」：toISOString 是 UTC，台灣早上 8 點前會被算成前一天，
// 造成任務進度看起來莫名被刷新。跨日以本地午夜為準。
function localDayOf(d) { const t = new Date(d); if (isNaN(t)) return ""; return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; }
function todayStr() { return localDayOf(new Date()); }
function localDay(iso) { return localDayOf(iso); }
const FEED_COOLDOWN = 8 * 3600e3;   // 餵食冷卻 8 小時
function feedCooldownMs() { return Math.max(0, FEED_COOLDOWN - (Date.now() - (+(localStorage.getItem("tt_pet_fed_t") || 0)))); }
function canFeedToday() { return berriesBalance() >= 3 && feedCooldownMs() === 0; }
function feedPet() {
  if (feedCooldownMs() > 0) { toast(`還在休息，約 ${Math.ceil(feedCooldownMs() / 3600e3)} 小時後可再餵 🍃`); return; }
  if (berriesBalance() < 3) { toast("果實不足，多走幾步才有果實 🍓"); return; }
  const heartsBefore = petHearts();
  localStorage.setItem("tt_pet_berry_spent", String((+(localStorage.getItem("tt_pet_berry_spent") || 0)) + 3));
  bumpAffinity(15);
  localStorage.setItem("tt_pet_fed_t", String(Date.now()));
  const gain = heartsBefore >= 5 ? 0.5 : 0.3;                  // 親密度滿時照顧獎勵更多
  localStorage.setItem("tt_pet_feedkm", String(+(feedBonusKm() + gain).toFixed(2)));
  if (navigator.vibrate) navigator.vibrate([20, 30, 20]);
  const em = $("#petEmoji"); if (em) { em.classList.remove("tap"); void em.offsetWidth; em.classList.add("tap"); }
  toast(`餵食成功！🍓 親密度上升、照顧 +${gain}km`);
  checkPetEvolve();
  renderPet();
}
function petStageIndex(km) { let i = 0; for (let k = 0; k < PET_STAGES.length; k++) if (km >= PET_STAGES[k].km) i = k; return i; }
function petName() { return localStorage.getItem("tt_pet_name") || ""; }
// 供社群同步：寵物名字/等級/成長里程，讓好友看到你的進度
function petStats() {
  const km = totalKm(), i = petStageIndex(km), st = PET_STAGES[i];
  return { name: petName() || st.n, level: i + 1, stage: st.n, emoji: st.e, km: +km.toFixed(1) };
}
function petHatch() { let h = localStorage.getItem("tt_pet_hatch"); if (!h) { h = new Date().toISOString(); localStorage.setItem("tt_pet_hatch", h); } return h; }
function daysSince(iso) { return Math.max(0, Math.floor((Date.now() - new Date(iso)) / 864e5)); }
function weekIndex(d) { const dt = new Date(d); dt.setHours(0, 0, 0, 0); dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); return Math.round(dt / 6048e5); }
function weeksStreak() {
  const recs = realRecords(); if (!recs.length) return 0;
  const weeks = new Set(recs.map(r => weekIndex(r.date)));
  const now = weekIndex(Date.now());
  let w = weeks.has(now) ? now : now - 1, s = 0;
  while (weeks.has(w)) { s++; w--; }
  return s;
}
function petMood() {
  const last = realRecords()[0];   // 最新一筆（紀錄為新到舊）
  if (!last) return { e: "🌙", t: "等你帶牠出門走走" };
  const d = daysSince(last.date);
  if (d <= 1) return { e: "😊", t: "剛運動完，活力滿滿！" };
  if (d <= 4) return { e: "🙂", t: "狀態不錯，隨時能出發" };
  if (d <= 9) return { e: "🥺", t: "有點想念山林了…" };
  return { e: "😴", t: "好久沒出門，懶洋洋的" };
}
// 活力：越久沒出門越低，出門健行恢復（約 7 天歸零）
function energy() {
  const last = realRecords()[0]; if (!last) return 25;
  return Math.max(0, Math.min(100, Math.round(100 - daysSince(last.date) * 14)));
}
// 連續健行天數
function daysStreak() {
  const recs = realRecords(); if (!recs.length) return 0;
  const days = new Set(recs.map(r => localDay(r.date)));
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const key = () => localDayOf(d);
  if (!days.has(key())) d.setDate(d.getDate() - 1);   // 今天還沒走→從昨天起算
  let s = 0; while (days.has(key())) { s++; d.setDate(d.getDate() - 1); }
  return s;
}
function todayAscent() { const ds = todayStr(); return realRecords().filter(r => localDay(r.date) === ds).reduce((s, r) => s + (r.ascent || 0), 0); }
function todayTrips() { const ds = todayStr(); return realRecords().filter(r => localDay(r.date) === ds).length; }
// 每日任務進度高水位：當天內只增不減（防止任何資料裁切/日期邊界造成進度倒退），過了本地午夜才重置
function questProgress() {
  let hi = null;
  try { hi = JSON.parse(localStorage.getItem("tt_quest_hi")); } catch { /* ignore */ }
  const d = todayStr();
  const cur = { d, km: todayKm(), asc: todayAscent(), trips: todayTrips() };
  if (hi && hi.d === d) {
    cur.km = Math.max(cur.km, +hi.km || 0);
    cur.asc = Math.max(cur.asc, +hi.asc || 0);
    cur.trips = Math.max(cur.trips, +hi.trips || 0);
  }
  try { localStorage.setItem("tt_quest_hi", JSON.stringify(cur)); } catch { /* ignore */ }
  return cur;
}
// 每日任務
function renderQuests() {
  const box = $("#petQuests"); if (!box) return;
  const p = questProgress();
  const km = p.km, asc = p.asc, trips = p.trips, streak = daysStreak();
  const quests = [
    { icon: "footprints", label: "今日出門健行", cur: trips, goal: 1, dec: 0 },
    { icon: "ruler", label: "今日里程 1.5 km", cur: km, goal: 1.5, dec: 1 },
    { icon: "mountain", label: "今日爬升 50 m", cur: asc, goal: 50, dec: 0 },
  ];
  const allDone = quests.every(q => q.cur >= q.goal);
  const claimed = localStorage.getItem("tt_quest_claim") === todayStr();
  box.innerHTML = `<div class="section-title">${ic("calendar")}每日任務${streak >= 2 ? ` <span class="streak-chip">${ic("flame")} 連續 ${streak} 天</span>` : ""}</div>
    <div class="quest-list">${quests.map(q => { const done = q.cur >= q.goal; return `<div class="quest ${done ? "done" : ""}"><span class="q-ic">${ic(q.icon)}</span><div class="q-body"><div class="q-l">${q.label}</div><div class="q-bar"><i style="width:${Math.min(100, q.cur / q.goal * 100).toFixed(0)}%"></i></div></div><span class="q-chk">${done ? "✓" : (q.dec ? q.cur.toFixed(q.dec) : Math.round(q.cur))}</span></div>`; }).join("")}</div>
    <button class="btn ${allDone && !claimed ? "primary" : "ghost"}" id="qClaim"${allDone && !claimed ? "" : " disabled"}>${claimed ? "今日獎勵已領 ✓" : (allDone ? "領取 +5 🍓" : "完成全部任務可領 🍓")}</button>`;
  const cb = $("#qClaim");
  if (cb && allDone && !claimed) cb.addEventListener("click", () => {
    addBerryBonus(5); localStorage.setItem("tt_quest_claim", todayStr()); bumpAffinity(5);
    toast("每日任務完成！+5 🍓"); confetti && confetti(); renderQuests(); renderPet();
  });
}
function renderPet() {
  const box = $("#petCard");
  if (!box) return;
  const km = totalKm(), i = petStageIndex(km), st = PET_STAGES[i], next = PET_STAGES[i + 1];
  const nm = petName(), mood = petMood(), days = daysSince(petHatch()), streak = weeksStreak(), en = energy();
  const berries = berriesBalance(), h = petHearts(), bonus = feedBonusKm(), canFeed = canFeedToday(), cd = feedCooldownMs();
  let prog = "", sub;
  if (next) {
    const pct = Math.max(2, Math.min(100, Math.round((km - st.km) / (next.km - st.km) * 100)));
    sub = `再 <b>${(next.km - km).toFixed(1)}</b> km 進化成 ${next.e} ${next.n}`;
    prog = `<div class="pet-bar"><i style="width:${pct}%"></i></div>`;
  } else sub = "已是最終型態 ✨ 繼續同行！";
  box.innerHTML = `<div class="pet-card${i >= 6 ? " final" : ""}" style="background:${PET_BG[i]}">
    <div class="pet-emoji" id="petEmoji" role="img" aria-label="${st.n}">${st.e}</div>
    <div class="pet-info">
      <div class="pet-name">${nm || st.n}<span class="lv-chip lvt-${Math.min(i + 1, 7)} pet-lv-chip">Lv.${i + 1}</span>${(typeof Premium !== "undefined" && Premium.isOn()) ? `<button class="pet-edit" id="petRename" title="命名" aria-label="命名">${ic("pencil")}</button>` : ""}</div>
      <div class="pet-mood">${mood.e} ${mood.t}　<span class="pet-hearts">${"❤️".repeat(h)}${"🤍".repeat(5 - h)}</span></div>
      <div class="pet-energy"><span class="pe-l">活力 ${en}</span><div class="pe-bar"><i style="width:${en}%"></i></div></div>
      <div class="pet-sub">${nm ? st.n + "・" : ""}已走 <b>${km.toFixed(1)}</b> km${bonus > 0 ? `（含照顧 +${bonus.toFixed(1)}）` : ""}・同行 <b>${days}</b> 天${streak >= 2 ? `・<span class="inline-ic">${ic("flame")}</span>連續${streak}週` : ""}</div>
      <div class="pet-sub" style="opacity:.9">${sub}</div>
      ${prog}
      <div class="pet-care">
        <span class="pet-berry">🍓 ${berries}</span>
        <button class="pet-btn feed" id="petFeed"${canFeed ? "" : " disabled"}>${cd > 0 ? `🍃 ${Math.ceil(cd / 3600e3)} 小時後可餵` : "🍖 餵食 (3🍓)"}</button>
      </div>
      <div class="pet-btns">
        <button class="pet-btn" id="petDex">${ic("book")} 夥伴手冊</button>
        <button class="pet-btn" id="petRec">${ic("compass")} 帶我去走</button>
      </div>
    </div>
  </div>`;
  const em = $("#petEmoji");
  if (em) em.addEventListener("click", () => {
    em.classList.remove("tap"); void em.offsetWidth; em.classList.add("tap");
    if (navigator.vibrate) navigator.vibrate(20);
    toast(PET_TAPS[Math.floor(Math.random() * PET_TAPS.length)]);
  });
  $("#petDex").addEventListener("click", openPetDex);
  $("#petRec").addEventListener("click", petRecommend);
  $("#petFeed").addEventListener("click", feedPet);
  const ren = $("#petRename");   // Premium：為夥伴命名
  if (ren) ren.addEventListener("click", () => {
    askInput({ title: "幫你的山林夥伴取個名字", value: petName() || st.n, max: 12 }).then(v => {
      if (v != null) { localStorage.setItem("tt_pet_name", v.trim().slice(0, 12)); renderPet(); }
    });
  });
}

// ---------- 步道比較 ----------
let compareSet = new Set();
function updateCompareBar() {
  let bar = document.getElementById("compareBar");
  if (!compareSet.size) { if (bar) bar.remove(); return; }
  if (!bar) { bar = document.createElement("div"); bar.id = "compareBar"; bar.className = "compare-bar"; document.body.appendChild(bar); }
  bar.innerHTML = `<span>已選 <b>${compareSet.size}</b> 條比較</span>
    <button id="cmpClear">清除</button><button id="cmpGo" class="go"${compareSet.size < 2 ? " disabled" : ""}>比較</button>`;
  bar.querySelector("#cmpClear").onclick = () => { compareSet.clear(); updateCompareBar(); };
  bar.querySelector("#cmpGo").onclick = () => { if (compareSet.size >= 2) openCompareSheet(); };
}
function openCompareSheet() {
  const ts = [...compareSet].map(id => TRAILS.find(t => t.id === id)).filter(Boolean);
  if (ts.length < 2) return;
  const row = (label, fn) => `<tr><th>${label}</th>${ts.map(t => `<td>${fn(t)}</td>`).join("")}</tr>`;
  const ov = document.createElement("div");
  ov.className = "pet-modal";
  ov.innerHTML = `<div class="pet-modal-card">
    <button class="sheet-close" id="cmpClose" aria-label="關閉">✕</button>
    <h2>步道比較</h2>
    <div class="cmp-wrap"><table class="cmp-table">
      ${row("步道", t => `<b>${t.name}</b>`)}
      ${row("難度", t => `<span class="badge diff d${t.difficulty || 0}" style="font-size:10px">${t.difficulty_label}</span>`)}
      ${row("長度", t => t.length_km != null ? t.length_km + " km" : "—")}
      ${row("累積爬升", t => t.ascent != null ? "↑" + Math.round(t.ascent) + " m" : "—")}
      ${row("預估時間", t => t.tour || "—")}
      ${row("親子友善", t => t.family_friendly ? "✓" : "—")}
      ${row("地區", t => t.region || "—")}
      ${row("主題", t => tagsOf(t).slice(0, 3).join("、") || "—")}
    </table></div>
  </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.querySelector("#cmpClose").onclick = close;
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
}
// 夥伴推薦一條主題
function petRecommend() {
  const picks = [["tag:瀑布", "瀑布"], ["tag:古道", "古道"], ["tag:海景", "海景"], ["tag:森林", "森林"], ["family", "親子友善"], ["tag:湖泊", "湖泊"]];
  const [f, label] = picks[Math.floor(Math.random() * picks.length)];
  document.querySelector('.tab[data-view="explore"]').click();
  activeFilters = new Set([f]); activeRegions.clear(); curQuery = ""; $("#searchInput").value = "";
  syncFilterUI(); syncRegionUI(); updateFilterDot(); render();
  toast(`夥伴想去走「${label}」！`);
}
// 成就徽章
function petBadges() {
  const recs = realRecords();
  const n = recs.length;
  const km = recs.reduce((s, r) => s + (r.distanceKm || 0), 0);
  const asc = recs.reduce((s, r) => s + (r.ascent || 0), 0);
  const maxOne = recs.reduce((m, r) => Math.max(m, r.distanceKm || 0), 0);
  const hrs = recs.map(r => new Date(r.date).getHours());
  const early = hrs.some(h => h < 7), night = hrs.some(h => h >= 19);
  const done = (typeof Store.doneCount === "function") ? Store.doneCount() : 0;
  const favCount = TRAILS.filter(t => Store.isFav(t.id)).length;
  const wk = weeksStreak(), dstreak = (typeof daysStreak === "function") ? daysStreak() : 0;
  const list = [
    { e: "👣", n: "初心者", got: n >= 1, d: "完成第一次記錄" },
    { e: "🥾", n: "常客", got: n >= 10, d: "累積 10 次出行" },
    { e: "🎒", n: "老山友", got: n >= 30, d: "累積 30 次出行" },
    { e: "🧗", n: "山痴", got: n >= 100, d: "累積 100 次出行" },
    { e: "📏", n: "50K", got: km >= 50, d: "總里程 50 km" },
    { e: "💯", n: "百K俱樂部", got: km >= 100, d: "總里程 100 km" },
    { e: "🚀", n: "300K", got: km >= 300, d: "總里程 300 km" },
    { e: "🏆", n: "縱橫五百", got: km >= 500, d: "總里程 500 km" },
    { e: "⛰️", n: "爬升新手", got: asc >= 1000, d: "總爬升 1000 m" },
    { e: "🦅", n: "爬升大師", got: asc >= 3000, d: "總爬升 3000 m" },
    { e: "🗻", n: "玉山高度", got: asc >= 3952, d: "總爬升 3952 m（一座玉山）" },
    { e: "🏔️", n: "聖母峰高度", got: asc >= 8848, d: "總爬升 8848 m（一座聖母峰）" },
    { e: "🏃", n: "健行馬拉松", got: maxOne >= 10, d: "單次步行 ≥ 10 km" },
    { e: "🥇", n: "半馬腳力", got: maxOne >= 21, d: "單次步行 ≥ 21 km" },
    { e: "✅", n: "踏遍五徑", got: done >= 5, d: "完成 5 條步道" },
    { e: "🗺️", n: "步道收藏家", got: done >= 20, d: "完成 20 條步道" },
    { e: "⭐", n: "收藏迷", got: favCount >= 10, d: "收藏 10 條步道" },
    { e: "🌅", n: "早起鳥", got: early, d: "清晨 7 點前出發" },
    { e: "🌙", n: "夜行者", got: night, d: "晚間 7 點後出發" },
    { e: "📅", n: "連續一週", got: dstreak >= 7, d: "連續 7 天健行" },
    { e: "🔥", n: "四週堅持", got: wk >= 4, d: "連續 4 週都有走" },
  ];
  // 成就一旦解鎖就永久保留：舊紀錄被容量保護裁掉（最多存 100 筆）時，重算會低於門檻，
  // 所以把解鎖過的名字存進 tt_badges_got，顯示時取聯集。
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem("tt_badges_got")) || []; } catch { /* ignore */ }
  const got = new Set(saved);
  let changed = false;
  for (const b of list) {
    if (b.got && !got.has(b.n)) { got.add(b.n); changed = true; }
    if (got.has(b.n)) b.got = true;
  }
  if (changed) try { localStorage.setItem("tt_badges_got", JSON.stringify([...got])); } catch { /* ignore */ }
  return list;
}
// 成就勳章專區（夥伴頁）
function renderBadges() {
  const box = $("#petBadges"); if (!box) return;
  const list = petBadges(), got = list.filter(b => b.got).length;
  box.innerHTML = `<div class="section-title">${ic("medal")}成就勳章 <span class="badge-count">${got} / ${list.length}</span></div>
    <div class="ach-grid">${list.map(b => `<div class="ach${b.got ? "" : " locked"}"><div class="ach-e">${b.got ? b.e : "🔒"}</div><div class="ach-n">${b.n}</div><div class="ach-d">${b.d}</div></div>`).join("")}</div>`;
}
// 夥伴手冊：進化圖鑑 + 成就徽章
function openPetDex() {
  const km = totalKm(), reached = petStageIndex(km), next = PET_STAGES[reached + 1];
  const stages = PET_STAGES.map((s, i) => {
    const unlocked = i <= reached, isNow = i === reached;
    return `<div class="dex-row${unlocked ? "" : " locked"}${isNow ? " now" : ""}">
      <div class="dex-e">${unlocked ? s.e : "❔"}</div>
      <div class="dex-body">
        <div class="dex-h"><b>${unlocked ? s.n : "？？？"}</b><span class="lv-chip lvt-${Math.min(i + 1, 7)}">Lv.${i + 1}</span>${isNow ? `<span class="dex-now">目前</span>` : ""}</div>
        <div class="dex-k">${i === 0 ? "起始型態" : `成長里程 ${s.km} km 解鎖`}</div>
        <div class="dex-d">${unlocked ? s.d : "繼續健行，解鎖牠的樣貌與故事…"}</div>
      </div>
    </div>`;
  }).join("");
  const tip = next ? `再走 <b>${(next.km - km).toFixed(1)}</b> km 進化成 ${next.e} ${next.n}` : "已達最終型態 ✨ 與你繼續同行";
  const ov = document.createElement("div");
  ov.className = "pet-modal";
  ov.innerHTML = `<div class="pet-modal-card">
    <button class="sheet-close" id="petDexClose" aria-label="關閉">✕</button>
    <h2>夥伴手冊</h2>
    <p class="dex-intro">你的夥伴會隨著累積的<b>成長里程</b>一階階進化 —— 走路的里程、餵食、每日任務與好友送的果實，都會讓牠成長。</p>
    <div class="dex-tip"><span class="inline-ic">${ic("footprints")}</span> ${tip}</div>
    <div class="dex-sec">進化圖鑑（共 ${PET_STAGES.length} 階）</div>
    <div class="dex-list">${stages}</div>
    <p class="dex-foot">💡 想看成就勳章？回「夥伴」頁往下捲就有。</p>
  </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  ov.querySelector("#petDexClose").addEventListener("click", close);
}
// 全螢幕進化慶祝
function celebrateEvolve(st, lv) {
  const ov = document.createElement("div");
  ov.className = "evolve-ov";
  ov.innerHTML = `<div class="evolve-card">
    <div class="evolve-spark"></div>
    <div class="evolve-emoji">${st.e}</div>
    <div class="evolve-h">進化！</div>
    <div class="evolve-n">${petName() || st.n} <span class="lv-chip lvt-${Math.min(lv, 7)}">Lv.${lv}</span></div>
    <div class="evolve-d">${st.d}</div>
    <button class="btn primary" id="evolveOk">太棒了</button>
  </div>`;
  document.body.appendChild(ov);
  if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
  const close = () => ov.remove();
  ov.querySelector("#evolveOk").addEventListener("click", close);
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
}
// 走完後檢查是否進化（跨次也記住）
function checkPetEvolve() {
  const i = petStageIndex(totalKm());
  const prev = +(localStorage.getItem("tt_pet_stage") || 0);
  if (i !== prev) localStorage.setItem("tt_pet_stage", i);
  if (i > prev) setTimeout(() => celebrateEvolve(PET_STAGES[i], i + 1), 800);
}
// 記錄頁待機面板（未開始記錄時顯示夥伴/上次/推薦）
function renderRecIdle() {
  const box = $("#recIdle"); if (!box) return;
  if (Recorder.getState && Recorder.getState() !== "idle") { box.style.display = "none"; return; }
  const last = realRecords()[0];
  if (!last) { box.style.display = "none"; return; }
  box.style.display = "block";
  box.innerHTML = `<div class="ridle-row"><span class="inline-ic">${ic("pin")}</span> 上次：${last.trailName || "自由路線"}・<b>${(last.distanceKm || 0).toFixed(2)}</b> km</div>`;
}
// 我的足跡熱力圖：所有真實軌跡疊在一張地圖上
function openFootprintMap() {
  const recs = realRecords().filter(r => r.track && r.track.length > 1);
  if (!recs.length) { toast("還沒有可顯示的軌跡，先去走一條吧"); return; }
  const ov = document.createElement("div");
  ov.className = "foot-modal";
  ov.innerHTML = `<button class="lb-close" id="footClose" aria-label="關閉">✕</button><div id="footMap"></div><div class="foot-cap">我的足跡 · ${recs.length} 段軌跡</div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  $("#footClose").addEventListener("click", close);
  setTimeout(() => {
    const m = L.map("footMap", { zoomControl: true });
    baseTopo().addTo(m);
    const all = [];
    recs.forEach(r => {
      const pts = r.track.map(p => [p.lat, p.lon]);
      L.polyline(trackSegments(r.track).map(s => s.map(p => [p.lat, p.lon])), { color: "#e8893b", weight: 5, opacity: .35 }).addTo(m);   // 疊加＝熱力（gap 分段）
      all.push(...pts);
    });
    if (all.length) m.fitBounds(all, { padding: [30, 30] });
    m.invalidateSize();
  }, 90);
}
// 每日目標環
function todayKm() { const d = todayStr(); return realRecords().filter(r => localDay(r.date) === d).reduce((s, r) => s + (r.distanceKm || 0), 0); }
// （每日目標環已依使用者要求移除；todayKm 仍供每日任務使用）
function renderStats() {
  const box = $("#meStats");
  if (!box) return;
  const recs = realRecords();   // 成就統計不計入模擬
  const favs = TRAILS.filter(t => Store.isFav(t.id)).length;
  const doneTrails = new Set(TRAILS.filter(t => Store.trailLog(t.id).done).map(t => t.id)).size;
  const km = recs.reduce((s, r) => s + (r.distanceKm || 0), 0);
  const asc = recs.reduce((s, r) => s + (r.ascent || 0), 0);
  const kcal = recs.reduce((s, r) => s + (r.kcal || 0), 0);
  const ms = recs.reduce((s, r) => s + (r.elapsedMs || 0), 0);
  const now = new Date(), moKm = recs.filter(r => { const d = new Date(r.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })
    .reduce((s, r) => s + (r.distanceKm || 0), 0);
  const hrs = ms / 3.6e6;
  const cell = (to, pre, dec, l) => `<div class="mstat"><div class="mv" data-to="${to}" data-pre="${pre}" data-dec="${dec}">${pre}0</div><div class="ml">${l}</div></div>`;
  box.innerHTML = `<div class="mstat-grid">
    ${cell(recs.length, "", 0, "出行次數")}
    ${cell(km, "", 1, "總里程 km")}
    ${cell(asc, "↑", 0, "總爬升 m")}
    ${cell(hrs, "", 1, "總時數 小時")}
    ${cell(kcal, "", 0, "總卡路里")}
    ${cell(moKm, "", 1, "本月 km")}
    ${cell(doneTrails, "✓", 0, "完成步道")}
    ${cell(favs, "★", 0, "收藏步道")}
  </div>`;
  box.querySelectorAll(".mv").forEach(countUp);
}
// 數字成長動畫（尊重減少動態）
function countUp(el) {
  const to = parseFloat(el.dataset.to) || 0, pre = el.dataset.pre || "", dec = +el.dataset.dec || 0;
  const fmt = v => pre + (dec ? v.toFixed(dec) : Math.round(v).toLocaleString());
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = fmt(to); return; }
  const dur = 750, t0 = performance.now();
  (function step(t) {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(to * e);
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}
const HIST_PAGE = 8;       // 一次顯示幾筆，避免行程太多把頁面拉很長
let histShown = HIST_PAGE;
function renderHistory(keepShown) {
  renderPet();
  renderStats();
  const recs = Store.getRecords();
  const wrap = $("#historyList");
  const gpxAll = $("#btnExportGpxAll");
  if (gpxAll) gpxAll.style.display = recs.length ? "block" : "none";
  if (!recs.length) { wrap.innerHTML = `<div class="empty">${EMPTY_ART}還沒有行程紀錄<br>到「記錄」分頁開始你的第一條路線</div>`; return; }
  if (!keepShown) histShown = HIST_PAGE;          // 重新進入頁面→收合回前 8 筆
  const shownRecs = recs.slice(0, histShown);
  wrap.innerHTML = shownRecs.map(r => `
    <div class="hist-card" data-id="${r.id}">
      <div class="top">
        <b>${r.trailName || "自由路線"}${r.sim ? ` <span class="sim-tag">模擬</span>` : ""}${r.vehicle ? ` <span class="sim-tag">車速·不計里程</span>` : ""}</b>
        <span class="date">${new Date(r.date).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <div class="row">
        <span>${ic("ruler")}<b>${r.distanceKm.toFixed(2)}</b> km${r.distance3DKm && r.distance3DKm > r.distanceKm + 0.05 ? ` <small>(含坡度 ${r.distance3DKm.toFixed(2)})</small>` : ""}</span>
        <span>${ic("steps")}<b>${r.steps.toLocaleString()}</b> 步</span>
        <span>${ic("fire")}<b>${r.kcal}</b> 大卡</span>
        <span>${ic("clock")}<b>${fmtTime(r.elapsedMs)}</b></span>
      </div>
      ${r.ascent ? `<div class="row"><span>${ic("mountain")}爬升 <b>↑${r.ascent}</b>m${r.descent ? ` 下降 <b>↓${r.descent}</b>m` : ""}</span></div>` : ""}
      <div class="hist-actions">
        <button class="hist-view" data-id="${r.id}">${ic("map")} 回顧軌跡</button>
        <button class="hist-gpx" data-id="${r.id}">${ic("download")} 路線檔</button>
      </div>
    </div>`).join("")
    + (recs.length > histShown
      ? `<button class="btn ghost hist-more" id="histMore">顯示更多（剩 ${recs.length - histShown} 筆）</button>`
      : (recs.length > HIST_PAGE ? `<button class="btn ghost hist-more" id="histLess">收合</button>` : ""));
  wrap.querySelectorAll(".hist-view").forEach(b => b.addEventListener("click", () => {
    const rec = Store.getRecords().find(r => r.id === b.dataset.id);
    if (rec) openTrackReview(rec);
  }));
  wrap.querySelectorAll(".hist-gpx").forEach(b => b.addEventListener("click", () => {
    const rec = Store.getRecords().find(r => r.id === b.dataset.id);
    if (rec) { GPX.exportRecord(rec); toast("已下載路線檔"); }
  }));
  const more = $("#histMore"); if (more) more.addEventListener("click", () => { histShown += HIST_PAGE; renderHistory(true); });
  const less = $("#histLess"); if (less) less.addEventListener("click", () => { histShown = HIST_PAGE; renderHistory(true); $("#historyList").scrollIntoView({ behavior: "smooth", block: "start" }); });
}

// ---------- 分級說明按鈕 ----------
$("#gradeMask").addEventListener("click", closeGradeInfo);
$("#closeGradeBtn").addEventListener("click", closeGradeInfo);

// ---------- 外觀主題 ----------
function applyTheme(mode) {
  const dark = mode === "dark";
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#13160f" : "#16301f");
  document.querySelectorAll(".theme-opt").forEach(b => b.classList.toggle("on", b.dataset.themeOpt === mode));
}
// 季節主題點綴色（春櫻/夏綠/秋楓/冬雪）；Premium 自選主題色會覆蓋
const ACCENTS = [["#c2683d", "赤陶"], ["#3f8f6a", "森綠"], ["#8068c2", "暮紫"], ["#3a7bd5", "海藍"], ["#c0452f", "楓紅"], ["#d9a441", "金"]];
function applySeason() {
  const saved = localStorage.getItem("tt_accent");
  if (saved && typeof Premium !== "undefined" && Premium.isOn()) { document.documentElement.style.setProperty("--accent", saved); return; }
  const m = new Date().getMonth() + 1;
  const col = m >= 3 && m <= 5 ? "#d2799a" : m >= 6 && m <= 8 ? "#3f8f6a" : m >= 9 && m <= 11 ? "#c2683d" : "#5a86b0";
  document.documentElement.style.setProperty("--accent", col);
}
// PRO 徽章配色（會員）：套用到自己的 PRO 標籤
const PRO_STYLES = [["#ffe07a", "#f0a91e", "#5a3a00", "金"], ["#dfe4ea", "#9aa3ad", "#2a2f36", "銀"], ["#7be0a3", "#2faa6b", "#0c3d24", "翡翠"], ["#ff9a9a", "#e0444f", "#5a0f14", "紅寶"], ["#9ec2ff", "#4f7fe0", "#0f1f4a", "藍寶"], ["#ffb3d1", "#e060a0", "#5a1338", "玫瑰"]];
const PRO_FRAMES = [["#f0a91e", "金"], ["#9aa3ad", "銀"], ["#2faa6b", "翡翠"], ["#e0444f", "紅寶"], ["#4f7fe0", "藍寶"], ["#e060a0", "玫瑰"], ["#2c5d3f", "松綠"]];
function applyProColor() {
  const r = document.documentElement.style;
  const s = PRO_STYLES[+(localStorage.getItem("tt_pro_color") || 0)] || PRO_STYLES[0];
  r.setProperty("--pro-c1", s[0]); r.setProperty("--pro-c2", s[1]); r.setProperty("--pro-ink", s[2]);
  const f = PRO_FRAMES[+(localStorage.getItem("tt_pro_frame") || 0)] || PRO_FRAMES[0];
  r.setProperty("--pro-f", f[0]);
}
function renderProColor() {
  const el = $("#proColorWrap"); if (!el) return;
  if (!(typeof Premium !== "undefined" && Premium.isOn())) { el.innerHTML = ""; return; }
  const cb = +(localStorage.getItem("tt_pro_color") || 0), cf = +(localStorage.getItem("tt_pro_frame") || 0);
  el.innerHTML = `<div class="accent-head">PRO 徽章配色</div>
    <div class="proc-row">${PRO_STYLES.map((s, i) => `<button class="proc-sw${i === cb ? " on" : ""}" data-b="${i}" title="${s[3]}" style="background:linear-gradient(135deg,${s[0]},${s[1]});color:${s[2]}">PRO</button>`).join("")}</div>
    <div class="accent-head">頭像框配色</div>
    <div class="proc-row">${PRO_FRAMES.map((s, i) => `<button class="acc-sw frame-sw${i === cf ? " on" : ""}" data-f="${i}" title="${s[1]}" style="box-shadow:0 0 0 3px ${s[0]} inset">${i === cf ? "✓" : ""}</button>`).join("")}</div>`;
  el.querySelectorAll(".proc-sw[data-b]").forEach(b => b.addEventListener("click", () => {
    localStorage.setItem("tt_pro_color", b.dataset.b); applyProColor(); renderProColor();
    if (typeof toast === "function") toast("已套用徽章配色");
  }));
  el.querySelectorAll(".frame-sw[data-f]").forEach(b => b.addEventListener("click", () => {
    localStorage.setItem("tt_pro_frame", b.dataset.f); applyProColor(); renderProColor();
    if (typeof toast === "function") toast("已套用頭像框配色");
  }));
}
// 我的分頁頂端：社群個人檔案摘要（頭像/名字/勳章/handle/寵物里程）
async function renderMeProfileCard() {
  const el = $("#meProfileCard"); if (!el) return;
  if (typeof Supa === "undefined" || !Supa.ready() || typeof Auth === "undefined") { el.innerHTML = ""; return; }
  const sess = await Auth.session().catch(() => null);
  if (!sess) { el.innerHTML = `<div class="me-card me-card-guest" id="meCardLogin">登入社群以顯示個人檔案 ›</div>`; const b = $("#meCardLogin"); if (b) b.addEventListener("click", () => { const t = document.querySelector('.tab[data-view="social"]'); if (t) t.click(); }); return; }
  const prof = await Auth.myProfile().catch(() => null);
  if (!prof) { el.innerHTML = `<div class="me-card me-card-guest" id="meCardLogin">完成社群註冊以顯示個人檔案 ›</div>`; const b = $("#meCardLogin"); if (b) b.addEventListener("click", () => { const t = document.querySelector('.tab[data-view="social"]'); if (t) t.click(); }); return; }
  const esc = s => (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  const pro = typeof Premium !== "undefined" && Premium.isOn();
  const ps = (typeof petStats === "function") ? petStats() : null;
  const lvl = ps ? ps.level : 0;
  const av = prof.avatar_url
    ? `<img class="me-av${pro ? " pro-av" : ""}" src="${esc(prof.avatar_url)}" alt="">`
    : `<div class="me-av me-av-ph${pro ? " pro-av" : ""}">${esc((prof.display_name || prof.handle || "?").slice(0, 1))}</div>`;
  el.innerHTML = `<div class="me-card">
    ${av}
    <div class="me-card-info">
      <div class="me-card-name">${esc(prof.display_name || prof.handle)}${lvl ? ` <span class="lv-chip lvt-${Math.min(lvl, 7)}">Lv.${lvl}</span>` : ""}${pro ? ` <span class="pro-tag pro-mine">PRO</span>` : ""}</div>
      <div class="me-card-handle">@${esc(prof.handle)}</div>
      ${ps ? `<div class="me-card-pet">${ps.emoji} ${esc(ps.name)}　·　已走 <b>${ps.km}</b> km</div>` : ""}
    </div>
  </div>`;
}
function renderAccent() {
  const row = $("#accentRow"); if (!row) return;
  const pro = typeof Premium !== "undefined" && Premium.isOn();
  const cur = localStorage.getItem("tt_accent");
  row.innerHTML = ACCENTS.map(([c, n]) => `<button class="acc-sw${pro && cur === c ? " on" : ""}" data-acc="${c}" title="${n}" style="background:${c}">${pro && cur === c ? "✓" : ""}</button>`).join("")
    + (pro ? `<button class="acc-sw acc-reset" id="accReset" title="自動（季節）">↺</button>` : `<span class="acc-lock">升級 Premium 解鎖</span>`);
  row.querySelectorAll(".acc-sw[data-acc]").forEach(b => b.addEventListener("click", () => {
    if (!pro) { if (typeof Premium !== "undefined") Premium.openUpgrade(); return; }
    localStorage.setItem("tt_accent", b.dataset.acc); document.documentElement.style.setProperty("--accent", b.dataset.acc); renderAccent();
  }));
  const rst = $("#accReset"); if (rst) rst.addEventListener("click", () => { localStorage.removeItem("tt_accent"); applySeason(); renderAccent(); });
}
function initTheme() {
  applySeason();
  applyProColor();
  const mode = localStorage.getItem("tt_theme") === "dark" ? "dark" : "light";   // 預設淺色，只有明確選深色才深色
  applyTheme(mode);
  document.querySelectorAll(".theme-opt").forEach(b => b.addEventListener("click", () => {
    localStorage.setItem("tt_theme", b.dataset.themeOpt);
    applyTheme(b.dataset.themeOpt);
  }));
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
setTimeout(() => { const s = document.getElementById("splash"); if (s) s.remove(); }, 1700);
// 量測 header 高度供搜尋列吸頂用
function setHeaderH() { const h = document.querySelector(".app-header"); if (h) document.documentElement.style.setProperty("--hdr-h", h.offsetHeight + "px"); }
setHeaderH(); window.addEventListener("load", setHeaderH); window.addEventListener("resize", setHeaderH);
buildFsRegion();
buildCollections();
buildPresets();
initTheme();
if (localStorage.getItem("tt_pet_stage") === null) localStorage.setItem("tt_pet_stage", petStageIndex(totalKm()));   // 既有里程不誤觸進化提示
render();
loadProfile();
restoreActiveRecording();
// 即時路況（若有設定代理）→ 抓最新並重繪
// 即時路況：啟動先抓一次；之後每次回到前景且距上次更新超過 10 分鐘再抓一次，保持新鮮
function refreshConditions() {
  if (typeof Conditions === "undefined") return;
  Conditions.refresh(TRAILS).then(r => {
    if (!r || !r.ok) return;
    render();                                 // 重繪列表（解除/新增封閉標記）
    const t = currentDetailTrail && currentDetailTrail();
    if (t) { const el = document.getElementById("condLive"); if (el) el.innerHTML = conditionBanner(t); }   // 詳情頁開著就更新橫幅
  });
}
refreshConditions();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - (Conditions.lastUpdated() || 0) > 600000) refreshConditions();
});
// 深連結 ?trail=id → 直接開啟該步道
(function () {
  const q = new URLSearchParams(location.search);
  const id = q.get("trail");
  if (id && TRAILS.some(t => t.id === id)) setTimeout(() => openDetail(id), 200);
  // 分享的貼文連結 ?post=<id> → 切到社群分頁，由 SocialUI 開啟該貼文
  if (q.get("post")) { const b = document.querySelector('.tab[data-view="social"]'); if (b) setTimeout(() => b.click(), 250); }
})();

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
    resetFeed() { ls.removeItem("tt_pet_fed"); refresh(); return "可再餵食"; },
    addDays(n = 10) { const h = new Date(petHatch()); h.setDate(h.getDate() - (+n)); ls.setItem("tt_pet_hatch", h.toISOString()); refresh(); return api.state(); },
    clearDebug() { ls.removeItem("tt_debug_km"); refresh(); return api.state(); },
    resetPet() {
      ls.setItem("tt_pet_base", String(realTotalKm())); ls.setItem("tt_pet_hatch", new Date().toISOString());
      ls.setItem("tt_pet_stage", "0"); ls.setItem("tt_pet_berry_spent", String(berriesEarned()));
      ["tt_pet_name", "tt_pet_feedkm", "tt_pet_aff", "tt_pet_aff_t", "tt_pet_fed"].forEach(k => ls.removeItem(k));
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
    clearHikes() { const kept = Store.getRecords().filter(r => !r.dbg); localStorage.setItem("tt_records", JSON.stringify(kept)); refresh(); return "已清除測試行程"; },
    // 一鍵解鎖全部成就：灌入足以滿足所有徽章條件的測試資料
    unlockAch() {
      const recs = [];
      for (let i = 0; i < 100; i++) {                       // 100 筆 → 出行次數成就
        const d = new Date(); d.setDate(d.getDate() - i);   // 連續 100 天 → 連續天數/週數成就
        if (i === 1) d.setHours(6, 0, 0, 0);                // 清晨 → 早起鳥
        else if (i === 2) d.setHours(20, 0, 0, 0);          // 夜間 → 夜行者
        else d.setHours(12, 0, 0, 0);
        const km = i === 0 ? 22 : 5;                        // 一筆 22km → 半馬/馬拉松；總里程 ≈ 517km
        recs.push({
          id: "dbg-ach-" + i, date: d.toISOString(), dbg: true, note: "成就測試",
          distanceKm: km, distance3DKm: km, steps: Math.round(km * 1350), kcal: Math.round(km * 60),
          elapsedMs: Math.round(km * 12 * 60000), ascent: 95, descent: 80,   // 總爬升 9500m → 聖母峰
          track: [{ lat: 24, lon: 121, t: d.getTime() }],
        });
      }
      const kept = Store.getRecords().filter(r => !String(r.id).startsWith("dbg-ach-"));
      localStorage.setItem("tt_records", JSON.stringify(recs.concat(kept)));
      const ids = (typeof TRAILS !== "undefined" ? TRAILS : []).map(t => t.id).filter(Boolean);
      localStorage.setItem("tt_favs", JSON.stringify(ids.slice(0, 12)));      // 收藏 12 條 → 收藏迷
      ids.slice(0, 25).forEach(id => Store.setTrailLog(id, { done: true }));  // 完成 25 條 → 踏遍五徑/收藏家
      checkPetEvolve(); refresh(); try { renderBadges(); } catch (e) { /* */ }
      return "已解鎖全部成就 🏅";
    },
    // 重置成就：清掉解鎖用的測試行程、收藏、完成步道紀錄（保留你真實的行程）
    resetAch() {
      const kept = Store.getRecords().filter(r => !String(r.id).startsWith("dbg-ach-"));
      localStorage.setItem("tt_records", JSON.stringify(kept));
      localStorage.removeItem("tt_favs");
      localStorage.removeItem("tt_log");
      checkPetEvolve(); refresh(); try { renderBadges(); } catch (e) { /* */ }
      return "已重置成就（收藏/完成/測試行程已清空）";
    },
    // 重置每日任務：清掉今日領獎旗標 + 移除今天的行程，讓三項任務進度歸零可重測
    resetQuests() {
      localStorage.removeItem("tt_quest_claim");
      const ds = todayStr();
      const kept = Store.getRecords().filter(r => (r.date || "").slice(0, 10) !== ds);
      localStorage.setItem("tt_records", JSON.stringify(kept));
      checkPetEvolve(); refresh(); try { renderQuests(); } catch (e) { /* */ }
      return "已重置今日任務";
    },
    // 重置所有行程記錄：清空全部行程（真實＋測試），並把寵物成長基準重設，避免里程變負
    clearAllRecords() {
      Store.clearRecords();
      localStorage.setItem("tt_pet_base", "0");
      localStorage.removeItem("tt_pet_feedkm");
      checkPetEvolve(); refresh(); try { renderBadges(); } catch (e) { /* */ }
      return "已清空所有行程記錄";
    },
    state() { return { 成長km: +totalKm().toFixed(2), 等級: petStageIndex(totalKm()) + 1, 果實: berriesBalance(), 愛心: petHearts(), 親密度: affinity(), 今日km: +todayKm().toFixed(1), 出行次數: realRecords().length, debug里程: debugKm() }; },
    panel() { toggleDebugPanel(); },
    help() { console.log("ttDebug 指令：\n addKm(n) setLevel(0-6) maxLevel() evolve()\n addBerries(n) setAffinity(0-100) resetFeed() addDays(n)\n addHike(km) clearHikes()  ← 推進成就/每日環/足跡圖\n unlockAch() resetAch()  ← 解鎖/重置成就\n resetQuests()  ← 重置每日任務\n clearAllRecords()  ← 清空所有行程\n clearDebug() resetPet() state() panel()"); return api.state(); },
  };
  return api;
})();
// DEBUG 測試面板只開放給開發者本人（以登入 Email 驗證）
const TT_OWNER_EMAIL = "phome0425@gmail.com";
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
  if (!(await ttIsOwner())) { if (typeof toast === "function") toast("測試面板僅限開發者使用"); return; }
  p = document.createElement("div");
  p.id = "debugPanel"; p.className = "debug-panel";
  const btns = [
    ["+5km", () => ttDebug.addKm(5)], ["+20km", () => ttDebug.addKm(20)],
    ["進化➡", () => ttDebug.evolve()], ["神龍🐉", () => ttDebug.maxLevel()],
    ["+50🍓", () => ttDebug.addBerries(50)], ["❤️滿", () => ttDebug.setAffinity(100)],
    ["可再餵", () => ttDebug.resetFeed()], ["+30天", () => ttDebug.addDays(30)],
    ["＋行程3km", () => ttDebug.addHike(3)], ["＋行程10km", () => ttDebug.addHike(10)],
    ["清測試行程", () => ttDebug.clearHikes()], ["清debug", () => ttDebug.clearDebug()],
    ["🏅解全成就", () => ttDebug.unlockAch()], ["🏅重置成就", () => ttDebug.resetAch()],
    ["📅重置每日任務", () => ttDebug.resetQuests()],
    ["🗑清所有行程", () => { if (confirm("清空全部行程記錄？")) ttDebug.clearAllRecords(); }],
    ["重置🥚", () => ttDebug.resetPet()],
  ];
  p.innerHTML = `<div class="dbg-h">🛠 測試面板 <span id="dbgState"></span><button id="dbgClose">✕</button></div><div class="dbg-grid"></div>`;
  const grid = p.querySelector(".dbg-grid");
  btns.forEach(([t, fn]) => { const b = document.createElement("button"); b.textContent = t; b.onclick = () => { fn(); document.getElementById("dbgState").textContent = `Lv${ttDebug.state().等級}·${ttDebug.state().成長km}km`; }; grid.appendChild(b); });
  p.querySelector("#dbgClose").onclick = () => p.remove();
  document.body.appendChild(p);
  document.getElementById("dbgState").textContent = `Lv${ttDebug.state().等級}·${ttDebug.state().成長km}km`;
}
// 開啟方式：網址 ?debug=1，或連點 header 標題 5 下
if (new URLSearchParams(location.search).get("debug") === "1") setTimeout(toggleDebugPanel, 400);
(function () {
  const brand = document.querySelector(".brand"); if (!brand) return;
  let n = 0, tm;
  brand.addEventListener("click", () => { n++; clearTimeout(tm); tm = setTimeout(() => n = 0, 1200); if (n >= 5) { n = 0; toggleDebugPanel(); } });
})();

// #22 首次使用導覽
(function onboarding() {
  const KEY = "tt_onboarded_v2";   // 改版 → 現有用戶也會再看一次新版導覽
  if (localStorage.getItem(KEY) || new URLSearchParams(location.search).get("trail")) return;
  const slides = [
    { e: "⛰️", h: "歡迎來到循徑拾光", p: "全台 2100+ 條步道一手掌握。搜尋、分級、記錄、養成，一起走進山林。" },
    { e: "🧭", h: "探索與分級", p: "搜尋步道看官方難度分級、真實路線與海拔剖面；還有天氣、周邊人文景點與美食。用『精選主題輯』快速找古道、瀑布、親子路線。" },
    { e: "📍", h: "記錄每一步", p: "邊走邊記里程、步數、卡路里、爬升與即時海拔曲線；自動暫停、中斷可復原，離線也能用。" },
    { e: "🐉", h: "養成山林夥伴", p: "走路就能養寵物！從一顆蛋開始，靠里程進化：🥚→🦊→🐅→🐉。撿果實、每天餵食、提升親密度，走越多牠陪你長越快。" },
    { e: "🗺️", h: "離線・收藏・備份", p: "出發前可預載離線地圖，山區沒訊號也看得到；收藏步道、行程可一鍵備份，換手機不怕遺失。" },
  ];
  let i = 0;
  const ov = document.createElement("div");
  ov.className = "onboard";
  const render = () => {
    const s = slides[i], last = i === slides.length - 1;
    ov.innerHTML = `<div class="onboard-card">
      <div class="onboard-mark">${s.e}</div>
      <h2>${s.h}</h2>
      <p style="background:none;color:var(--ink-soft);text-align:center">${s.p}</p>
      <div class="onboard-dots">${slides.map((_, k) => `<span class="${k === i ? "on" : ""}"></span>`).join("")}</div>
      <button class="btn primary" id="onboardNext">${last ? "開始探索" : "下一步"}</button>
      ${last ? "" : `<button class="info-link" id="onboardSkip" style="display:block;margin:8px auto 0">略過</button>`}
    </div>`;
    ov.querySelector("#onboardNext").addEventListener("click", () => {
      if (last) { localStorage.setItem(KEY, "1"); ov.remove(); }
      else { i++; render(); }
    });
    const sk = ov.querySelector("#onboardSkip");
    if (sk) sk.addEventListener("click", () => { localStorage.setItem(KEY, "1"); ov.remove(); });
  };
  document.body.appendChild(ov);
  render();
})();

// 浮起的小表情（按讚/表情回應時從按鈕飄起）
window.ttFloat = function (el, emoji) {
  try {
    const r = el.getBoundingClientRect();
    const s = document.createElement("span");
    s.className = "tt-float"; s.textContent = emoji;
    s.style.left = (r.left + r.width / 2) + "px"; s.style.top = (r.top + r.height / 2) + "px";
    document.body.appendChild(s); setTimeout(() => s.remove(), 800);
  } catch (e) { /* */ }
};

// 全域點擊回饋：任何「可點元素」按下時都加按壓動畫 + 輕震動（不必逐一列名單）
(function () {
  const SEL = "a[href], button, [role='button'], [role='tab'], [role='link'], label, summary, .chip, .tab, .sub-tab, .seg-btn, .btn, .link-btn, .icon-btn, .feed-card, .disc-row, .notif, [data-id], [data-view], [data-sub], [data-sec], [data-tag], [data-handle], [onclick]";
  // 判定可點：符合語意選擇器，或電腦樣式 cursor 是 pointer
  function pressable(el) {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      try { if (n.matches && n.matches(SEL)) return n; } catch (_) { }
      try { if (getComputedStyle(n).cursor === "pointer") return n; } catch (_) { }
    }
    return null;
  }
  const canVibrate = "vibrate" in navigator;
  let cur = null, last = 0;
  const release = () => { if (cur) { cur.classList.remove("tt-press"); cur = null; } };
  document.addEventListener("pointerdown", e => {
    const t = pressable(e.target); if (!t) return;
    release(); cur = t; t.classList.add("tt-press");
    if (canVibrate && e.pointerType !== "mouse") { const now = Date.now(); if (now - last > 40) { last = now; try { navigator.vibrate(8); } catch (_) { } } }
  }, { passive: true });
  // 放開 / 取消 / 移出 / 捲動 → 還原
  ["pointerup", "pointercancel", "pointerleave", "dragstart", "scroll"].forEach(ev =>
    document.addEventListener(ev, release, { passive: true, capture: true }));
})();
