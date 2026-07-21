// ===== Gather the Trail 前端主程式 =====
const $ = s => document.querySelector(s);
const TRAILS = window.TRAILS || [];
const SRC_LABEL = { forestry: "林業署", osm: "OSM社群", osm_path: "OSM社群" };
const GRADES = window.GRADES || {};
const geoOf = t => (window.TRAILS_GEO || {})[t.id] || null;   // 路線幾何（延遲載入檔）
// 幾何依縣市分片（web/js/geo/geo-*.js，manifest 開機載）：開詳情只抓該縣市 ~60KB；
// 記錄/篩選需要全台時才載全部分片。載過的分片不重複抓。
const _geoLoaded = new Set();
const _geoPromises = {};
function _loadGeoShard(file) {
  if (_geoLoaded.has(file)) return Promise.resolve();
  if (_geoPromises[file]) return _geoPromises[file];
  _geoPromises[file] = new Promise(resolve => {
    const s = document.createElement("script");
    s.src = "js/geo/" + file;
    s.onload = () => { _geoLoaded.add(file); resolve(); };
    s.onerror = () => resolve();   // 失敗也放行，退化為「無路線」
    document.head.appendChild(s);
  });
  return _geoPromises[file];
}
function ensureGeo(region) {
  const M = window.TT_GEO_SHARDS || {};
  if (region && M[region]) return _loadGeoShard(M[region]);   // 只載這個縣市
  return Promise.all(Object.values(M).map(_loadGeoShard));    // 全台（模擬挑步道/「有路線」篩選）
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
  const edgeLen = e => { let L = 0; for (let i = 1; i < e.pts.length; i++) L += distM(e.pts[i - 1], e.pts[i]); return L; };
  const allEdges = subs.map(s => ({ a: nodeOf(s[0]), b: nodeOf(s[s.length - 1]), pts: s, used: false }));
  allEdges.forEach(e => { e.len = edgeLen(e); });
  // 濾掉「短自環」：小 spur 兩端都吸附到同一頂點會變自環，DFS 遇到會在同節點重入、把主線折返一半
  // （南澳古道 3.4km→5.2km 的元兇）。真正的環狀步道是長自環，保留。
  const edges = allEdges.filter(e => !(e.a === e.b && e.len < 60));
  const adj = nodes.map(() => []);
  edges.forEach(e => { adj[e.a].push({ e, fwd: true }); adj[e.b].push({ e, fwd: false }); });

  const route = [];
  const pushPts = (pts, fwd) => {
    const arr = fwd ? pts : pts.slice().reverse();
    for (let k = route.length ? 1 : 0; k < arr.length; k++) route.push(arr[k]);   // 略過與上一點重複的岔口點
  };
  // 「經此邊往外能觸及的路網總長」——決定哪條分支最深、要留到最後不折返
  const reachBeyond = (farNode, viaEdge) => {   // 從 farNode 出發、不回頭走 viaEdge，可觸及的邊總長
    const vis = new Set([viaEdge]); let tot = 0; const stack = [farNode];
    while (stack.length) { const n = stack.pop(); for (const l of adj[n]) { if (vis.has(l.e)) continue; vis.add(l.e); tot += l.e.len; stack.push(l.fwd ? l.e.b : l.e.a); } }
    return tot;
  };
  const dfs = node => {
    // 取此節點所有還沒走的分支，依「往外可觸及總長」由淺到深排序——最深的留到最後
    const pending = adj[node].filter(l => !l.e.used).map(l => {
      const far = l.fwd ? l.e.b : l.e.a;
      return { link: l, depth: l.e.len + reachBeyond(far, l.e) };
    }).sort((a, b) => a.depth - b.depth);
    for (let i = 0; i < pending.length; i++) {
      const link = pending[i].link;
      if (link.e.used) continue;                     // 迴圈路網：可能已被前一分支繞回走掉
      link.e.used = true;
      pushPts(link.e.pts, link.fwd);                 // 沿這條岔路走出去
      dfs(link.fwd ? link.e.b : link.e.a);           // 繼續從對端往下走
      // 最深的那條（最後一條）走到底就不折返——樹狀路網最小覆蓋、主線不重複走
      if (i < pending.length - 1) pushPts(link.e.pts, !link.fwd);
    }
  };
  // 只走「最大的連通路網」：很多步道的幾何含離主線很遠的零碎小段（資料雜訊），
  // 全部硬串會用直線瞬移接起來＝假里程＋畫面亂跳。找出總長最大的連通元件，只模擬它。
  const comp = nodes.map(() => -1); let nc = 0;
  for (let i = 0; i < nodes.length; i++) {
    if (comp[i] !== -1) continue;
    const stack = [i]; comp[i] = nc;
    while (stack.length) { const n = stack.pop(); for (const l of adj[n]) { const o = l.fwd ? l.e.b : l.e.a; if (comp[o] === -1) { comp[o] = nc; stack.push(o); } } }
    nc++;
  }
  const compLen = new Array(nc).fill(0);
  edges.forEach(e => { compLen[comp[e.a]] += e.len; });
  let best = 0; for (let c = 1; c < nc; c++) if (compLen[c] > compLen[best]) best = c;
  edges.forEach(e => { if (comp[e.a] !== best) e.used = true; });   // 非最大元件的邊視為已走（跳過）

  // 起點要挑「看出去路網最長」的端點(步道真正的一端)，主脊才會落在最後不折返的那段；
  // 若從小分支末端起步，會把主線折返一半（南澳 3.4km 會變 5km）
  const leafScore = i => {
    if (comp[i] !== best) return -1;
    const open = adj[i].filter(l => !l.e.used);
    if (open.length !== 1) return -1;                          // 只從端點(degree 1)起步
    const l = open[0], far = l.fwd ? l.e.b : l.e.a;
    return l.e.len + reachBeyond(far, l.e);                    // 看出去能觸及多長
  };
  const order = nodes.map((_, i) => i).sort((a, b) => leafScore(b) - leafScore(a));
  for (const sn of order) if (adj[sn].some(l => !l.e.used)) dfs(sn);
  // 完全沒接起來（每段都獨立）→ 退回最長的單段，至少走一條連續線、不瞬移
  if (!route.length) return segs.slice().sort((a, b) => b.length - a.length)[0];
  return route;
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
  crown: '<path d="m4 17-1-9 5.5 3.5L12 5l3.5 6.5L21 8l-1 9H4Z"/><path d="M5.5 20.5h13"/>',
  hand: '<path d="M8.5 12V6.2a1.4 1.4 0 0 1 2.8 0V11M11.3 11V4.6a1.4 1.4 0 0 1 2.8 0V11M14.1 11V6.2a1.4 1.4 0 0 1 2.8 0v6.8a6 6 0 0 1-6 6h-.4a5.7 5.7 0 0 1-5.7-5.7V9.6a1.4 1.4 0 0 1 2.8 0V12"/>',
  translate: '<path d="M4 5h9M8.5 3v2M6.2 5c.7 3.1 2.7 5.9 5.3 7.4M10.8 5c-.8 3.4-3.1 6.4-6.3 8.3"/><path d="m12.5 20 3.7-8.5L20 20M13.8 17h4.8"/>',
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
    if (document.querySelector('[data-ov="askinput"]')) { resolve(null); return; }   // 防連點疊層
    const ov = document.createElement("div");
    ov.className = "input-modal"; ov.dataset.ov = "askinput";
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

// 「回到頂部」浮鈕：主視圖（探索/夥伴/我的/社群）捲動夠深才顯示。詳情/結算頁用各自 sheet 的跳頂鈕。
(function () {
  const btn = document.getElementById("backTop");
  if (!btn) return;
  let ticking = false;
  function update() {
    ticking = false;
    const show = window.scrollY > 600;
    btn.hidden = !show;
    btn.classList.toggle("show", show);
  }
  window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
})();

// ---------- 分頁切換 ----------
let detailMap, detailOverlay, detailPoiLayer, detailWpLayer, recMap, recLine, recMarker, petMarker;

// 沿線地標（三角點/山頭/駐在所遺址/吊橋/觀景/水源/山屋/鞍部）——資料取自 OSM，離步道夠近才收（見 enrich_waypoints.py）
// svg=線條式圖示（viewBox 24、白色描邊），地圖標記/清單/圖例共用
const WP_META = {
  survey: { c: "#c0452f", label: "三角點", svg: `<path d="M12 4 20 19H4Z"/>` },
  peak:   { c: "#8a6d3b", label: "山頭", svg: `<path d="M3 19 9 8l4 6 4-5 4 10Z"/>` },
  ruins:  { c: "#7a5c3e", label: "遺址", svg: `<path d="M4 20h16"/><path d="M7 20V9m5 11V6m5 14v-9"/>` },
  bridge: { c: "#2f7ab0", label: "橋", svg: `<path d="M3 9q9 10 18 0"/><path d="M3 9v7m18-7v7"/><path d="M3 13h18"/>` },
  view:   { c: "#3f8f6a", label: "觀景", svg: `<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.5"/>` },
  water:  { c: "#3a7bd5", label: "水源", svg: `<path d="M12 4c-4 6-5 9-5 11a5 5 0 0 0 10 0c0-2-1-5-5-11Z"/>` },
  hut:    { c: "#b0762f", label: "山屋", svg: `<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/>` },
  saddle: { c: "#8a6d3b", label: "鞍部", svg: `<path d="M3 17 8 9l4 4 4-4 5 8"/>` },
};
function wpIcon(type, dim) {
  const m = WP_META[type] || WP_META.view;
  return L.divIcon({ className: "wp-pin" + (dim ? " dim" : ""), html: `<span style="background:${m.c}"><svg viewBox="0 0 24 24">${m.svg}</svg></span>`, iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -13] });
}
// 把地標畫到某圖層；reached=已通過的地標名集合（記錄中變灰）
function drawWaypoints(layer, wps, reached) {
  if (!layer) return;
  layer.clearLayers();
  (wps || []).forEach(w => {
    const m = WP_META[w.type] || WP_META.view;
    const done = reached && reached.has(w.name);
    const lbl = ttT(m.label), nm = (w.name || "").replace(/[<>&]/g, "");
    L.marker([w.lat, w.lon], { icon: wpIcon(w.type, done), keyboard: false }).addTo(layer)
      .bindPopup(`<b>${nm}</b><br>${nm && nm !== lbl ? lbl + " · " : ""}${w.ele ? w.ele + " m · " : ""}${ttT("距起點")} ${(w.distM / 1000).toFixed(1)} km`);
  });
}
// 詳情頁「沿線地標」清單（依里程排序，點了跳到地圖）
function wpIconSvg(type) { const m = WP_META[type] || WP_META.view; return `<span class="wp-ic" style="background:${m.c}"><svg viewBox="0 0 24 24">${m.svg}</svg></span>`; }
function wpListHtml(t) {
  const wps = t.waypoints || [];
  if (!wps.length) return "";
  // 線條式圖例：只列出這條步道有出現的類型
  const types = [...new Set(wps.map(w => w.type))].filter(ty => WP_META[ty]);
  const legend = `<div class="wp-legend">${types.map(ty => `<span class="wp-leg-i">${wpIconSvg(ty)}${ttT(WP_META[ty].label)}</span>`).join("")}</div>`;
  const rows = wps.map(w => {
    const m = WP_META[w.type] || WP_META.view, lbl = ttT(m.label), nm = (w.name || "").replace(/[<>&]/g, "");
    return `<button class="wp-row" data-wplat="${w.lat}" data-wplon="${w.lon}">
      ${wpIconSvg(w.type)}
      <span class="wp-nm">${nm}${nm && nm !== lbl ? `<em>${lbl}</em>` : ""}</span>
      <span class="wp-meta">${w.ele ? w.ele + " m · " : ""}${(w.distM / 1000).toFixed(1)} km</span></button>`;
  }).join("");
  return `<div class="section-title collapsible" id="secWp">${ic("landmark")}${ttT("沿線地標")}（${wps.length}）</div>
    <div id="wpBox" class="wp-list">${legend}${rows}</div>`;
}
function petEmojiNow() { return PET_STAGES[petStageIndex(totalKm())].e; }
// 把美食/景點標在詳情地圖（不改視角，可縮放查看周邊）
// 同一批（美食／景點）重畫前先移除自己上一批的標記：
// 快速關掉再點開同一條步道時，前一次還在飛的 Places 查詢回來會再疊一層（守衛擋不住「同一條步道」）。
const _poiMarks = { food: [], poi: [] };
function plotPoi(items, color, kind) {
  if (!detailMap || !detailPoiLayer || !items) return;
  const bucket = _poiMarks[kind] || (_poiMarks[kind] = []);
  bucket.forEach(m => { try { detailPoiLayer.removeLayer(m); } catch (e) { /* */ } });
  bucket.length = 0;
  items.forEach(p => {
    if (p.lat == null) return;
    const m = L.circleMarker([p.lat, p.lon], { radius: 5, color: "#fff", weight: 1.5, fillColor: color, fillOpacity: .95 })
      .addTo(detailPoiLayer)
      .bindPopup(`<b>${escHtml(p.name)}</b><br>${escHtml(p.kind)}${p.rating ? " · ★" + p.rating.toFixed(1) : ""}`);
    bucket.push(m);
  });
}
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    btn.classList.add("active");
    const view = btn.dataset.view;
    document.body.dataset.view = view;   // 供 CSS 在內頁縮小頂部 Banner
    $("#view-" + view).classList.add("active");
    if (view === "record") {
      requestEntryPerms();   // 首次進記錄頁＝這一下點擊就是手勢，一次問完定位+方位權限
      // 從底部分頁進入＝自由記錄，清掉先前選定步道的路線疊圖。
      // ⚠️ 只有「沒在記錄」時才清！記錄中切去別的分頁再切回來也會走到這裡——
      //    清掉 selectedTrailGeo 的話，這趟的偏離路線警告整趟不再觸發，
      //    而且走完全程也不會被判定「完成步道」（maybeMarkTrailDone 需要它）。
      if (Recorder.getState() === "idle") {
        selectedTrailGeo = null; selectedTrailId = null; clearPreHike();
        hideSelectedTrail();
        Recorder._trailName = null;   // 沒清的話這趟自由記錄會被冠上上一趟的步道名
        if (routeRefLayer && recMap) { recMap.removeLayer(routeRefLayer); routeRefLayer = null; }
        if (guideLine && recMap) { recMap.removeLayer(guideLine); guideLine = null; }   // GPX/貼文帶進來的參考線也要清
        selectedTrailWps = []; if (recWpLayer) recWpLayer.clearLayers(); const _h = $("#recWpHud"); if (_h) _h.innerHTML = "";   // 清沿線地標與 HUD
      }
      ensureGeo();                       // 預載幾何，供模擬挑步道/疊圖用
      ensureMeAvatar();                  // 預取頭像供「我」的地圖標記
      setTimeout(initRecMap, 60);
      // 與小隊同行預設開啟：有目前小隊＋已登入就自動連上（地圖建好後）
      // 修：社群模組是延遲載入的，若太早進記錄頁 Team 還沒載好會直接放棄→以前要重開 app。改成先確保社群載入再連。
      const _tryAutoLive = () => { if (typeof Team !== "undefined" && Team.autoLive && typeof recMap !== "undefined" && recMap) Team.autoLive(recMap); };
      setTimeout(() => { if (typeof Team !== "undefined") _tryAutoLive(); else if (window.loadSocial) window.loadSocial().then(() => setTimeout(_tryAutoLive, 300)); }, 300);
      renderRecIdle();
      // 首次進記錄頁（閒置）→ 情境導覽（等地圖建好再跳）
      if (Recorder.getState() === "idle" && typeof window.ttCoachRecord === "function") setTimeout(() => window.ttCoachRecord(), 650);
    }
    if (view === "pet") {
      renderPet(); renderQuests(); renderBadges();
      if (typeof Pets !== "undefined") {
        Pets.claimGifts().then(n => { if (n > 0) { toast(`收到好友送的 ${n} 🍓！`); renderPet(); } });
        Pets.renderFriends();
      }
    }
    if (view === "me") { renderHistory(); refreshOfflineStatus(); renderPalette(); renderProColor(); renderReminderToggle(); renderMeProfileCard(); renderSyncStatus(); if (typeof Premium !== "undefined") Premium.refresh().then(() => { Premium.renderBox($("#premiumBox")); renderPalette(); renderProColor(); renderMeProfileCard(); applyPalette(); }); }
    if (view === "social") {
      // 社群模組延遲載入：還沒載就先載完再進（開機後 2 秒會自動載，多數時候已就緒）
      if (typeof SocialUI === "undefined" && window.loadSocial) window.loadSocial().then(() => { if (window.wireTeamLive) window.wireTeamLive(); if (typeof SocialUI !== "undefined") SocialUI.onShow(); });
      else if (typeof SocialUI !== "undefined") SocialUI.onShow();
    }
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
// #6 驚喜推薦：依目前篩選結果隨機挑一條步道開詳情，解決選擇困難
$("#btnSurprise").addEventListener("click", () => {
  const pool = (curList && curList.length) ? curList : TRAILS;
  if (!pool.length) { toast(ttT("找不到符合的步道")); return; }
  const t = pool[Math.floor(Math.random() * pool.length)];
  toast(`🎲 ${ttT("為你抽到")}：${t.name}`);
  openDetail(t.id);
});

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
// 最近搜尋（裝置本機，最多 8 筆）
function _recent() { try { return JSON.parse(localStorage.getItem("tt_recent") || "[]"); } catch { return []; } }
function _pushRecent(q) {
  q = (q || "").trim(); if (q.length < 1) return;
  try { const a = _recent().filter(x => x !== q); a.unshift(q); localStorage.setItem("tt_recent", JSON.stringify(a.slice(0, 8))); } catch (e) { /* */ }
}
function _toggleClear() { const b = $("#searchClear"); if (b) b.style.display = $("#searchInput").value ? "flex" : "none"; }
$("#searchInput").addEventListener("input", e => {
  curQuery = e.target.value.trim();
  _toggleClear();
  buildSuggest(curQuery);
  clearTimeout(_searchTm); _searchTm = setTimeout(render, 180);   // 防抖，打字更順
});
$("#searchInput").addEventListener("focus", e => buildSuggest(e.target.value.trim()));
$("#searchInput").addEventListener("keydown", e => { if (e.key === "Enter") { _pushRecent(curQuery); $("#searchInput").blur(); } });
$("#searchClear").addEventListener("click", () => {
  const inp = $("#searchInput"); inp.value = ""; curQuery = ""; _toggleClear();
  buildSuggest(""); render(); inp.focus();
});
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
  // 空查詢＋有最近搜尋 → 顯示「最近搜尋」清單（點一下帶入並搜尋）
  if (!q) {
    const rec = _recent();
    if (!rec.length) { box.style.display = "none"; return; }
    box.innerHTML = `<div class="sug-head">${ttT("最近搜尋")}<button class="sug-clear" id="sugClearRecent">${ttT("清除")}</button></div>` +
      rec.map(r => `<button class="sug" data-q="${r.replace(/"/g, "&quot;")}">${ic("clock")}<span class="sug-n">${r}</span></button>`).join("");
    box.style.display = "block";
    const cb = box.querySelector("#sugClearRecent");
    if (cb) cb.addEventListener("mousedown", e => { e.preventDefault(); try { localStorage.removeItem("tt_recent"); } catch (x) { } box.style.display = "none"; });
    box.querySelectorAll(".sug[data-q]").forEach(b => b.addEventListener("mousedown", e => {
      e.preventDefault(); const inp = $("#searchInput"); inp.value = b.dataset.q; curQuery = b.dataset.q; _toggleClear(); buildSuggest(b.dataset.q); render();
    }));
    return;
  }
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
    e.preventDefault(); box.style.display = "none"; _pushRecent($("#searchInput").value.trim()); openDetail(b.dataset.id);
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
    const hay = `${t.name} ${t.position || ""} ${t.region || ""} ${t.system || ""} ${tagsOf(t).join("")} ${(typeof window !== "undefined" && window.TT_NAMES && window.TT_NAMES[t.name]) || ""}`
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
    ${done ? `<span class="done-badge" title="${ttT("已完成")}">✓</span>` : ""}
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

// 「熱門」排序分數：沒有全站造訪數，用「資料完整度＋可近性」當熱門度代理
// （官方建置、有路況監測、親子友善、交通便利、有季節/時程資訊、難度親民＝越熱門）
function popularityScore(t) {
  let s = 0;
  if (t.source === "forestry") s += 4;
  if (t.condition) s += 1;
  if (t.family_friendly) s += 2;
  if (t.tour) s += 1;
  if (t.best_season) s += 1;
  if (t.pave) s += 1;
  if (t.transport && (t.transport.car || t.transport.m_bus || t.transport.l_bus)) s += 1;
  s += (6 - (t.difficulty || 3)) * 0.5;   // 難度越低越大眾
  return s;
}
// 詳情頁「附近其他步道」：優先用座標找最近的，否則同縣市
function nearbyTrails(t, n = 8) {
  const pool = TRAILS.filter(x => x.id !== t.id);
  if (t.lat && t.lon) {
    const near = pool.filter(x => x.lat && x.lon)
      .map(x => ({ x, d: haversine({ lat: t.lat, lon: t.lon }, { lat: x.lat, lon: x.lon }) }))
      .filter(o => o.d <= 80000)
      .sort((a, b) => a.d - b.d)
      .slice(0, n)
      .map(o => Object.assign({ _distKm: o.d / 1000 }, o.x));
    if (near.length) return near;
  }
  return pool.filter(x => x.region && x.region === t.region).slice(0, n);
}
function nearbyStripHtml(t) {
  const list = nearbyTrails(t);
  if (!list.length) return "";
  const cards = list.map(x => {
    const d = x.difficulty || 0;
    const bits = [x.difficulty_label];
    if (x.length_km != null) bits.push(`${x.length_km}km`);
    const dist = x._distKm != null ? `<span class="nb-dist">${ic("compass")}${x._distKm.toFixed(x._distKm < 10 ? 1 : 0)}km</span>` : "";
    return `<button class="nearby-card" data-id="${x.id}"><span class="nb-bar d${d}"></span><span class="nb-name">${x.name}</span><span class="nb-meta">${bits.join(" · ")}</span>${dist}</button>`;
  }).join("");
  return `<div class="section-title" id="secNearby">${ic("compass")}${ttT("附近其他步道")}</div><div class="nearby-strip" id="nearbyBox">${cards}</div>`;
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
    // 最近走過：用紀錄裡各步道的最新日期
    let lastWalk = null;
    if (curSort === "recent") {
      lastWalk = new Map();
      for (const r of Store.getRecords()) {
        if (r.trailId == null || !r.date) continue;
        const k = String(r.trailId), d = String(r.date);
        if (!lastWalk.has(k) || d > lastWalk.get(k)) lastWalk.set(k, d);
      }
    }
    const cmp = {
      "length-asc": (a, b) => ln(a) - ln(b), "length-desc": (a, b) => ln(b) - ln(a),
      "diff-asc": (a, b) => df(a) - df(b), "diff-desc": (a, b) => df(b) - df(a),
      "rating-desc": (a, b) => (Store.trailLog(b.id).rating || 0) - (Store.trailLog(a.id).rating || 0),
      "name": (a, b) => a.name.localeCompare(b.name, "zh-Hant"),
      "recent": (a, b) => (lastWalk.get(String(b.id)) || "").localeCompare(lastWalk.get(String(a.id)) || "") || ln(a) - ln(b),
      "popular": (a, b) => popularityScore(b) - popularityScore(a) || ln(a) - ln(b),
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
    // 依「為什麼是空的」給對的話：收藏空/完成空要引導怎麼做，別一律說「找不到、清除篩選」
    let msg = "找不到符合的步道", hint = "試試清除篩選或換個關鍵字";
    if (activeFilters.has("fav")) { msg = "還沒有收藏的步道"; hint = "點步道卡右上的 ☆ 就能收藏"; }
    else if (activeFilters.has("done")) { msg = "還沒有完成的步道"; hint = "走完一條步道就會自動標記完成"; }
    $("#trailList").innerHTML = `<div class="empty">${EMPTY_ART}${msg}<br>
      <span style="font-size:12.5px">${hint}</span><br>
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
      if (!Store.isFav(star.dataset.fav) && !favAddAllowed()) return;
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
// 底圖：Esri 地形(含立體陰影) / 衛星影像 — 比 OpenTopoMap 精緻
// 商用授權：config.js 設 window.ARCGIS_API_KEY → 走 Esri 授權端點 ibasemaps-api（帶 token）；
// 沒設 → 暫回免費公開端點（開始收費前務必填金鑰，見 docs/map-licensing.md）。
const _AGKEY = (typeof window !== "undefined" && window.ARCGIS_API_KEY) || "";
const ESRI = _AGKEY
  ? "https://ibasemaps-api.arcgis.com/arcgis/rest/services"
  : "https://server.arcgisonline.com/ArcGIS/rest/services";
const AGTOK = _AGKEY ? `?token=${encodeURIComponent(_AGKEY)}` : "";
// detectRetina：高 DPR 手機（如 iPhone 3x）改抓深一階圖磚縮小顯示→更清晰不糊
// 地形底圖：Esri 授權端點(ibasemaps-api)沒有 World_Topo_Map raster（已移到向量圖服務），
// 改用 NLSC 台灣官方電子地圖（免費政府開放資料、可商用、對台灣更詳細）；立體感靠 Esri hillshade 疊上。座標 z/y/x。
function baseTopo() { return L.tileLayer("https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}", { attribution: "© 內政部國土測繪中心", maxZoom: 19, maxNativeZoom: 18, detectRetina: true }); }
function baseSat() { return L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}${AGTOK}`, { attribution: "© Esri、Maxar 衛星影像", maxZoom: 19, maxNativeZoom: 18, detectRetina: true }); }
// 2.5D 地形陰影（hillshade）：疊在底圖上、以 multiply 混色壓暗坡面陰影→山勢立體。
// 同 Esri 來源，SW 一樣快取得到（離線可用）。專屬 pane 放在底圖之上、路線/標記之下。
const ESRI_HILLSHADE = `${ESRI}/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}${AGTOK}`;
function hillshadeLayer(map) {
  if (!map.getPane("hillshade")) {
    const p = map.createPane("hillshade");
    p.style.zIndex = 250;                 // 底圖(tilePane=200) 之上、overlay(400)/marker 之下
    p.style.mixBlendMode = "multiply";
    p.style.pointerEvents = "none";
    p.style.opacity = "0.5";
  }
  return L.tileLayer(ESRI_HILLSHADE, { pane: "hillshade", maxZoom: 18, maxNativeZoom: 16, attribution: "" });
}

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
        terrain: { type: "raster-dem", tiles: ["https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png"], tileSize: 256, encoding: "terrarium", maxzoom: 15, attribution: "Terrain: AWS/Mapzen" },
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
      toast(ttT("🗺 記錄中 3D：可自由滑動、縮放、傾斜地圖"));
      _start3dLive();
      return;
    }
    if (opts.fly) {
      // 回放＝俯瞰整條路線、可自由滑動地圖。相機不自己動→不會被山擋、不閃；只讓小藍點沿路線走
      try { _map3d.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, pitch: 38, bearing: 0, duration: 0 }); } catch (e) { /* */ }
      preload3DFull({ n: maxLat + 0.01, s: minLat - 0.01, e: maxLng + 0.01, w: minLng - 0.01 }, () => {});   // 背景預載，拖到別處也順
      toast(ttT("🗺 俯瞰模式：可自由滑動、縮放、傾斜地圖"));
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
// 指北針：讀裝置方位，轉動手機時指針跟著轉、指向實際北方
let _compassOn = false, _heading = 0, _gpsHeading = null, _navUp = false, _navUserOff = false;
function rotateCompasses() { document.querySelectorAll(".compass-rose").forEach(r => r.style.transform = `rotate(${-_heading}deg)`); }
// 導航模式（heading-up）：只旋轉「地圖圖層面板」(tiles/markers)，控制鈕在外層不轉→四顆鈕固定、縮放正常、小隊照常。
const NAV_SCALE = 1.8;   // 放大面板以蓋住旋轉後的角落空缺（縮放仍可用，只是視覺基準放大）
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
  if (!_navUp) { pane.style.transform = base; pane.style.transformOrigin = ""; return; }
  const size = recMap.getSize();
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
  if (_navUp) { try { enableCompass(); } catch (e) { /* */ } updateMeCone(); }
  else { document.querySelectorAll("#recMap .tm-av, #recMap .pm-e").forEach(e => e.style.transform = ""); updateMeCone(); if (recMap) setTimeout(() => recMap.invalidateSize(), 60); }
}
// 更新記錄地圖「我」的面朝錐：優先用手機羅盤(站著轉身也動)，沒有才用 GPS 行進方向
function updateMeCone() {
  if (_navUp) {
    applyPaneRotation();   // 地圖圖層跟著行進方向轉（不動控制鈕）
    const h = navHeading();
    // 頭像框＋寵物保持「正的」＋抵銷面板放大：反向旋轉 +h、反向縮放 1/NAV_SCALE
    document.querySelectorAll("#recMap .tm-av, #recMap .pm-e").forEach(e => e.style.transform = `rotate(${h}deg) scale(${1 / NAV_SCALE})`);
  }
  if (!recMarker || !recMarker._av || !recMarker.getElement) return;
  const el = recMarker.getElement(); const dir = el && el.querySelector(".tm-dir"); if (!dir) return;
  // 導航：頭像框已直立，方向角(tm-dir)設 0°→在螢幕上朝正上方(前方)＝原本相框的角就是指標
  if (_navUp) { dir.style.transform = "rotate(0deg)"; dir.style.display = "block"; return; }
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
function _warmUpPerms() {
  try { enableCompass(); } catch (e) { /* */ }
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
function addCompass(map) {
  const c = L.control({ position: "topright" });
  c.onAdd = () => {
    const d = L.DomUtil.create("div", "map-compass" + (_compassOn ? " on" : ""));
    d.title = "指北針（點一下啟用）";
    d.innerHTML = `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18.5" fill="rgba(255,253,248,.94)" stroke="rgba(0,0,0,.15)"/><g class="compass-rose" style="transform-origin:20px 20px;transform:rotate(${-_heading}deg)"><polygon points="20,4 24.5,21 15.5,21" fill="#c0392b"/><polygon points="20,36 24.5,19 15.5,19" fill="#9aa0a6"/><text x="20" y="13.5" text-anchor="middle" font-size="8" font-weight="700" fill="#fff">N</text></g></svg>`;
    L.DomEvent.disableClickPropagation(d);
    d.addEventListener("click", enableCompass);
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
    d.innerHTML = SVG_EXPAND; d.title = "全螢幕";
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
    const d = L.DomUtil.create("div", "map-fs-btn");
    d.innerHTML = SVG; d.title = ttT("回到我的位置");
    L.DomEvent.disableClickPropagation(d);
    d.addEventListener("click", () => {
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
  return `　·　即時更新於 ${new Date(u).toLocaleString(ttLocale(), { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
}
// 外部來源的字串插進 innerHTML 前一律跳脫：Google Places 的店名/簡介是店家可自訂的欄位、
// 林業署公告也是外部資料，直接插入會破版（最壞情況是 stored XSS）。
function escHtml(v) {
  return String(v == null ? "" : v).replace(/[<>&"']/g, ch =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[ch]));
}
function conditionBanner(t) {
  const c = t.condition;
  // 有官方公告（落石／坍方／崩塌／封閉等）→ 紅/黃警示橫幅
  if (c && c.status) {
    const closed = /暫停|封閉|關閉/.test(c.status);
    return `<div class="cond-banner ${closed ? "danger" : "warn"}">
      <div class="cond-h">${closed ? "⛔" : "⚠️"} ${escHtml(c.status)}${c.section ? `（${escHtml(c.section)}）` : ""}</div>
      ${c.title ? `<div class="cond-body">${escHtml(c.title)}</div>` : ""}
      ${(c.title && typeof I18n !== "undefined" && I18n.lang() !== "zh") ? `<div class="pv-tr-row"><button class="link-btn" id="condTranslate">${ic("translate")} ${ttT("翻譯年糕")}</button></div><div class="cond-body pv-cap-tr" id="condTr" style="display:none"></div>` : ""}
      ${c.reopen ? `<div class="cond-meta">預計重新開放：${fmtYmd(c.reopen)}　${escHtml(c.dep || "")}</div>` : ""}
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
// 詳情頁「生態」區塊：小黑蚊/蚊蟲警示 + 這個海拔帶常見動植物（離線）+ 選配的 iNaturalist 真實目擊。
// 介面文案翻 25 語言；物種名維持中文（比照步道資料，收在 i18n-ignore）。
// 每段可翻文字都獨立成一個文字節點——複合節點（emoji/等級黏在同一節點）字典查不到會漏翻。
function ecologyHtml(t) {
  if (typeof Ecology === "undefined") return "";
  const r = Ecology.speciesFor(t);
  const alt = t.alt_low != null ? t.alt_low : t.alt_high;   // 小黑蚊在低海拔 → 用步道最低點最保守
  const env = (t.name || "") + (t.position || "") + tagsOf(t).join("");
  const risk = Ecology.biteRisk(alt, t.region, new Date(), env);
  const LV = { high: ["風險高", "eco-hi"], mid: ["風險中", "eco-mid"], low: ["風險低", "eco-lo"], none: ["幾乎無", "eco-no"] };
  const [lvTxt, lvCls] = LV[risk.level] || LV.none;
  const CATN = { mammal: ["🦌", "哺乳類"], bird: ["🐦", "鳥類"], insect: ["🦋", "昆蟲"], herp: ["🐸", "兩棲爬蟲"] };
  const cats = Ecology.CATS.map(k => {
    const arr = r.species[k] || []; if (!arr.length) return "";
    const [emo, nm] = CATN[k];
    const chips = arr.map(sp => `<span class="eco-sp${Ecology.isPoison(sp) ? " eco-poison" : ""}">${Ecology.isPoison(sp) ? "⚠️" : ""}${sp}</span>`).join("");
    return `<div class="eco-cat"><span class="eco-cat-h"><span class="eco-emo">${emo}</span><span>${nm}</span></span><span class="eco-chips">${chips}</span></div>`;
  }).join("");
  return `
    <div class="section-title collapsible" id="secEco">${ic("leaf")}<span>生態</span></div>
    <div id="ecoBox" class="eco-box">
      <div class="eco-bite ${lvCls}">
        <div class="eco-bite-h"><span class="eco-emo">🦟</span><span>小黑蚊・蚊蟲</span><span class="eco-lv">${lvTxt}</span></div>
        <ul class="eco-tips">${risk.tips.map(x => `<li>${x}</li>`).join("")}</ul>
      </div>
      <div class="eco-src">這個海拔帶常會遇到的（非本步道實際紀錄）</div>
      ${cats}
      <button class="link-btn eco-nearby-btn" id="ecoNearbyBtn">${ic("search")}<span>看這附近的真實目擊</span></button>
      <div id="ecoNearbyBox" class="eco-nearby"></div>
    </div>`;
}
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
  await Promise.all([ensureGeo(t.region), ensureDetail()]);   // 幾何只載這條步道的縣市分片
  mergeDetail(t);                       // 併入 guide/entrances/交通等詳情欄位
  const d = t.difficulty || 0;
  const ascCached = (typeof Profile !== "undefined" && Profile.cachedGain) ? Profile.cachedGain(t.id) : null;
  const ascInit = ascCached != null ? ascCached : (t.ascent != null ? Math.round(t.ascent) : null);
  const ascEst = (t.source === "osm" && ascCached == null) ? "（估）" : "";   // OSM 沿線推估、非實走→標示估算
  // 重點數據卡：難度／長度／累積爬升／預估時間／海拔（只列有值的，OSM 步道欄位少時自動少格）
  const stat = [["target", "難度", `<span class="badge diff d${d}"><span class="lvl">${d}</span>${t.difficulty_label}</span>`]];
  if (t.length_km != null) stat.push(["ruler", "長度", `${t.length_km} km${t.source === "osm" ? "（估）" : ""}`]);
  if (ascInit != null || geoOf(t)) stat.push(["up", "累積爬升", `<span id="kvAscent">${ascInit != null ? ascInit + " m" + ascEst : "計算中…"}</span>`]);
  if (t.tour) stat.push(["clock", "預估時間", t.tour]);
  if (t.alt_high != null || t.alt_low != null) stat.push(["mountain", "海拔範圍", `${t.alt_low ?? "?"}–${t.alt_high ?? "?"} m`]);
  if (t.region) stat.push(["map", "地區", t.region]);   // 補第六格，湊成對稱的偶數格
  const statHtml = `<div class="statcard">${stat.map(([ico, l, v]) =>
    `<div class="stat"><div class="stat-h">${ic(ico)}<span>${l}</span></div><div class="stat-v">${v}</div></div>`).join("")}</div>`;

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
    <div class="detail-tabs" id="detailNav" role="tablist">
      <button data-tab="ov" class="on" role="tab">概覽</button>
      <button data-tab="rt" role="tab">路線</button>
      <button data-tab="ec" role="tab">生態</button>
      <button data-tab="nb" role="tab">周邊</button>
    </div>
    <div class="tabwrap">
      <section class="tabpane" data-pane="ov" role="tabpanel">
        <div id="condLive">${conditionBanner(t)}</div>
        ${statHtml}
        ${tagsOf(t).length ? `<div class="tag-row">${tagsOf(t).map(g => `<span class="tag">${TAG_ICON[g] ? TAG_ICON[g] + " " : ""}${g}</span>`).join("")}</div>` : ""}
        ${gradeExplain(t)}
        ${metaHtml}
        ${t.guide ? `<div class="guide">${t.guide.replace(/\n/g, "<br>")}</div>${(typeof I18n !== "undefined" && I18n.lang() !== "zh") ? `<div class="pv-tr-row"><button class="link-btn" id="guideTranslate">${ic("translate")} ${ttT("翻譯年糕")}</button></div><div class="guide pv-cap-tr" id="guideTr" style="display:none"></div>` : ""}` : ""}
        <div class="link-row flow">
          ${nav ? `<a class="link-btn" href="${nav}" target="_blank" rel="noopener">${ic("compass")} 導航</a>` : ""}
          <a class="link-btn" href="${moreSearch}" target="_blank" rel="noopener">${ic("search")} 查資訊</a>
          <button class="link-btn" id="btnShareTrail">${ic("share")} 分享</button>
          <button class="link-btn" id="btnEventTrail">${ic("calendar")} 揪團</button>
          <button class="link-btn" id="btnCompare">${ic("compare")} ${compareSet.has(t.id) ? "移出比較" : "加入比較"}</button>
          ${t.url ? `<a class="link-btn" href="${t.url}" target="_blank" rel="noopener">${ic("external")} 原始頁</a>` : ""}
        </div>
        ${myLogHtml(t)}
        <div id="trailFeedBox"></div>
        <div id="activityBox" hidden></div>
      </section>
      <section class="tabpane" data-pane="rt" role="tabpanel" hidden>
        <div class="section-title" id="secWx">${ic("sun")}天氣（步道所在地）</div>
        <div id="weatherBox"><div class="food-loading"><span class="spin"></span>查詢天氣中…</div></div>
        ${hasGeo ? `<div class="section-title" id="secElev">${ic("mountain")}海拔剖面</div><div id="profileBox"><div class="food-loading"><span class="spin"></span>計算海拔剖面中…</div></div>` : ""}
        ${wpListHtml(t)}
        <button class="btn ghost" id="btnOffline" style="margin-top:14px">${ic("download")} 預載此步道離線地圖</button>
        <div id="offlineBox" class="offline-box" style="display:none"></div>
      </section>
      <section class="tabpane" data-pane="ec" role="tabpanel" hidden>
        ${ecologyHtml(t)}
      </section>
      <section class="tabpane" data-pane="nb" role="tabpanel" hidden>
        <div id="amenBox" class="amen-box"></div>
        <div class="section-title" id="secPoi">${ic("landmark")}附近人文景點</div>
        <div id="poiBox">${skelCards(3)}</div>
        <div class="section-title" id="secFood">${ic("food")}步道周邊美食</div>
        <div id="foodBox">${skelCards(3)}</div>
        ${nearbyStripHtml(t)}
      </section>
    </div>
    <div class="detail-credit">${credit}</div>
    <div class="detail-actionbar">
      <button class="btn primary" id="btnGoRecord">${ic("pin")}在此步道開始記錄</button>
    </div>
  `;
  // 生態：連網才載 iNaturalist 附近真實目擊；離線/失敗安靜降級（不影響離線的規則式內容）
  const enb = $("#ecoNearbyBtn");
  if (enb) enb.addEventListener("click", async () => {
    const box = $("#ecoNearbyBox"); if (!box) return;
    if (enb.dataset.done) { box.style.display = box.style.display === "none" ? "block" : "none"; return; }
    if (!navigator.onLine) { box.innerHTML = `<div class="eco-src">需要網路才能看真實目擊</div>`; box.style.display = "block"; return; }
    enb.disabled = true; box.style.display = "block";
    box.innerHTML = `<div class="food-loading"><span class="spin"></span>查詢附近目擊中…</div>`;
    const obs = (typeof Ecology !== "undefined") ? await Ecology.nearbyObservations(t.lat, t.lon) : null;
    enb.disabled = false;
    if (!obs) { box.innerHTML = `<div class="eco-src">這附近暫時沒有可顯示的目擊記錄</div>`; return; }
    enb.dataset.done = "1";
    box.innerHTML = `<div class="eco-src">iNaturalist 附近 5 公里的真實觀察</div><div class="eco-obs">`
      + obs.map(o => `<div class="eco-ob">${o.thumb ? `<img src="${o.thumb}" loading="lazy" alt="">` : `<span class="eco-ob-noimg">🔍</span>`}<span>${o.name}</span></div>`).join("")
      + `</div>`;
  });
  // 路況公告翻譯年糕（非中文介面）：官方公告原文翻成介面語言
  const ctr = $("#condTranslate");
  if (ctr) ctr.addEventListener("click", async () => {
    const out = $("#condTr"); if (!out) return;
    if (out.style.display !== "none") { out.style.display = "none"; ctr.innerHTML = `${ic("translate")} ${ttT("翻譯年糕")}`; return; }
    if (out.dataset.done) { out.style.display = "block"; ctr.innerHTML = `${ic("translate")} ${ttT("收合翻譯")}`; return; }
    ctr.disabled = true; ctr.textContent = ttT("翻譯中…");
    const src = (t.condition && [t.condition.title, t.condition.content].filter(Boolean).join("\n")) || "";
    const tr = (typeof ttTranslate === "function" && src) ? await ttTranslate(src, ttTrTarget()) : null;
    ctr.disabled = false;
    if (!tr) { ctr.textContent = ttT("翻譯失敗，點此重試"); return; }
    out.textContent = tr; out.dataset.done = "1"; out.style.display = "block";
    ctr.innerHTML = `${ic("translate")} ${ttT("收合翻譯")}`;
  });
  // 介紹文翻譯年糕（英文介面）：翻成英文、可收合
  const gtr = $("#guideTranslate");
  if (gtr) gtr.addEventListener("click", async () => {
    const out = $("#guideTr"); if (!out) return;
    if (out.style.display !== "none") { out.style.display = "none"; gtr.innerHTML = `${ic("translate")} ${ttT("翻譯年糕")}`; return; }
    if (out.dataset.done) { out.style.display = "block"; gtr.innerHTML = `${ic("translate")} ${ttT("收合翻譯")}`; return; }
    gtr.disabled = true; gtr.textContent = ttT("翻譯中…");
    const tr = (typeof ttTranslate === "function") ? await ttTranslate(t.guide, ttTrTarget()) : null;
    gtr.disabled = false;
    if (!tr) { gtr.textContent = ttT("翻譯失敗，點此重試"); return; }
    out.textContent = tr; out.dataset.done = "1"; out.style.display = "block";
    gtr.innerHTML = `${ic("translate")} ${ttT("收合翻譯")}`;
  });
  // 詳情分頁：點頁籤切換內容（一次只顯示一頁）
  const navBtns = $("#detailNav").querySelectorAll("button");
  const panes = $("#detailBody").querySelectorAll(".tabpane");
  const showTab = (tab) => {
    navBtns.forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
    panes.forEach(p => { p.hidden = p.dataset.pane !== tab; });
    // 對齊頁籤（不重看 hero，也避免切到較短分頁時捲過頭露白）
    const sheet = $("#detailSheet"), navTop = $("#detailNav").offsetTop;
    if (sheet.scrollTop > navTop) sheet.scrollTop = navTop;
  };
  navBtns.forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
  // 區塊可收合
  $("#detailBody").querySelectorAll(".section-title.collapsible").forEach(hd => hd.addEventListener("click", () => {
    const collapsed = hd.classList.toggle("collapsed");
    const box = hd.nextElementSibling;
    if (box) box.style.display = collapsed ? "none" : "";
  }));
  // 附近其他步道：點卡片切換到該步道詳情
  $("#detailBody").querySelectorAll(".nearby-card").forEach(el => el.addEventListener("click", () => {
    const nid = el.dataset.id; if (nid) openDetail(nid);
  }));
  // 沿線地標：點清單一列 → 地圖跳到該地標並開泡泡
  $("#detailBody").querySelectorAll(".wp-row").forEach(b => b.addEventListener("click", () => {
    const la = +b.dataset.wplat, lo = +b.dataset.wplon;
    if (detailMap) { detailMap.setView([la, lo], 16); const mp = $("#detailMap"); if (mp) mp.scrollIntoView({ block: "center", behavior: "smooth" }); }
    detailWpLayer && detailWpLayer.eachLayer(m => { try { const ll = m.getLatLng(); if (Math.abs(ll.lat - la) < 1e-5 && Math.abs(ll.lng - lo) < 1e-5) setTimeout(() => m.openPopup(), 350); } catch (e) { /* */ } });
  }));
  loadPhoto(t);
  loadWeather(t);
  loadElevation(t);
  loadTrailFeed(t);
  loadTrailActivity(t);
  // Places 查詢（設施/美食/景點）較耗額度 → 滑到該區塊才查，省 Google 每日配額
  whenVisible($("#amenBox"), () => loadAmenities(t));
  whenVisible($("#poiBox"), () => loadAttractions(t));
  whenVisible($("#foodBox"), () => loadFood(t));

  setTimeout(() => {
    if (!detailMap) {
      detailMap = L.map("detailMap", { zoomControl: false });
      addBaseWithToggle(detailMap);
      addThreeD(detailMap, () => open3D(currentDetailTrail()));   // 「3D」鈕：開 MapLibre 3D 地形
      addFullscreen(detailMap);   // 全螢幕鈕（假全螢幕搬到 body，詳情 sheet 內也能正確覆蓋）
      detailOverlay = L.layerGroup().addTo(detailMap);
      detailPoiLayer = L.layerGroup().addTo(detailMap);
      detailWpLayer = L.layerGroup().addTo(detailMap);
    }
    detailOverlay.clearLayers();
    detailPoiLayer.clearLayers();
    drawWaypoints(detailWpLayer, t.waypoints);   // 沿線地標
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
    selectedTrailWps = t.waypoints || [];    // 沿線地標（記錄地圖疊圖＋下一個地標 HUD）
    Recorder._trailName = nm;
    showSelectedTrail(nm);                   // 可取消的選定列（選錯了不必切分頁繞一圈）
    renderPreHike(t);                        // #3 行前小卡：天氣＋日落＋建議裝備
    setTimeout(() => { initRecMap(); drawSelectedRoute(); resetWpHud(); }, 80);
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

  // 首次點開步道詳情 → 情境導覽（等面板滑入穩定再跳；已關閉就不跳）
  if (typeof window.ttCoachTrail === "function") setTimeout(() => window.ttCoachTrail(!!geoOf(t)), 550);
}
async function loadAmenities(t) {
  const box = $("#amenBox");
  if (!box) return;
  try {
    const items = await Amenities.nearby(t);
    if (_detailTrail !== t) return;                    // 使用者已切到別條步道 → 這批資料不是他要看的
    if (!items || !items.length) { box.style.display = "none"; return; }
    box.innerHTML = `<div class="amen-row">` + items.map(a =>
      `<span class="amen"><b>${a.label}</b> ${(a.dist / 1000).toFixed(1)}km</span>`).join("") + `</div>`;
  } catch { box.style.display = "none"; }
}

async function loadPhoto(t) {
  const hero = $("#heroWrap");
  if (!hero) return;
  try {
    const items = await Photos.forTrailMulti(t, 5);     // [{url, credit}]，credit = 作者 · 授權（Wikimedia CC 合規）
    if (_detailTrail !== t) return;                     // 已切換步道 → 別把舊步道的照片貼到新面板
    if (!items || !items.length) return;                // 無照片：保留漸層等高線底
    const urls = items.map(it => it.url);
    hero.classList.remove("noimg");
    const car = document.createElement("div");
    car.className = "hero-carousel";
    car.innerHTML = items.map(it => `<img alt="${t.name}" src="${it.url}" loading="lazy" decoding="async">`).join("")
      + (items.length > 1 ? `<div class="hero-dots">${items.map((_, i) => `<span class="${i ? "" : "on"}"></span>`).join("")}</div>` : "");
    hero.insertBefore(car, hero.firstChild);
    // CC 授權要求標作者＋授權：隨輪播顯示當張照片的 credit
    const creditEl = document.createElement("div");
    creditEl.className = "hero-credit";
    const setCredit = i => { creditEl.textContent = `📷 ${items[i].credit}${items.length > 1 ? " · 左右滑看更多" : ""}`; };
    setCredit(0);
    hero.insertBefore(creditEl, hero.firstChild);
    car.querySelectorAll("img").forEach((im, idx) => {
      if (im.complete && im.naturalWidth) im.classList.add("loaded");
      else { im.addEventListener("load", () => im.classList.add("loaded")); im.addEventListener("error", () => im.classList.add("loaded")); }
      im.addEventListener("click", () => openLightbox(urls, idx));   // 點圖放大
    });
    if (items.length > 1) {
      const dots = car.querySelector(".hero-dots");
      car.addEventListener("scroll", () => {
        const i = Math.max(0, Math.min(items.length - 1, Math.round(car.scrollLeft / car.clientWidth)));
        dots.querySelectorAll("span").forEach((s, k) => s.classList.toggle("on", k === i));
        setCredit(i);
      }, { passive: true });
    }
  } catch { /* 無照片就維持漸層底 */ }
}

// 照片燈箱：全螢幕放大、可左右滑
function openLightbox(urls, start) {
  if (document.querySelector('[data-ov="lightbox"]')) return;   // 防連點疊層
  const ov = document.createElement("div");
  ov.className = "lightbox"; ov.dataset.ov = "lightbox";
  ov.innerHTML = `<button class="lb-close" aria-label="關閉">✕</button>
    <div class="lb-track">${urls.map(u => `<div class="lb-slide"><img loading="lazy" decoding="async" src="${u}" alt=""></div>`).join("")}</div>`;
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
    if (_detailTrail !== t) return;                    // 已切換步道
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
    if (_detailTrail !== t) return;                    // 已切換步道 → 不要把舊步道的天氣寫進新面板
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
    const items = await Food.nearby(t);
    if (_detailTrail !== t) return;                    // 已切換步道 → 舊步道的美食不可以蓋到新面板
    _foodItems = items;
    plotPoi(_foodItems, "#c2683d", "food");
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
        <span class="food-name">${escHtml(f.name)}</span>
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
    const pois = await Attractions.nearby(t);
    if (_detailTrail !== t) return;                    // 已切換步道
    _poiItems = pois;
    plotPoi(_poiItems, "#3b6ea5", "poi");
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
          <span class="poi-name">${escHtml(p.name)}</span>
          ${p.rating ? `<span class="poi-rating">★ ${p.rating.toFixed(1)}</span>` : ""}
        </div>
        ${p.summary ? `<div class="poi-sum">${escHtml(p.summary)}</div>` : ""}
        <div class="poi-dist">${(p.dist / 1000).toFixed(1)} km</div>
      </a>`).join("")}</div>
    <div class="food-credit">🔵 已標於上方地圖　·　來源：Google 地圖</div>`;
  box.querySelectorAll(".food-sort-btn").forEach(b =>
    b.addEventListener("click", () => { _poiSort = b.dataset.psort; renderAttractions(); }));
}

// Premium：離線地圖免費 5 次，用完才需升級。回傳是否允許本次下載（允許則計入並提醒剩餘）。
// 非會員離線地圖：以容量（MB）計額度，一次大量下載也照實際大小扣，會員不限
const OFFLINE_FREE_MB = 10;
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
  if (!(await ttConfirm(`下載全台離線地圖（縮放 7–${zmax}）約 ${tiles.length} 張圖磚、約 ${(tiles.length * 0.02).toFixed(0)} MB？\n\n可離線看全島概覽；個別步道細節請另在步道詳情按「預載離線地圖」。\n下載需幾分鐘，請保持開啟。`))) return;
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
  // 底圖 + 高程圖磚（z13–14）：高程一起抓，山上沒訊號時爬升/下降校正與坡度著色才算得出來。
  // 高程圖磚數量比底圖少一個數量級（同範圍只需低倍），對額度影響很小。
  const tiles = [...Offline.tileList(bbox, zmin, zmax), ...Offline.tileListUrl(bbox, 13, 14, _TERR_URL)];
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
    live.innerHTML = `<b>${(d / 1000).toFixed(2)}</b> km　·　${fmtTime(totMs * frac)}`;
    barFill.style.width = (frac * 100) + "%";
    if (f >= frames || d >= total) {
      clearInterval(trackAnim); trackAnim = null;
      grow.setLatLngs(finalLL);
      L.circleMarker(pts[pts.length - 1], { radius: 6, color: "#fff", weight: 2, fillColor: "#d2542e", fillOpacity: 1 }).addTo(trackReplayLayer);
      live.innerHTML = `<b>${(trackStats ? trackStats.km : d / 1000).toFixed(2)}</b> km　·　${fmtTime(totMs)}　🏁`;
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
function openTrackReview(rec, isNew) {
  if (!rec) return;
  _shotUrls.forEach(u => URL.revokeObjectURL(u)); _shotUrls = [];   // 回收上一份結算的照片 URL
  const km = rec.distanceKm || 0, t3 = rec.distance3DKm;
  $("#trackBody").innerHTML = `
    <h2>${rec.trailName || "自由路線"}</h2>
    <div class="track-date">${new Date(rec.date).toLocaleString(ttLocale())}</div>
    ${(() => { const bk = (isNew && isFootRec(rec)) ? personalBestBreaks(rec) : []; return bk.length ? `<div class="pb-burst">${bk.map(b => `<span class="pb-badge">${b.e} <b>${b.label === "首次健行紀錄！" ? ttT(b.label) : `${ttT("破紀錄")}·${ttT(b.label)}`}</b></span>`).join("")}</div>` : ""; })()}
    <div class="kv">
      <div class="item"><div class="l">距離</div><div class="v">${km.toFixed(2)} km</div></div>
      <div class="item"><div class="l">時間</div><div class="v">${fmtTime(rec.elapsedMs)}</div></div>
      <div class="item"><div class="l">總爬升${rec.altCorrected ? " ·已校正" : ""}</div><div class="v">↑${rec.ascent || 0} m</div></div>
      <div class="item"><div class="l">總下降</div><div class="v">↓${rec.descent || 0} m</div></div>
      <div class="item"><div class="l">卡路里</div><div class="v">${rec.kcal} 大卡</div></div>
      <div class="item"><div class="l">步數</div><div class="v">${(rec.steps || 0).toLocaleString()}</div></div>
      ${!rec.sim && rec.elapsedMs > 0 && km > 0.05 ? `<div class="item"><div class="l">平均速度</div><div class="v">${(km / (rec.elapsedMs / 3.6e6)).toFixed(1)} km/h</div></div>` : ""}
      ${!rec.sim && rec.elapsedMs > 6e5 && (rec.ascent || 0) >= 100 && _pro() ? `<div class="item"><div class="l">爬升速率</div><div class="v">${Math.round(rec.ascent / (rec.elapsedMs / 3.6e6))} m/hr</div></div>` : ""}
      ${t3 && t3 > km + 0.05 ? `<div class="item"><div class="l">含坡度距離</div><div class="v">${t3.toFixed(2)} km</div></div>` : ""}
    </div>
    ${speedHtml(rec)}
    ${(rec.id === hikePhotosRecId && hikePhotos.length) ? `<div class="section-title">${ic("camera")}隨手拍（${hikePhotos.length}）<span class="shot-hint">點照片存到相簿</span></div>
      <div class="hike-shots">${hikePhotos.map((p, i) => `<figure class="shot" data-i="${i}"><img loading="lazy" decoding="async" src="${(u => { _shotUrls.push(u); return u; })(URL.createObjectURL(p.file))}" alt=""><figcaption>${new Date(p.t).toLocaleTimeString(ttLocale(), { hour: "2-digit", minute: "2-digit" })} · ${p.km.toFixed(2)}km</figcaption></figure>`).join("")}</div>` : ""}
    <div class="link-row flow">
      <button class="link-btn" id="trackReplay">${ic("play")} 重播路徑</button>
      <button class="link-btn" id="track3d">${ic("mountain")} 3D 回放<span class="pro-tag">PRO</span></button>
      <button class="link-btn" id="trackCard">${ic("camera")} 分享圖卡</button>
      <button class="link-btn" id="trackGpx">${ic("download")} 下載路線檔<span class="pro-tag">PRO</span></button>
      <button class="link-btn" id="trackShare">${ic("share")} 分享行程</button>
      ${rec.sim ? "" : `<button class="link-btn" id="trackSocial">${ic("megaphone")} 分享到社群</button>`}
    </div>`;
  $("#trackMask").classList.add("show");
  $("#trackSheet").classList.add("show");
  $("#trackSheet").scrollTop = 0;
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
  if (hrs < 0) return ` ⚠️ ${ttT("天已黑")}`;
  if (hrs < 3) return ` ⚠️ ${ttT("剩不到 3 小時天黑")}`;
  return "";
}
async function renderPreHike(t) {
  const el = $("#preHike"); if (!el) return;
  if (!t || !t.lat) { clearPreHike(); return; }
  const g = GRADES[t.difficulty] || null, gear = g ? g.gear : "";
  const gearRow = `<div class="ph-row"><span class="ph-ic">🎒</span><span>${ttT("建議裝備")}：${gear ? ttT(gear) : "—"}</span></div>`;
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
    const wline = `${emo} ${ttT(txt)}${tmin != null ? ` ${tmin}–${tmax}°` : ""}${pop != null ? ` · ☔${pop}%` : ""}`;
    el.innerHTML =
      `<div class="ph-row"><span class="ph-ic">🌤</span><span>${wline}</span></div>` +
      (sunHM ? `<div class="ph-row"><span class="ph-ic">🌇</span><span>${ttT("今日日落")} ${sunHM}${sunsetWarn(sunHM)}</span></div>` : "") +
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
function checkOffRoute(s) {
  const banner = $("#offRoute");
  if (!banner) return;
  const last = s.track && s.track.length ? s.track[s.track.length - 1] : null;
  if (s.state !== "running" || !last || !routeSegs()) { hideOffRoute(); return; }

  const d = distToRoute(last.lat, last.lon);
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
  $("#recStatus").textContent = "按「開始」記錄這條步道";
}
function clearSelectedTrail() {
  selectedTrailGeo = null; selectedTrailId = null;
  selectedTrailWps = []; if (recWpLayer) recWpLayer.clearLayers(); { const _h = $("#recWpHud"); if (_h) _h.innerHTML = ""; }
  Recorder._trailName = null;
  if (routeRefLayer && recMap) { recMap.removeLayer(routeRefLayer); routeRefLayer = null; }
  if (guideLine && recMap) { recMap.removeLayer(guideLine); guideLine = null; }
  clearPreHike();
  hideSelectedTrail();
  $("#recStatus").textContent = "自由路線，按「開始」記錄路徑";
  toast(ttT("已改為自由路線"));
}
function hideSelectedTrail() {
  const el = $("#selTrail");
  if (el) { el.hidden = true; el.innerHTML = ""; }
}

function initRecMap() {
  if (!recMap) {
    recMap = L.map("recMap", { zoomControl: false }).setView([25.033, 121.564], 15);
    baseTopo().addTo(recMap); hillshadeLayer(recMap).addTo(recMap); addCompass(recMap); addNavToggle(recMap); addRecenter(recMap); addThreeD(recMap, open3DRecording); addFullscreen(recMap);
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
    if (_gpsWeakHits >= 4 && Date.now() - _gpsWarnAt > 25000) { _gpsWarnAt = Date.now(); toast(ttT("📡 GPS 訊號較弱，走到空曠處收訊會更準")); }
  } else _gpsWeakHits = 0;
}
Recorder.onUpdate(s => {
  recSnap = s;
  syncRecButtons(s.state);   // 按鈕依 Recorder 實際狀態校正：startRecordingUI 中途若拋例外，這裡會補上暫停/結束鈕
  updateGpsSig(s);
  // 沿線地標 HUD：用最新軌跡點算「下一個地標／剩多遠」＋抵達提示
  if (s.state === "running" && selectedTrailWps.length && s.track && s.track.length) { const p = s.track[s.track.length - 1]; try { updateWpHud(p.lat, p.lon); } catch (e) { /* */ } }
  $("#stDist").textContent = s.distanceKm.toFixed(2);
  $("#stSteps").textContent = s.steps.toLocaleString();
  $("#stKcal").textContent = s.kcal;
  $("#stTime").textContent = fmtTime(s.elapsedMs);
  $("#stPace").textContent = (s.state === "running" && s.instKmh != null) ? s.instKmh.toFixed(1) : "--";
  checkOffRoute(s);   // 偏離路線警告（有路線可比對時）
  // 新記錄重置（含 busy 旗標：否則上一趟卡住的校正會讓這趟一直送不出）
  if (s.state === "idle") { _liveElev = null; _liveElevAt = 0; _liveElevLen = 0; _liveElevBusy = false; _recSeq++; }
  // GPS 高度常為 null → 即時爬升會卡在 0；用地形 DEM 節流校正，讓即時值接近結算值
  if (s.state === "running" && typeof Elevation !== "undefined" && s.track && s.track.length >= 8) {
    const now = Date.now();
    if (!_liveElevBusy && now - _liveElevAt > 30000 && s.track.length - _liveElevLen >= 8) {
      _liveElevBusy = true; _liveElevAt = now; _liveElevLen = s.track.length;
      const seq = _recSeq;   // 這次校正屬於哪一趟：遲到的結果不可以蓋到下一趟的畫面
      Elevation.correct(s.track.slice())
        .then(c => { if (seq !== _recSeq) return; if (c) _liveElev = c; _liveElevBusy = false; })
        .catch(() => { if (seq === _recSeq) _liveElevBusy = false; });
    }
  }
  const ad = (_liveElev && (s.ascent || 0) < _liveElev.ascent) ? _liveElev : s;   // 取較準（GPS 為 0 時用 DEM）
  if ($("#stAscent")) $("#stAscent").textContent = `↑${Math.round(ad.ascent || 0)}`;
  if ($("#stDescent")) $("#stDescent").textContent = `↓${Math.round(ad.descent || 0)}`;
  drawRecSpark(s.altSeries);
  // 果實隨機撿拾：每走 10m 有 5% 機率撿到一顆 🍓，撿到就提示（模擬不算）
  if (s.state === "running" && !s.resting && !sim()) {
    if (_berryLastKm == null || _berryLastKm > s.distanceKm) _berryLastKm = s.distanceKm;
    let dM = (s.distanceKm - _berryLastKm) * 1000;
    let picked = 0;
    while (dM >= 10) { dM -= 10; _berryLastKm += 0.01; if (Math.random() < 0.05) picked++; }
    if (picked > 0 && typeof addBerryPicked === "function") {
      addBerryPicked(picked);
      if (navigator.vibrate) navigator.vibrate([90, 40, 90]);
      toast(picked === 1 ? ttT("🍓 撿到一顆果實！") : `🍓 ${ttT("撿到果實")} +${picked}！`);
      try { renderPet(); } catch (e) { /* */ }
    }
  }
  // 每公里震動里程提示（不再和果實綁定）
  if (s.state === "running" && !s.resting && !sim()) {
    const kmDone = Math.floor(s.distanceKm);
    if (kmDone > lastKmMilestone) { lastKmMilestone = kmDone; if (navigator.vibrate) navigator.vibrate([120, 60, 120]); }
  }
  if (s.simDone && !window.__simDoneToasted) { window.__simDoneToasted = true; toast("模擬已走完整條路線，按「⏹ 結束」看結算"); if (navigator.vibrate) navigator.vibrate([60, 40, 60]); }
  if (s.state === "idle") window.__simDoneToasted = false;
  if (s.error) $("#recStatus").innerHTML = `⚠️ ${s.error}（可改用模擬模式）`;
  else if (s.state === "running" && s.resting) $("#recStatus").innerHTML = `<span class="resting">🌿 休息中</span>`;
  else if (s.state === "running") {
    // #9 偏離步道路線提醒
    let off = null;
    if (selectedTrailGeo && s.track.length) {
      const last = s.track[s.track.length - 1];
      off = distToRoute(last.lat, last.lon);
    }
    // 偏離的警告交給 #offRoute 橫幅（同一套門檻＋持續判定＋震動）；這裡只做「在路線上」的正向回饋，
    // 否則兩套門檻不同會互相打架（橫幅說偏離、狀態列同時說在路線上）。
    const onRoute = off != null && off <= OFF_ROUTE_DIST;
    $("#recStatus").innerHTML = `<span class="live">記錄中${onRoute ? "・在路線上" : ""}</span>`;
  } else if (s.state === "paused") $("#recStatus").textContent = "已暫停";

  if (s.state === "running" && s.track.length && !recPreloaded) {
    recPreloaded = true;                       // 只在首個定位點觸發一次
    preloadAround(s.track[0].lat, s.track[0].lon);
    preload3D(s.track[0].lat, s.track[0].lon);   // #1 順手預載 3D 地形（PRO）
  }
  // 記錄中持續往前預載 3D 地形（每分鐘一次，跟著目前位置）
  if (s.state === "running" && s.track.length) { const l = s.track[s.track.length - 1]; preload3D(l.lat, l.lon); }
  if (recLine && s.track.length) {
    const pts = s.track.map(p => [p.lat, p.lon]);
    recLine.setLatLngs(trackSegments(s.track).map(seg => seg.map(p => [p.lat, p.lon])));   // 依 gap 分段畫線
    const last = pts[pts.length - 1];
    // 小隊同行：把記錄位置（含模擬）餵給隊伍圖層，隊友才看得到我（TeamLive 內部有 3 秒節流）
    if (typeof TeamLive !== "undefined" && TeamLive.isOn() && TeamLive.updatePos) TeamLive.updatePos(last[0], last[1], s.heading);
    const meAv = window.__meAvatar;   // 登入且有頭像才用頭像標記
    if (meAv) {
      // 自己的原點＝頭像 + 寵物徽章（與隊友一致）；移除浮動寵物避免重複
      if (!recMarker || !recMarker._av) {
        if (recMarker) recMap.removeLayer(recMarker);
        const mePro = (typeof Premium !== "undefined" && Premium.isOn()) ? " pro" : "";
        recMarker = L.marker(last, { icon: L.divIcon({ className: "team-marker me-marker" + mePro, html: `<div class="tm-av"><div class="tm-dir"><span class="tm-cone"></span></div><img src="${meAv}" alt=""><span class="tm-pet">${typeof PET_ART !== "undefined" ? PET_ART.svg(petStageIndex(totalKm())) : petEmojiNow()}</span></div>`, iconSize: [32, 32], iconAnchor: [16, 16] }), zIndexOffset: 1100 }).addTo(recMap);
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
        icon: L.divIcon({ className: "pet-marker", html: `<span class="pm-e">${typeof PET_ART !== "undefined" ? PET_ART.svg(petStageIndex(totalKm())) : petEmojiNow()}</span>`, iconSize: [40, 40], iconAnchor: [20, 34] }),
        interactive: false, zIndexOffset: 1000,
      }).addTo(recMap);
      petMarker.setLatLng(last);
    }
    // 模擬高幀率：用 animate:false 讓地圖即時跟隨，路線從腳下滑過＝滑行感；真實 GPS 維持平滑動畫
    if (s.state === "running") recMap.panTo(last, (sim() || _navUp) ? { animate: false } : undefined);
  }
});

// 省電模式 + 分享即時位置 + 公里里程碑
let lastKmMilestone = 0, _berryLastKm = null;
$("#lowPowerToggle").addEventListener("change", e => {
  Recorder.setLowPower(e.target.checked);
  toast(e.target.checked ? "已開省電模式（下次定位生效）" : "已關省電模式");
});
// 螢幕保持喚醒：勾選後記錄中螢幕不熄滅（持久化記住選擇；裝置不支援則隱藏此選項）
(() => {
  const chk = $("#wakeLockToggle"), opt = $("#wakeLockOpt");
  if (!chk) return;
  if (!("wakeLock" in navigator)) { if (opt) opt.style.display = "none"; return; }
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
function addSnapPhoto(f) {
  if (!f) return;
  const km = recSnap ? (recSnap.distanceKm || 0) : 0;
  hikePhotos.push({ file: f, t: Date.now(), km });
  $("#snapCount").textContent = ` (${hikePhotos.length})`;
  toast(`已拍照 · ${km.toFixed(2)}km`);
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
    const text = `我目前的位置：${url}`;
    if (navigator.share) navigator.share({ title: "我的即時位置", text, url }).catch(() => {});
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
function syncRecButtons(state) {
  const teamMember = typeof TeamLive !== "undefined" && TeamLive.isOn() && !TeamLive.isLeader();
  const start = $("#btnStart"), pause = $("#btnPause"), stop = $("#btnStop"), snap = $("#btnSnap"), lock = $("#btnLock");
  if (!start) return;
  if (state === "running") {
    start.style.display = "none";
    pause.style.display = teamMember ? "none" : "block";
    stop.style.display = teamMember ? "none" : "block";
    if (!sim() && snap) snap.style.display = "block";
    if (!teamMember && lock) lock.style.display = "block";
  } else if (state === "paused") {
    start.style.display = "block"; start.textContent = "▶ 繼續";
    pause.style.display = "none";
    stop.style.display = teamMember ? "none" : "block";
  } else {   // idle
    start.style.display = teamMember ? "none" : "block"; start.textContent = "▶ 開始";
    pause.style.display = "none"; stop.style.display = "none";
    if (snap) snap.style.display = "none";
    if (lock) lock.style.display = "none";
  }
}

// 開始記錄（本人按鈕 / 小隊隊長廣播都走這裡）
function startRecordingUI() {
  initRecMap();
  hideSelectedTrail();   // 開始後不給取消：中途改自由路線會讓偏離警告/完成判定的依據在半路消失
  ensureMeAvatar();
  clearPreHike();                     // #3 開始記錄後收起行前小卡
  // 導航模式（地圖跟著方向轉）預設開；但模擬時不開——模擬每一步都在換方位，
  // 地圖會跟著不停轉動，看起來就是一直抖。模擬維持傳統的北方朝上。
  if (!sim() && !_navUserOff) setTimeout(() => setNavUp(true), 300);   // 使用者手動切過「自由」就別自動開回導航
  else setNavUp(false);
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
    // chainSegments 已是「走完所有岔路、主線不重複」的最小覆蓋走法（樹狀路網最後一條分支不折返），
    // 不再截斷——截斷會把岔路砍掉（就是「岔路走不完」的原因）
    const route = selectedTrailGeo && selectedTrailGeo.length ? chainSegments(selectedTrailGeo) : null;
    Recorder.setSimRoute(route);
  }
  try {
    if (Recorder.getState() === "paused") Recorder.resume(sim());
    else { hikePhotos = []; $("#snapCount").textContent = ""; Recorder.start(sim()); }   // 新的一趟：清空隨手拍
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
  if (Recorder.getState() === "idle") $("#btnStart").style.display = isMember ? "none" : "block";
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
  $("#btnStart").textContent = "▶ 繼續";
  $("#btnStart").style.display = "block";
  $("#btnPause").style.display = "none";
  // 隊長按暫停 → 全隊一起暫停
  if (typeof TeamLive !== "undefined" && TeamLive.isOn() && TeamLive.isLeader() && TeamLive.sendPause) TeamLive.sendPause();
});
// 隊員收到隊長「暫停 / 繼續」訊號 → 各自暫停 / 繼續自己的記錄（隊員本就沒有控制鈕）
function _teamOnPauseCb() {
  if (Recorder.getState() !== "running") return;
  Recorder.pause();
  $("#btnStart").style.display = "none"; $("#btnPause").style.display = "none";   // 隊員無控制鈕，等隊長繼續
  $("#recStatus").innerHTML = `<span class="autopause">⏸ ${ttT("隊長已暫停，等隊長繼續")}</span>`;   // 明確狀態，不只 toast
  toast("👑 隊長暫停了記錄");
  if (navigator.vibrate) navigator.vibrate(60);
}
function _teamOnResumeCb() {
  if (Recorder.getState() !== "paused") return;
  Recorder.resume(sim());
  $("#btnStart").style.display = "none"; $("#btnPause").style.display = "none";
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
  setNavUp(false); _navUserOff = false;   // 結束記錄→退出導航視角、下趟恢復預設導航
  recPreloaded = false; lastKmMilestone = 0; _berryLastKm = null;   // 下次記錄重新預載/里程碑/果實錨點
  $("#btnStart").textContent = "▶ 開始";
  $("#btnStart").style.display = "block";
  $("#btnPause").style.display = "none";
  $("#btnStop").style.display = "none";
  $("#btnSnap").style.display = "none";
  $("#btnLock").style.display = "none"; setRecLock(false);   // 結束記錄→解除口袋鎖定
  if (rec) hikePhotosRecId = rec.id;   // 隨手拍歸屬這趟，結算頁才顯示
  safeRun("clear-markers", () => { if (recMarker) { recMap.removeLayer(recMarker); recMarker = null; } if (petMarker) { recMap.removeLayer(petMarker); petMarker = null; } if (recLine) recLine.setLatLngs([]); });
  if (autoVehicle) toast("偵測到車輛速度（>20km/h），已自動結束記錄");
  if (rec) {
    rec.trailName = Recorder._trailName || "自由路線";
    if (selectedTrailId) rec.trailId = selectedTrailId;   // 連回步道，供社群貼文點擊開啟
    // 地形海拔校正(DEM)：自動內建，用準確的水平軌跡查真實地面高度重算爬升/下降（GPS 高度太雜）
    // 模擬也校正：沿真實步道座標查地形，原路折返自然會有對應的下降（不再只計爬升）
    // 不再要求 navigator.onLine：高程圖磚可能已在快取（記錄中預載/看過地圖）→ 離線也校正得出來，
    // 真的拿不到資料時 Elevation.correct 會回 null，維持 GPS 數字，不會壞。
    // 海拔校正（Elevation.correct 內部已 try/catch 回 null，這裡再包一層兜底；逾時 15 秒）
    await safeRun("elevation-correct", async () => {
      if (!rec.vehicle && rec.track && rec.track.length > 1 && typeof Elevation !== "undefined") {
        $("#recStatus").textContent = "海拔校正中…";
        const corr = await Promise.race([Elevation.correct(rec.track), new Promise(r => setTimeout(() => r(null), 15000))]);
        if (corr) { rec.ascent = corr.ascent; rec.descent = corr.descent; rec.altHigh = corr.altHigh; rec.altLow = corr.altLow; rec.altCorrected = true; }
      }
    });
    // 存檔：最優先，先於任何週邊步驟；失敗不能靜默（讓使用者知道去確認，不是整趟消失）
    const saved = await safeRun("save-record", () => Store.addRecord(rec));
    if (!saved) toast(ttT("儲存失敗"));   // 極罕見（addRecord 有多層 fallback），但失敗不靜默；詳因記進 tt_errors
    // 完成判定放在結算前（結算頁可能顯示「已完成」狀態）
    await safeRun("mark-done", () => maybeMarkTrailDone(rec));   // 真實走過＋全程沒偏離步道超過 1km 才算完成
    $("#recStatus").textContent = autoVehicle ? "偵測到車輛速度，已自動結束" : "準備就緒，按「開始」記錄路徑";
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
  } else {
    toast(autoVehicle ? "偵測到車輛速度，已停止（路徑太短，未儲存）" : "路徑太短，未儲存");
    $("#recStatus").textContent = "準備就緒，按「開始」記錄路徑";
  }
}
$("#btnStop").addEventListener("click", () => {
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
$("#btnExportGpxAll").addEventListener("click", async () => {
  if (!_proGate()) return;   // PRO：批次匯出全部路線檔
  GPX.exportAll(await Store.allFull()) ? toast("已下載全部行程路線檔") : toast("尚無行程可下載");
});

async function refreshOfflineStatus() {
  const el = $("#offlineStatus");
  if (!el) return;
  Offline.enforceCap && Offline.enforceCap().catch(() => { });   // 順手控管圖磚快取上限（瀏覽時 SW 也會塞）
  const n = await Offline.cachedCount();
  el.textContent = n ? `已快取地圖圖磚：${n} 張（約 ${(n * 0.02).toFixed(1)} MB）` : "尚未下載任何離線地圖";
  const q = $("#offlineQuota");
  if (q) {
    if (typeof Premium !== "undefined" && Premium.isOn()) q.innerHTML = `<span class="oq-pro">${ic("sparkle")} Premium：無限下載</span>`;
    else { const left = Math.max(0, OFFLINE_FREE_MB - offlineMbUsed()); q.innerHTML = `免費額度：剩 <b>${left.toFixed(1)}</b> / ${OFFLINE_FREE_MB} MB（含記錄時預載）<div class="oq-up-line"><a class="oq-up" id="oqUp">升級 Premium 無限下載</a></div>`; const up = $("#oqUp"); if (up) up.addEventListener("click", () => { if (typeof Premium !== "undefined") Premium.openUpgrade(); }); }
  }
  // #9 收藏一鍵預載：按鈕即時顯示可下載的收藏數（（N）為語言中性），沒有收藏就淡化提示
  const fb = $("#btnFavOffline");
  if (fb && !fb.disabled) {
    const favN = TRAILS.filter(t => Store.isFav(t.id) && t.lat).length;
    let sp = fb.querySelector(".fav-n");
    if (!sp) { sp = document.createElement("span"); sp.className = "fav-n"; fb.appendChild(sp); }
    sp.textContent = favN ? `（${favN}）` : "";
    fb.classList.toggle("op-btn-dim", favN === 0);
  }
}
// 「我的」設定區：點分類標題展開/收合
document.querySelectorAll("#view-me .set-head").forEach(h => h.addEventListener("click", () => h.parentElement.classList.toggle("open")));
$("#btnDiag").addEventListener("click", async () => {
  const errs = (window.ttErrors ? window.ttErrors() : []);
  const g = fn => { try { const v = fn(); return (v == null ? "?" : v); } catch (e) { return "?"; } };
  let sw = "?"; try { const t = await (await fetch("./sw.js", { cache: "no-store" })).text(); sw = (t.match(/trail-tracker-v\d+/) || ["?"])[0]; } catch (e) { /* */ }
  let tiles = "?"; try { if (typeof Offline !== "undefined" && Offline.cachedCount) tiles = await Offline.cachedCount(); } catch (e) { /* */ }
  let login = "未登入"; try { if (typeof Supa !== "undefined" && Supa.ready && Supa.ready()) { const { data } = await Supa.client().auth.getUser(); if (data && data.user) login = "已登入"; } } catch (e) { /* */ }
  const pro = g(() => (typeof Premium !== "undefined" && Premium.isOn()) ? "PRO" : "免費");
  const recN = g(() => Store.getRecords().length);
  const doneN = g(() => (Store.doneCount ? Store.doneCount() : "?"));
  const favN = g(() => TRAILS.filter(t => Store.isFav(t.id)).length);
  const lang = g(() => (typeof I18n !== "undefined" ? I18n.lang() : "zh"));
  const theme = g(() => localStorage.getItem("tt_theme") || "light");
  const fs = g(() => localStorage.getItem("tt_fontscale") || "1.2");
  const lsKB = g(() => Math.round(Object.keys(localStorage).reduce((s, k) => s + ((localStorage.getItem(k) || "").length + k.length), 0) / 1024));
  const os = g(() => (navigator.userAgent.match(/iPhone|iPad|Android|Windows|Macintosh|Linux/) || ["?"])[0]);
  const swState = g(() => (navigator.serviceWorker && navigator.serviceWorker.controller) ? "已控制" : "未控制");
  const L = [
    "循徑拾光 診斷報告",
    "時間 " + new Date().toLocaleString(),
    "SW版本 " + sw + " " + swState,
    "裝置 " + innerWidth + "x" + innerHeight + " @" + (window.devicePixelRatio || 1) + "x " + (navigator.onLine ? "線上" : "離線"),
    "系統 " + os,
    "語言 " + lang + " 主題 " + theme + " 字級 " + fs,
    "帳號 " + login + " " + pro,
    "小隊 " + g(() => { if (typeof TeamLive === "undefined" || !TeamLive.status) return "模組未載"; const s = TeamLive.status(); return s.on ? ("輪詢" + (s.poll ? "OK" : "失敗") + "/回報" + (s.push ? "OK" : "失敗") + " · 在線 " + s.members + " · 隊長" + (s.leader ? "有" : "無")) : "未連線"; }),
    "步道 " + TRAILS.length + " 紀錄 " + recN + " 完成 " + doneN + " 收藏 " + favN,
    "離線圖磚 " + tiles + " 本機資料 " + lsKB + "KB",
    "近期錯誤 " + errs.length,
    (errs.slice(0, 10).map(e => "· " + ((e.t || "") + "").slice(5, 16) + " " + e.m).join("\n") || "（無）"),
  ];
  const info = L.join("\n");
  if (navigator.clipboard) navigator.clipboard.writeText(info).then(() => toast(errs.length ? `已複製診斷(${errs.length}筆錯誤)，可貼給開發者` : "已複製診斷，目前無錯誤")).catch(() => ttAlertBox(info));
  else ttAlertBox(info);
});
$("#btnFootMap").addEventListener("click", () => { if (!_proGate()) return; openFootprintMap(); });
$("#btnAllOffline").addEventListener("click", downloadAllTaiwan);
$("#btnFavOffline").addEventListener("click", downloadFavOffline);

// Premium：雲端備份 / 還原（跨裝置）
async function cloudClient() {
  if (typeof Supa === "undefined" || !Supa.ready()) { toast("社群尚未啟用"); return null; }
  const c = Supa.client(); const { data: u } = await c.auth.getUser();
  if (!u || !u.user) { toast("請先到社群分頁登入"); return null; }
  return { c, uid: u.user.id };
}
async function cloudBackupNow(silent) {
  const x = await cloudClient(); if (!x) return false;
  // 同一支手機切換多個帳號時：localStorage 是共用的，但雲端備份是「每個帳號一列」。
  // 若本機資料屬於「別的帳號」（tt_data_uid≠目前登入），直接備份會用 A 的資料蓋掉 B 的雲端備份。
  // 自動備份→直接跳過保護；手動備份→先警告確認。
  const owner = (() => { try { return localStorage.getItem("tt_data_uid"); } catch (e) { return null; } })();
  if (owner && owner !== x.uid) {
    if (silent) return false;   // 自動：絕不覆蓋別的帳號的雲端
    const go = await ttConfirm("這台裝置目前的資料是「另一個帳號」的。備份會用這份資料覆蓋『目前登入帳號』的雲端備份，確定要繼續？");
    if (!go) return false;
  }
  try {
    if (!silent) toast("備份到雲端中…");
    const { error } = await x.c.from("backups").upsert({ user_id: x.uid, data: Store.exportAll(), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (!error) { try { localStorage.setItem("tt_data_uid", x.uid); localStorage.setItem("tt_last_sync", String(Date.now())); } catch (e) { /* */ } try { renderSyncStatus(); } catch (e) { /* */ } }   // 本機資料歸屬＝目前帳號
    if (!silent) toast(error ? "備份失敗：" + error.message : "已備份到雲端 ✓");
    return !error;
  } catch (e) { if (!silent) toast("備份失敗：" + (e && e.message || e)); return false; }
}
// 每趟走完自動雲端備份（靜默，失敗不打擾）——資料安全不鎖付費：任何登入者都自動備份
async function autoCloudBackup() {
  try {
    if (typeof Supa === "undefined" || !Supa.ready()) return;
    const c = Supa.client(); const { data: u } = await c.auth.getUser();
    if (!u || !u.user) return;   // 沒登入就沒雲端備份（改用匯出備份檔）
    // 離線送出佇列：離線或失敗→標記待備份，回線自動補送（資料安全不因當下沒網路而漏）
    if (typeof navigator !== "undefined" && navigator.onLine === false) { try { localStorage.setItem("tt_backup_pending", "1"); } catch (e) { } return; }
    if (await cloudBackupNow(true)) { try { localStorage.removeItem("tt_backup_pending"); } catch (e) { } toast("已自動備份到雲端 ☁️"); }
    else { try { localStorage.setItem("tt_backup_pending", "1"); } catch (e) { } }
  } catch (e) { try { localStorage.setItem("tt_backup_pending", "1"); } catch (_) { } }
}
// 回線自動補送待備份（離線時走完的行程，恢復連線就補傳雲端）
function _retryPendingBackup() { try { if (localStorage.getItem("tt_backup_pending") === "1" && navigator.onLine) setTimeout(autoCloudBackup, 1500); } catch (e) { } }
if (typeof window !== "undefined") { window.addEventListener("online", _retryPendingBackup); setTimeout(_retryPendingBackup, 4000); }   // 回線時＋開機後各試一次
// 同步累積里程/寵物到雲端 profile：好友比較讀 profiles.total_km，走完就更新才不會過時
async function syncMyStatsToCloud() {
  try {
    if (typeof Supa === "undefined" || !Supa.ready() || typeof Profiles === "undefined") return;
    const c = Supa.client(); const { data: u } = await c.auth.getUser();
    if (u && u.user) await Profiles.syncMyStats(u.user.id);
  } catch (e) { /* 靜默；社群模組未載入或未登入就略過 */ }
}
if (typeof window !== "undefined") window.syncMyStatsToCloud = syncMyStatsToCloud;
// 自動雲端「拉取」：登入後把雲端備份自動同步下來，讓同一帳號換裝置／網頁版就看得到彼此的紀錄。
// （原本只有自動「上傳」沒有自動「下載」→ 換平台像空的，要手動按還原。）安全策略：
//   本機沒紀錄(全新裝置/平台) → 完整還原（含寵物/成就/設定）；本機已有紀錄 → 只聯集紀錄/收藏(不倒退寵物)。
//   本機資料屬別的帳號 → 略過（交手動還原，避免混帳號）。每個 session 只跑一次。
let _cloudSyncDone = false;
async function cloudAutoSync() {
  if (_cloudSyncDone) return;
  try {
    if (typeof Supa === "undefined" || !Supa.ready()) return;   // 社群未載入/未設定 → 之後再試
    const c = Supa.client(); const { data: u } = await c.auth.getUser();
    if (!u || !u.user) return;                                   // 未登入 → 不標記完成，登入後會再觸發
    const uid = u.user.id;
    const owner = (() => { try { return localStorage.getItem("tt_data_uid"); } catch (e) { return null; } })();
    if (owner && owner !== uid) { _cloudSyncDone = true; return; }   // 本機是別帳號的資料 → 不自動拉
    const { data, error } = await c.from("backups").select("data, updated_at").eq("user_id", uid).maybeSingle();
    if (error) return;                                           // 查詢失敗 → 不標記，下次再試
    _cloudSyncDone = true;
    const localReal = (Store.getRecords() || []).filter(r => !r.sim).length;
    if (!data || !data.data) {                                   // 雲端還沒備份 → 本機有資料就上傳當種子
      if (localReal > 0) autoCloudBackup();
      return;
    }
    const before = (Store.getRecords() || []).length;
    if (localReal === 0) Store.importAll(data.data, "merge");    // 全新裝置：完整還原
    else Store.cloudMergeRecords(data.data);                     // 已有資料：只安全聯集紀錄
    try { localStorage.setItem("tt_data_uid", uid); localStorage.setItem("tt_last_sync", String(Date.now())); } catch (e) { /* */ }
    const added = (Store.getRecords() || []).length - before;
    try { renderHistory(); render(); initTheme(); renderPet(); renderQuests(); renderBadges(); renderStats(); loadProfile(); renderSyncStatus(); } catch (e) { /* 個別區塊未載入時忽略 */ }
    if (added > 0 && typeof toast === "function") toast(ttT("已從雲端同步紀錄 ☁️"));
    // 本機有雲端沒有的紀錄 → 反向補上傳，讓另一端也拉得到（雙向匯流）
    if (localReal > 0) autoCloudBackup();
  } catch (e) { /* 靜默：同步失敗不影響使用 */ }
}
if (typeof window !== "undefined") {
  window.cloudAutoSync = cloudAutoSync;
  // 開機：社群載完（含持久化 session）後試一次；未登入則等登入流程再觸發
  if (window.loadSocial) window.loadSocial().then(() => setTimeout(cloudAutoSync, 1200));
}
// 節流上傳：收藏／改名／步道完成／寵物進化等「小變動」也自動備份，讓雲端隨時是最新（不只每趟走完）。
// debounce 10 秒把連續變動併成一次，避免狂點收藏就狂上傳。
let _bkTimer = null;
function scheduleCloudBackup() {
  try { if (typeof Supa === "undefined") return; } catch (e) { return; }
  clearTimeout(_bkTimer);
  _bkTimer = setTimeout(() => { try { autoCloudBackup(); } catch (e) { /* */ } }, 10000);
}
if (typeof window !== "undefined") window.scheduleCloudBackup = scheduleCloudBackup;
// 回到前景時再自動拉一次（換裝置/擱著很久再打開就看得到最新），但 5 分鐘內剛同步過就不重拉。
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  let last = 0; try { last = +(localStorage.getItem("tt_last_sync") || 0) || 0; } catch (e) { /* */ }
  if (Date.now() - last < 5 * 60000) return;
  _cloudSyncDone = false;                       // 允許本 session 再拉一次
  setTimeout(cloudAutoSync, 800);
});
// 設定頁「資料備份」區顯示上次同步時間，讓使用者安心（＝雲端是最新的）
function renderSyncStatus() {
  const el = $("#syncStatus"); if (!el) return;
  let last = 0; try { last = +(localStorage.getItem("tt_last_sync") || 0) || 0; } catch (e) { /* */ }
  if (!last) { el.textContent = ""; return; }
  const s = Math.max(1, Math.round((Date.now() - last) / 1000));
  const rel = s < 60 ? ttT("剛剛") : s < 3600 ? Math.floor(s / 60) + " " + ttT("分鐘前")
    : s < 86400 ? Math.floor(s / 3600) + " " + ttT("小時前") : Math.floor(s / 86400) + " " + ttT("天前");
  el.textContent = ttT("上次同步") + "：" + rel;
}
if (typeof window !== "undefined") window.renderSyncStatus = renderSyncStatus;
// 雲端備份/還原：資料安全，任何登入者可用（不鎖 Premium）
const _cbk = $("#btnCloudBackup");
if (_cbk) _cbk.addEventListener("click", () => cloudBackupNow(false));
const _crs = $("#btnCloudRestore");
if (_crs) _crs.addEventListener("click", async () => {
  const x = await cloudClient(); if (!x) return;
  try {
    const { data, error } = await x.c.from("backups").select("data, updated_at").eq("user_id", x.uid).maybeSingle();
    if (error) { toast("還原失敗：" + error.message); return; }
    if (!data) { toast("雲端尚無備份，請先按「雲端備份」"); return; }
    const when = new Date(data.updated_at).toLocaleString(ttLocale());
    const mode = await ttChoice(`雲端備份（${when}）\n要怎麼還原？`, [
      { label: "取消", value: null, cls: "ghost" },
      { label: "完全取代", value: "replace", cls: "ghost" },
      { label: "合併", value: "merge", cls: "primary" },
    ]);
    if (!mode) return;
    Store.importAll(data.data, mode);
    try { localStorage.setItem("tt_data_uid", x.uid); } catch (e) { /* */ }   // 本機資料歸屬＝還原來源帳號
    renderHistory(); render();
    // 主題/外觀與寵物、任務、成就一併還原後重繪
    try { initTheme(); renderPet(); renderQuests(); renderBadges(); renderStats(); loadProfile(); } catch (e) { /* 個別區塊未載入時忽略 */ }
    toast("已從雲端還原 ✓");
  } catch (e) { toast("還原失敗：" + (e && e.message || e)); }
});
// 本機備份檔：匯出 JSON 自己保管（不需登入、不需網路）／匯入還原
const _fbk = $("#btnFileBackup");
if (_fbk) _fbk.addEventListener("click", () => {
  try {
    const blob = new Blob([JSON.stringify(Store.exportAll())], { type: "application/json" });
    saveBlob(blob, `循徑拾光備份_${new Date().toISOString().slice(0, 10)}.json`, "Gather the Trail backup");
    toast("已匯出備份檔，請妥善保存");
  } catch (e) { toast("匯出失敗：" + (e && e.message || e)); }
});
const _frs = $("#btnFileRestore"), _fri = $("#fileRestoreInput");
if (_frs && _fri) {
  _frs.addEventListener("click", () => _fri.click());
  _fri.addEventListener("change", () => {
    const f = _fri.files && _fri.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = async () => {
      try {
        const data = JSON.parse(rd.result);
        if (!data || (!data.records && !data.pet && !data.v)) { toast("這不是有效的備份檔"); return; }
        const mode = await ttChoice("匯入備份檔\n要怎麼還原？", [
          { label: "取消", value: null, cls: "ghost" },
          { label: "完全取代", value: "replace", cls: "ghost" },
          { label: "合併", value: "merge", cls: "primary" },
        ]);
        if (!mode) { _fri.value = ""; return; }
        Store.importAll(data, mode);
        renderHistory(); render();
        try { initTheme(); renderPet(); renderQuests(); renderBadges(); renderStats(); loadProfile(); } catch (e) { /* */ }
        toast("已從備份檔還原 ✓");
      } catch (e) { toast("匯入失敗：檔案可能損壞"); }
      _fri.value = "";
    };
    rd.readAsText(f);
  });
}
if (typeof Premium !== "undefined") { setTimeout(() => Premium.refresh().then(() => { try { applyPalette(); applyProColor(); } catch (e) { /* */ } }), 1500); Premium.handleReturn(); }   // 啟動後同步會員狀態→重套主題配色/徽章色 + 處理結帳返回
if (typeof window !== "undefined") setTimeout(() => { try { if (typeof Reminders !== "undefined") Reminders.syncAll(); } catch (e) { /* */ } }, 3500);   // 開機重排健行提醒（有開才會排）

// 前端錯誤自動上報（phase19）：把 index.html 記到 localStorage 的錯誤批次上傳，
// 開發者才能主動發現問題。已上傳的用時間戳記號避免重複；未登入/未跑 SQL 都靜默略過。
async function reportClientErrors() {
  try {
    if (typeof Supa === "undefined" || !Supa.ready()) return;
    const errs = JSON.parse(localStorage.getItem("tt_errors") || "[]");
    const lastSent = localStorage.getItem("tt_errors_sent") || "";
    const fresh = errs.filter(e => e.t > lastSent).slice(0, 10);
    if (!fresh.length) return;
    const c = Supa.client(); const { data: u } = await c.auth.getUser();
    if (!u || !u.user) return;
    let ver = "";
    try { ver = ((await (await fetch("sw.js")).text()).match(/trail-tracker-(v\d+)/) || [])[1] || ""; } catch (e) { /* 離線 */ }
    const rows = fresh.map(e => ({ user_id: u.user.id, message: e.m, app_ver: ver, ua: navigator.userAgent.slice(0, 200), happened_at: e.t }));
    const { error } = await c.from("client_errors").insert(rows);
    if (!error) localStorage.setItem("tt_errors_sent", fresh[0].t);   // errs 由新到舊，第一筆最新
  } catch (e) { /* 靜默 */ }
}
setTimeout(reportClientErrors, 6000);

// 進階分析：整頁 PRO（與年度回顧一致）
const _aBtn = $("#btnAnalytics");
if (_aBtn) _aBtn.addEventListener("click", () => { if (!_proGate()) return; openAnalytics(); });
// 年度回顧（PRO）
const _yBtn = $("#btnYearReview");
if (_yBtn) _yBtn.addEventListener("click", () => { if (!_proGate()) return; openYearReview(); });
// 離線地圖包：把快取圖磚打包成單一檔案（備份/給另一台裝置匯入，不必重新下載，也不占下載額度）
const _pkBox = $("#packBox");
function _pkMsg(html) { if (_pkBox) { _pkBox.style.display = "block"; _pkBox.innerHTML = html; } }
$("#btnPackExport").addEventListener("click", async () => {
  if (!_proGate()) return;   // PRO 限定
  if (typeof ttBusy === "function" && ttBusy("packexp", 4000)) return;
  const n = await Offline.cachedCount();
  if (!n) { toast("尚未下載任何離線地圖"); return; }
  _pkMsg("打包離線地圖中…");
  try {
    const r = await Offline.exportPack((done, total) => { if (done % 200 === 0) _pkMsg(`打包離線地圖中… ${done}/${total}`); });
    if (!r) { _pkMsg("尚未下載任何離線地圖"); return; }
    const en = (typeof I18n !== "undefined" && I18n.lang() === "en");
    saveBlob(r.blob, (en ? "gather-the-trail-maps" : "循徑拾光離線地圖") + ".ttmap", "Gather the Trail offline maps");
    _pkMsg(`✅ 已匯出離線地圖包（${r.count} 張、${(r.bytes / 1048576).toFixed(1)} MB）`);
  } catch (e) { _pkMsg("匯出失敗，請再試一次"); }
});
$("#btnPackImport").addEventListener("click", () => { if (!_proGate()) return; $("#packFile").click(); });
$("#packFile").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  _pkMsg("匯入離線地圖中…");
  try {
    const n = await Offline.importPack(f, (done, total) => { if (done % 200 === 0) _pkMsg(`匯入離線地圖中… ${done}/${total}`); });
    _pkMsg(`✅ 已匯入 ${n} 張圖磚，離線可用`);
    refreshOfflineStatus();
  } catch (err) { _pkMsg("這不是有效的離線地圖包（.ttmap）"); }
});
$("#btnClearTiles").addEventListener("click", async () => {
  if (await ttConfirm("確定清除已下載的離線地圖？")) {
    await Offline.clear();
    refreshOfflineStatus();
    toast("已清除離線地圖");
  }
});

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
  if (document.querySelector('[data-ov="cmptrails"]')) return;   // 防連點疊層
  const ts = [...compareSet].map(id => TRAILS.find(t => t.id === id)).filter(Boolean);
  if (ts.length < 2) return;
  const row = (label, fn) => `<tr><th>${label}</th>${ts.map(t => `<td>${fn(t)}</td>`).join("")}</tr>`;
  const ov = document.createElement("div");
  ov.className = "pet-modal"; ov.dataset.ov = "cmptrails";
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
// #5 本月摘要：一眼看到本月里程／次數／連續天數／最長單次，日常回訪動機（免費，進階分析仍為 PRO）
// 健行日曆：像月曆一樣的「當月」視圖（日一二三四五六），走過的日子依里程著色、今日圈記；每月自動更新。
function hikeHeatmapHtml() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const byDay = {};
  realRecords().forEach(r => { const dt = new Date(r.date); if (dt.getFullYear() === y && dt.getMonth() === m) { const d = dt.getDate(); byDay[d] = (byDay[d] || 0) + (r.distanceKm || 0); } });
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const startDow = new Date(y, m, 1).getDay();   // 0=週日
  const todayDom = now.getDate();
  const loc = (typeof ttLocale === "function") ? ttLocale() : undefined;
  const wd = [];
  for (let i = 0; i < 7; i++) wd.push(new Intl.DateTimeFormat(loc, { weekday: "narrow" }).format(new Date(2023, 0, 1 + i)));   // 2023-01-01 = 週日
  const title = now.toLocaleDateString(loc, { year: "numeric", month: "long" });
  let active = 0;
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(`<div class="cal-c cal-blank"></div>`);
  for (let d = 1; d <= daysInMonth; d++) {
    const km = byDay[d] || 0;
    const lvl = km <= 0 ? 0 : Math.min(10, Math.ceil(km / 1.5));   // 每 1.5km 一級，共 10 級深淺
    if (km > 0) active++;
    const tip = km > 0 ? ` title="${km.toFixed(1)} km"` : "";
    cells.push(`<div class="cal-c cal-l${lvl}${d === todayDom ? " cal-today" : ""}"${tip}><span>${d}</span></div>`);
  }
  return `<div class="hm-wrap cal-wrap">
    <div class="hm-head"><span class="hm-title">📅 ${title}</span><span class="hm-stat"><b>${active}</b> ${ttT("天")}</span></div>
    <div class="cal-wd">${wd.map(w => `<span>${w}</span>`).join("")}</div>
    <div class="cal-grid">${cells.join("")}</div>
    <div class="cal-leg"><span>${ttT("少")}</span><i class="cal-ramp"></i><span>${ttT("多")}</span></div>
  </div>`;
}
function renderMonthSummary() {
  const box = $("#meMonth"); if (!box) return;
  const recs = realRecords();
  const now = new Date();
  const mo = recs.filter(r => { const d = new Date(r.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const moKm = mo.reduce((s, r) => s + (r.distanceKm || 0), 0);
  const moTrips = mo.length;
  const streak = (typeof daysStreak === "function") ? daysStreak() : 0;
  const longest = recs.reduce((m, r) => Math.max(m, r.distanceKm || 0), 0);
  const moName = now.toLocaleDateString(ttLocale(), { month: "short" });
  const cell = (v, l, hot) => `<div class="mo-cell${hot ? " hot" : ""}"><div class="mo-v">${v}</div><div class="mo-l">${l}</div></div>`;
  box.innerHTML = `<div class="mo-summary">
    <div class="mo-head">${ic("calendar")} <b>${moName}</b> ${ttT("本月摘要")}</div>
    <div class="mo-grid">
      ${cell(moKm.toFixed(1), ttT("本月里程") + " km")}
      ${cell(moTrips, ttT("本月次數"))}
      ${cell(streak >= 1 ? `${streak}` : "0", ttT("連續天數"), streak >= 2)}
      ${cell(longest.toFixed(1), ttT("最長單次") + " km")}
    </div>
    ${recs.length ? hikeHeatmapHtml() : ""}
  </div>`;
}
function renderStats() {
  const box = $("#meStats");
  renderMonthSummary();
  if (!box) return;
  const recs = realRecords();   // 成就統計不計入模擬
  const favs = TRAILS.filter(t => Store.isFav(t.id)).length;
  const doneTrails = new Set(TRAILS.filter(t => Store.trailLog(t.id).done).map(t => t.id)).size;
  // 各欄取「終身統計」與「現存紀錄合計」較大者（舊紀錄被容量保護砍掉也不縮水）
  const lf = (Store.life && Store.life()) || {};
  const km = Math.max(recs.reduce((s, r) => s + (r.distanceKm || 0), 0), lf.km || 0);
  const asc = Math.max(recs.reduce((s, r) => s + (r.ascent || 0), 0), lf.asc || 0);
  const kcal = Math.max(recs.reduce((s, r) => s + (r.kcal || 0), 0), lf.kcal || 0);
  const ms = Math.max(recs.reduce((s, r) => s + (r.elapsedMs || 0), 0), lf.ms || 0);
  const now = new Date(), moKm = recs.filter(r => { const d = new Date(r.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })
    .reduce((s, r) => s + (r.distanceKm || 0), 0);
  const hrs = ms / 3.6e6;
  const cell = (to, pre, dec, l) => `<div class="mstat"><div class="mv" data-to="${to}" data-pre="${pre}" data-dec="${dec}">${pre}0</div><div class="ml">${l}</div></div>`;
  box.innerHTML = `<div class="mstat-grid">
    ${cell(Math.max(recs.length, lf.trips || 0), "", 0, "出行次數")}
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
  // 大數字（含千分位/小數/前綴）會擠爆方框 → 依最終字串長度縮小字級
  const finalLen = fmt(to).length;
  el.classList.toggle("mv-lg", finalLen >= 7 && finalLen < 9);
  el.classList.toggle("mv-xl", finalLen >= 9);
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
        <span class="date">${new Date(r.date).toLocaleString(ttLocale(), { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
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
  wrap.querySelectorAll(".hist-view").forEach(b => b.addEventListener("click", async () => {
    const rec = await Store.fullRecord(b.dataset.id);   // 軌跡被容量保護精簡過就到封存撈完整版
    if (rec) openTrackReview(rec);
  }));
  wrap.querySelectorAll(".hist-gpx").forEach(b => b.addEventListener("click", async () => {
    const rec = await Store.fullRecord(b.dataset.id);
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
// 季節點綴色（春櫻/夏綠/秋楓/冬雪）：沒選 PRO 主題配色時的預設 --accent
function applySeason() {
  const m = new Date().getMonth() + 1;
  const col = m >= 3 && m <= 5 ? "#d2799a" : m >= 6 && m <= 8 ? "#3f8f6a" : m >= 9 && m <= 11 ? "#c2683d" : "#5a86b0";
  document.documentElement.style.setProperty("--accent", col);
}
// PRO 主題配色：一次覆蓋整組品牌色（--brand 家族 + --accent），讓「整個 App」換色而不是只有幾個字變色。
// 實際色值定義在 CSS 的 html[data-palette="X"]（含淺／深色兩版）；這裡只負責存鍵值與切換 data-palette。
const PALETTES = [   // 加上「森綠」預設共 9 個 → 設定頁排成整齊的 3×3
  ["ocean", "海洋", "#1f6390", "#d98a3d"],
  ["teal", "青碧", "#17807a", "#d98a3d"],
  ["twilight", "暮紫", "#6a4fa3", "#d38bb0"],
  ["maple", "楓紅", "#b0492f", "#cc9a3d"],
  ["coral", "珊瑚", "#c85a45", "#3f8f6a"],
  ["amber", "琥珀", "#a67c1e", "#3f8f6a"],
  ["rose", "玫瑰", "#b0426e", "#6b8fc2"],
  ["slate", "石墨", "#45566a", "#c2683d"],
];
function applyPalette() {
  const root = document.documentElement;
  const key = localStorage.getItem("tt_palette");
  const pro = typeof Premium !== "undefined" && Premium.isOn();
  const valid = pro && key && PALETTES.some(p => p[0] === key);
  if (valid) { root.dataset.palette = key; root.style.removeProperty("--accent"); }   // 交給 CSS 整組換色；清掉季節 inline accent 才不會蓋過 palette
  else { delete root.dataset.palette; applySeason(); }
}
if (typeof window !== "undefined") window.applyPalette = applyPalette;
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
      ${ps ? `<div class="me-card-pet">${typeof PET_ART !== "undefined" ? PET_ART.svg((ps.level || 1) - 1) : ps.emoji} ${esc(ps.name)}　·　已走 <b>${ps.km}</b> km</div>` : ""}
    </div>
  </div>`;
}
// 健行提醒開關（只在原生 App 顯示；網頁版沒有本地排程通知外掛）
function renderReminderToggle() {
  const el = $("#reminderWrap"); if (!el) return;
  if (typeof Reminders === "undefined" || !Reminders.available()) { el.innerHTML = ""; return; }
  const isOn = Reminders.on();
  el.innerHTML = `<div class="accent-head" style="margin-top:16px">${ttT("健行提醒")}</div>
    <label class="sim-toggle"><input type="checkbox" id="reminderToggle" ${isOn ? "checked" : ""}> ${ttT("提醒我保持連續天數、每週看足跡回顧")}</label>`;
  const cb = el.querySelector("#reminderToggle");
  if (cb) cb.addEventListener("change", async () => {
    if (cb.checked) { const ok = await Reminders.enable(); cb.checked = ok; if (ok && typeof toast === "function") toast(ttT("已開啟健行提醒")); }
    else { await Reminders.disable(); if (typeof toast === "function") toast(ttT("已關閉健行提醒")); }
  });
}
if (typeof window !== "undefined") window.renderReminderToggle = renderReminderToggle;
function renderPalette() {
  const row = $("#accentRow"); if (!row) return;
  const pro = typeof Premium !== "undefined" && Premium.isOn();
  const cur = localStorage.getItem("tt_palette") || "";
  // 每個色票用「品牌色→點綴色」漸層預覽，暗示選了會整組換色（不是只有一個小圓點）
  const sw = (k, n, b, a) => `<button class="pal-sw${cur === k ? " on" : ""}" data-pal="${k}" title="${n}" style="background:linear-gradient(135deg,${b} 56%,${a})"><span class="pal-nm">${n}</span></button>`;
  row.innerHTML = sw("", ttT("森綠"), "#2c5d3f", "#c2683d")
    + PALETTES.map(p => sw(p[0], ttT(p[1]), p[2], p[3])).join("")
    + (pro ? "" : `<div class="acc-lock">${ttT("升級 Premium 解鎖")}</div>`);
  row.querySelectorAll(".pal-sw").forEach(b => b.addEventListener("click", () => {
    if (!pro) { if (typeof Premium !== "undefined") Premium.openUpgrade(); return; }
    const k = b.dataset.pal;
    if (k) localStorage.setItem("tt_palette", k); else localStorage.removeItem("tt_palette");
    applyPalette(); renderPalette();
    if (typeof toast === "function") toast(ttT("已套用主題配色"));
  }));
}
let _themeBound = false;   // .theme-opt / .fs-opt 是靜態元素：initTheme 在還原備份後會再被呼叫，
                           // 不擋的話每還原一次就多疊一組 click 監聽器
function initTheme() {
  applyPalette();
  applyProColor();
  const mode = localStorage.getItem("tt_theme") === "dark" ? "dark" : "light";   // 預設淺色，只有明確選深色才深色
  applyTheme(mode);
  document.querySelectorAll("[data-theme-opt]").forEach(b => {
    b.classList.toggle("on", b.dataset.themeOpt === mode);
    if (!_themeBound) b.addEventListener("click", () => {
      localStorage.setItem("tt_theme", b.dataset.themeOpt);
      applyTheme(b.dataset.themeOpt);
      document.querySelectorAll("[data-theme-opt]").forEach(x => x.classList.toggle("on", x === b));
    });
  });
  // 字體大小（無障礙）：四檔 1.2/1.35/1.5/1.65 → 設 --fs 倍率，只放大文字不動地圖版面
  // （舊值由 index.html 開機腳本遷移到最近的新檔）
  const curFs = (() => { try { return localStorage.getItem("tt_fontscale") || "1.2"; } catch (e) { return "1.2"; } })();
  document.querySelectorAll(".fs-opt").forEach(b => {
    b.classList.toggle("on", b.dataset.fs === curFs);
    if (!_themeBound) b.addEventListener("click", () => {
      try { localStorage.setItem("tt_fontscale", b.dataset.fs); } catch (e) { /* */ }
      document.documentElement.style.setProperty("--fs", b.dataset.fs);
      document.querySelectorAll(".fs-opt").forEach(x => x.classList.toggle("on", x === b));
    });
  });
  _themeBound = true;   // 之後再呼叫（雲端還原/匯入備份）只更新選中狀態，不再重複綁定
  // 語言清單（設定頁）：搜尋框 + 可捲動清單（國旗＋原名＋英文名），高度上限避免頁面過長
  const curLang = (typeof I18n !== "undefined") ? I18n.lang() : "zh";
  const row = document.getElementById("langRow");
  if (row) {
    const itemHtml = ([c, f, n, sub]) =>
      `<button class="lang-item${c === curLang ? " on" : ""}" data-lang-opt="${c}" data-search="${(n + " " + sub + " " + c).toLowerCase()}">
        <span class="flag">${f}</span><span class="names"><span class="native">${n}</span>${n === sub ? "" : ` <span class="sub">${sub}</span>`}</span><span class="tick">✓</span>
      </button>`;
    row.innerHTML = `<input type="search" class="lang-search" id="langSearch" placeholder="${ttT("搜尋語言")}" autocomplete="off">
      <div class="lang-scroll" id="langScroll">${TT_LANGS.map(itemHtml).join("")}</div>`;
    const bind = b => b.addEventListener("click", () => {
      if (b.dataset.langOpt !== curLang && typeof I18n !== "undefined") I18n.set(b.dataset.langOpt);
    });
    row.querySelectorAll("[data-lang-opt]").forEach(bind);
    const sc = document.getElementById("langScroll"), sr = document.getElementById("langSearch");
    if (sr) sr.addEventListener("input", () => {
      const q = sr.value.trim().toLowerCase();
      sc.querySelectorAll(".lang-item").forEach(b => { b.style.display = (!q || b.dataset.search.includes(q)) ? "" : "none"; });
      // 目前選中的語言捲到最上，方便看見
      const on = sc.querySelector(".lang-item.on"); if (on && !q) sc.scrollTop = Math.max(0, on.offsetTop - 60);
    });
    const on = sc.querySelector(".lang-item.on"); if (on) sc.scrollTop = Math.max(0, on.offsetTop - 60);
  }
}
// 語言清單單一事實來源（設定頁與首次選擇覆蓋層共用）：[代碼, 國旗, 原名, 英文名]
const TT_LANGS = [
  ["zh", "🇹🇼", "繁體中文", "Traditional Chinese"], ["cn", "🇨🇳", "简体中文", "Simplified Chinese"],
  ["en", "🇬🇧", "English", "English"], ["es", "🇪🇸", "Español", "Spanish"],
  ["ja", "🇯🇵", "日本語", "Japanese"], ["ko", "🇰🇷", "한국어", "Korean"],
  ["fr", "🇫🇷", "Français", "French"], ["de", "🇩🇪", "Deutsch", "German"],
  ["pt", "🇧🇷", "Português", "Portuguese"], ["it", "🇮🇹", "Italiano", "Italian"],
  ["ru", "🇷🇺", "Русский", "Russian"], ["th", "🇹🇭", "ไทย", "Thai"],
  ["vi", "🇻🇳", "Tiếng Việt", "Vietnamese"], ["id", "🇮🇩", "Bahasa Indonesia", "Indonesian"],
  ["tl", "🇵🇭", "Filipino", "Filipino"], ["ms", "🇲🇾", "Bahasa Melayu", "Malay"],
  ["nl", "🇳🇱", "Nederlands", "Dutch"], ["pl", "🇵🇱", "Polski", "Polish"],
  ["tr", "🇹🇷", "Türkçe", "Turkish"], ["hi", "🇮🇳", "हिन्दी", "Hindi"],
  ["my", "🇲🇲", "မြန်မာ", "Burmese"], ["km", "🇰🇭", "ខ្មែរ", "Khmer"],
  ["ne", "🇳🇵", "नेपाली", "Nepali"], ["mn", "🇲🇳", "Монгол", "Mongolian"],
  ["uk", "🇺🇦", "Українська", "Ukrainian"],
];
if (typeof window !== "undefined") window.TT_LANGS = TT_LANGS;

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
// 資料自動救援：localStorage 紀錄被清空（iOS 清快取/儲存）但 IndexedDB 封存還在 → 回填
(async () => {
  try {
    if (typeof Store === "undefined" || !Store.recoverFromArchive) return;
    const n = await Store.recoverFromArchive();
    if (n > 0) {
      try { renderHistory(); render(); renderStats && renderStats(); } catch (e) { /* */ }
      if (typeof toast === "function") toast(`已從本機封存救回 ${n} 筆行程紀錄`);
    }
  } catch (e) { /* */ }
})();
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
// 深連結路由：?trail=id → 開該步道；?post=id → 開該貼文。網頁靠 location.search；原生 App 靠
// Capacitor App 的 appUrlOpen（Universal Link / App Link / 自訂 scheme 進來的網址都走這裡）。
function routeDeepLink(search) {
  try {
    const q = new URLSearchParams(search || "");
    const id = q.get("trail");
    if (id && typeof TRAILS !== "undefined" && TRAILS.some(t => t.id === id)) { setTimeout(() => openDetail(id), 200); return; }
    const post = q.get("post");
    if (post) {
      const go = () => { const b = document.querySelector('.tab[data-view="social"]'); if (b) b.click(); setTimeout(() => { if (typeof PostView !== "undefined") PostView.open(post); }, 500); };
      if (typeof SocialUI !== "undefined") go(); else if (window.loadSocial) window.loadSocial().then(go);
    }
  } catch (e) { /* */ }
}
routeDeepLink(location.search);   // 開機網址參數（網頁分享／PWA）
if (typeof window !== "undefined") window.routeDeepLink = routeDeepLink;
// 原生：App 在前景/背景被深連結喚醒 → 解析網址參數路由（需搭配 iOS Associated Domains / Android App Links，見 docs/deep-links.md）
(function () {
  try {
    const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (App && App.addListener) App.addListener("appUrlOpen", d => { try { if (d && d.url) routeDeepLink(new URL(d.url).search); } catch (e) { /* */ } });
  } catch (e) { /* */ }
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
    resetFeed() { ls.removeItem("tt_pet_fed_t"); refresh(); return "可再餵食"; },   // 冷卻 key 是 tt_pet_fed_t（原本刪錯 key 所以沒用）
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
    clearHikes() { const kept = Store.getRecords().filter(r => !r.dbg); Store.setRecords(kept); refresh(); return "已清除測試行程"; },
    // 一鍵解鎖全部成就：灌入足以滿足成就樹全部 30 個徽章的測試資料
    unlockAch() {
      const recs = [];
      for (let i = 0; i < 200; i++) {                       // 200 筆連續天 → 出行次數(至200)/連續天數(至30)/週數
        const d = new Date(); d.setDate(d.getDate() - i);
        if (i === 1) d.setHours(6, 0, 0, 0);                // 清晨 → 早起鳥
        else if (i === 2) d.setHours(20, 0, 0, 0);          // 夜間 → 夜行者
        else d.setHours(12, 0, 0, 0);
        const km = i === 0 ? 42 : 6;                        // 一筆 42km → 超馬/半馬/馬拉松；總里程 ≈ 1236km → 千里健行
        recs.push({
          id: "dbg-ach-" + i, date: d.toISOString(), dbg: true, note: "成就測試",
          distanceKm: km, distance3DKm: km, steps: Math.round(km * 1350), kcal: Math.round(km * 60),
          elapsedMs: Math.round(km * 12 * 60000), ascent: 60, descent: 50,   // 總爬升 200*60=12000m → 萬米爬升/聖母峰
          track: [{ lat: 24, lon: 121, t: d.getTime() }],
        });
      }
      const kept = Store.getRecords().filter(r => !String(r.id).startsWith("dbg-ach-"));
      Store.setRecords(recs.concat(kept));
      // 縣市探索：每個縣市各挑一條完成 → counties 拉到 20+（環島達人）
      const all = (typeof TRAILS !== "undefined" ? TRAILS : []);
      const byRegion = {};
      for (const t of all) { if (t.region && !byRegion[t.region]) byRegion[t.region] = t.id; }
      Object.values(byRegion).forEach(id => Store.setTrailLog(id, { done: true }));
      // 難度征服：完成 6 條挑戰級以上（difficulty≥4）→ 挑戰征服
      all.filter(t => (t.difficulty || 0) >= 4).slice(0, 6).forEach(t => Store.setTrailLog(t.id, { done: true }));
      // 補足完成 20 條（步道收藏家）：不足就再補一般步道
      let doneN = all.filter(t => Store.trailLog(t.id).done).length;
      for (const t of all) { if (doneN >= 22) break; if (!Store.trailLog(t.id).done) { Store.setTrailLog(t.id, { done: true }); doneN++; } }
      checkPetEvolve(); refresh(); try { renderBadges(); } catch (e) { /* */ }
      return "已解鎖全部成就 🏅";
    },
    // 重置成就：清掉解鎖用的測試行程/完成紀錄，並清空永久解鎖名單(tt_badges_got)→ 徽章真的會重新上鎖
    resetAch() {
      const kept = Store.getRecords().filter(r => !String(r.id).startsWith("dbg-ach-"));
      Store.setRecords(kept);
      localStorage.removeItem("tt_log");
      localStorage.removeItem("tt_badges_got");   // 關鍵：不清這個，永久解鎖名單會讓徽章一直亮著
      checkPetEvolve(); refresh(); try { renderBadges(); } catch (e) { /* */ }
      return "已重置成就（完成/測試行程/永久解鎖名單已清空）";
    },
    // 重置每日任務：清掉今日領獎旗標 + 移除今天的行程，讓三項任務進度歸零可重測
    resetQuests() {
      localStorage.removeItem("tt_quest_claim");
      const ds = todayStr();
      const kept = Store.getRecords().filter(r => (r.date || "").slice(0, 10) !== ds);
      Store.setRecords(kept);
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
const TT_OWNER_EMAIL = "gatherthetrail@gmail.com";
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
    ["🗑清所有行程", async () => { if (await ttConfirm("清空全部行程記錄？")) ttDebug.clearAllRecords(); }],
    ["重置🥚", () => ttDebug.resetPet()],
    ["🌐重看語言選擇", () => { try { localStorage.removeItem("tt_lang"); localStorage.removeItem("tt_onboarded_v2"); } catch (e) { /* */ } const dp = document.getElementById("debugPanel"); if (dp) dp.remove(); langGate(true); }],
    ["🧭導覽(中)", () => { try { localStorage.removeItem("tt_onboarded_v2"); localStorage.removeItem("tt_tour_resume"); } catch (e) { /* */ } const dp = document.getElementById("debugPanel"); if (dp) dp.remove(); onboarding(true, { previewLang: "zh", startAt: 0 }); }],
    ["🧭導覽(英)", () => { try { localStorage.removeItem("tt_onboarded_v2"); localStorage.removeItem("tt_tour_resume"); } catch (e) { /* */ } const dp = document.getElementById("debugPanel"); if (dp) dp.remove(); onboarding(true, { previewLang: "en", startAt: 0 }); }],
    ["🧭重設情境導覽", () => { try { ["tt_coach_trail", "tt_coach_team", "tt_coach_record", "tt_coach_soc_friends", "tt_coach_soc_explore", "tt_coach_soc_search", "tt_coach_soc_notif", "tt_coach_soc_me"].forEach(k => localStorage.removeItem(k)); } catch (e) { /* */ } const dp = document.getElementById("debugPanel"); if (dp) dp.remove(); toast("情境導覽已重設：重新打開步道／小隊／記錄／社群各頁就會再出現"); }],
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

// 首次進 App 先問語言（新用戶：尚未選語言且未看過導覽）。每語言用自身名稱顯示，選完 set() 會重載。
// 具名函式：DEBUG 面板可重新呼叫預覽。force=true 略過「已選過」判斷。
function langGate(force) {
  if (document.querySelector(".lang-gate")) return;
  const chosen = (() => { try { return localStorage.getItem("tt_lang"); } catch (e) { return null; } })();
  const onboarded = (() => { try { return localStorage.getItem("tt_onboarded_v2"); } catch (e) { return null; } })();
  if (!force && (chosen || onboarded || new URLSearchParams(location.search).get("trail"))) return;
  const ov = document.createElement("div");
  ov.className = "lang-gate";
  ov.innerHTML = `<div class="lang-gate-card">
    <div class="lang-gate-head">
      <div class="lang-gate-mark">🌐</div>
      <h2>選擇語言 · Language</h2>
      <p>循徑拾光 · Gather the Trail</p>
    </div>
    <div class="lg-fs-label">字體大小 · Text size</div>
    <div class="lg-fs" id="lgFs" aria-label="Text size">
      <button class="lg-fs-opt" data-fs="1.2" aria-label="A"><span style="font-size:15px">A</span></button>
      <button class="lg-fs-opt" data-fs="1.35" aria-label="A"><span style="font-size:19px">A</span></button>
      <button class="lg-fs-opt" data-fs="1.5" aria-label="A"><span style="font-size:24px">A</span></button>
      <button class="lg-fs-opt" data-fs="1.65" aria-label="A"><span style="font-size:29px">A</span></button>
    </div>
    <input type="search" class="lang-search" id="lgSearch" placeholder="Search · 搜尋" autocomplete="off">
    <div class="lang-list" id="lgList">${TT_LANGS.map(([c, f, n, sub]) =>
      `<button class="lang-item" data-lg="${c}" data-search="${(n + " " + sub + " " + c).toLowerCase()}"><span class="flag">${f}</span><span class="names"><span class="native">${n}</span>${n === sub ? "" : ` <span class="sub">${sub}</span>`}</span></button>`).join("")}</div>
  </div>`;
  // 字體大小：第一眼就能調，選了立刻套用（langGate 的字也跟著放大，年長者馬上有回饋）
  const curFs = (() => { try { return localStorage.getItem("tt_fontscale") || "1.2"; } catch (e) { return "1.2"; } })();
  ov.querySelectorAll(".lg-fs-opt").forEach(b => {
    b.classList.toggle("on", b.dataset.fs === curFs);
    b.addEventListener("click", () => {
      try { localStorage.setItem("tt_fontscale", b.dataset.fs); } catch (e) { /* */ }
      document.documentElement.style.setProperty("--fs", b.dataset.fs);
      ov.querySelectorAll(".lg-fs-opt").forEach(x => x.classList.toggle("on", x === b));
    });
  });
  const lgs = ov.querySelector("#lgSearch");
  if (lgs) lgs.addEventListener("input", () => {
    const q = lgs.value.trim().toLowerCase();
    ov.querySelectorAll("#lgList .lang-item").forEach(b => { b.style.display = (!q || b.dataset.search.includes(q)) ? "" : "none"; });
  });
  ov.querySelectorAll("[data-lg]").forEach(b => b.addEventListener("click", () => {
    const code = b.dataset.lg;
    try {
      if (code === "zh") { localStorage.setItem("tt_lang", "zh"); ov.remove(); onboarding(); }  // 中文＝原文，不需重載
      else if (typeof I18n !== "undefined") I18n.set(code);   // 其他語言：set() 存 tt_lang 後重載，導覽即以該語言顯示
    } catch (e) { ov.remove(); onboarding(); }
  }));
  document.body.appendChild(ov);
}
langGate();

// #22 首次使用導覽：聚光燈式，真的帶使用者點過每個分頁、在真的按鈕上跳說明（為年長者設計）。
// 先引導社群登入（可略過），再逐頁介紹。長句 >40 字會跳過 i18n 檢查（比照舊導覽）。
function onboarding(force, opts) {
  opts = opts || {};
  const KEY = "tt_onboarded_v2", RESUME = "tt_tour_resume";
  if (!force && (localStorage.getItem(KEY) || new URLSearchParams(location.search).get("trail"))) return;
  if (!localStorage.getItem("tt_lang")) return;   // 尚未選語言 → 等語言選擇覆蓋層先處理
  if (document.querySelector(".tour")) return;     // 防重複開

  // 翻譯：預設 ttT（中文回原文、其他語言翻）；DEBUG 中/英預覽用 previewLang 直接查該語言字典（不必切語言重載）
  const previewLang = opts.previewLang;
  let T;
  if (previewLang === "zh") T = s => s;
  else if (previewLang && typeof I18n !== "undefined" && I18n.tables) { const D = (I18n.tables()[previewLang] || {}).D || {}; T = s => D[s] || s; }
  else T = (typeof ttT === "function") ? ttT : (s => s);
  const steps = [
    { center: true, e: "⛰️", h: "歡迎來到循徑拾光", p: "第一次來嗎？我帶你走一遍 👋" },
    { view: "social", sel: ".social-auth", e: "👥", h: "先登入吧（可略過）",
      p: "登入可以雲端備份紀錄、和山友交流。要登入按「去登入」，或按「先略過」。", login: true },
    { view: "explore", sel: "#searchInput", e: "🔍", h: "搜尋步道",
      p: "打步道名、地區或主題，找你想走的路線。" },
    { view: "explore", sel: ".toolbar .seg, .toolbar", e: "🗺️", h: "清單或地圖",
      p: "切換用清單或地圖看步道，上面還有精選主題輯。" },
    { view: "explore", sel: "#trailList .card", e: "📄", h: "點開步道看資訊",
      p: "點任一步道卡片，裡面有難度、路況、天氣、海拔、生態、周邊景點美食。" },
    { view: "record", sel: "#btnStart", e: "📍", h: "記錄健行",
      p: "出發時按「開始」，記錄里程、爬升，鎖螢幕、沒訊號也能記。" },
    { view: "pet", sel: "#petCard", e: "🐉", h: "山林夥伴",
      p: "走路就能養夥伴！從一顆蛋開始，越走牠長越快。" },
    { view: "pet", sel: "#petFeed", e: "🍎", h: "餵食與果實",
      p: "每天餵夥伴補活力；走路和每日任務會賺果實，還能到「好友的夥伴」送果實給山友。" },
    { view: "pet", sel: "#petBadges .section-title", e: "🏅", h: "成就系統",
      p: "成就樹：里程、爬升、連續天數等達標就解鎖徽章，永久保留。" },
    { view: "me", sel: "#meMonth", e: "📅", h: "健行日曆",
      p: "看你本月的里程、連續天數與健行日曆。" },
    { view: "me", sel: "#meStats", e: "📊", h: "我的足跡",
      p: "這裡看你的里程、爬升、完成步道等統計。" },
    { view: "me", sel: ".set-zone-title", e: "⚙️", h: "設定",
      p: "設定都在這：會員、外觀（字體大小／主題）、語言、個人檔案、資料備份、離線地圖。" },
    { center: true, e: "🎉", h: "開始探索吧！", p: "祝你在山林裡玩得開心 🏔️", last: true },
  ].map(s => ({ ...s, h: T(s.h), p: T(s.p) }));

  // 起始步：opts.startAt（登入後續播）或續播旗標；否則從頭
  let i = opts.startAt != null ? opts.startAt : (+(localStorage.getItem(RESUME) || 0) || 0);
  try { localStorage.removeItem(RESUME); } catch (e) { /* 續播點已消費 */ }
  if (i < 0 || i >= steps.length) i = 0;   // 越界保護（步數改動時）
  const ov = document.createElement("div"); ov.className = "tour";
  const spot = document.createElement("div"); spot.className = "tour-spot";
  const tip = document.createElement("div"); tip.className = "tour-tip";
  ov.appendChild(spot); ov.appendChild(tip);
  document.body.appendChild(ov);

  const done = () => { try { localStorage.setItem(KEY, "1"); localStorage.removeItem(RESUME); } catch (e) { /* */ } ov.remove(); };
  // 登入後續播：記住下一步、移除導覽讓使用者登入；同頁登入(Email 驗證碼)偵測到就續播，Google 重載則靠開機續播
  function isSignedIn() {
    try { const c = (typeof Supa !== "undefined" && Supa.ready && Supa.ready()) ? Supa.client() : null; if (!c) return Promise.resolve(false); return c.auth.getSession().then(({ data }) => !!(data && data.session && data.session.user)).catch(() => false); }
    catch (e) { return Promise.resolve(false); }
  }
  function loginThenResume() {
    const step = i + 1;
    try { localStorage.setItem(RESUME, String(step)); } catch (e) { /* */ }
    ov.remove();   // 讓出畫面給登入表單（已在社群分頁）
    let n = 0;
    const iv = setInterval(async () => {
      if (document.querySelector(".tour") || ++n > 120) { clearInterval(iv); return; }   // 已由別處續播 / ~3 分放棄（靠開機續播兜底）
      if (await isSignedIn()) { clearInterval(iv); onboarding(true, { startAt: step, previewLang }); }
    }, 1500);
  }
  const findTarget = sel => {
    for (const s of (sel || "").split(",")) { const el = document.querySelector(s.trim()); if (el && el.offsetParent !== null) return el; }
    return null;
  };
  // 定位聚光燈＋說明框。r=目標矩形；r=null → 整螢幕均勻變暗、說明置中（找不到目標或抓到整頁容器時）。
  function place(r) {
    if (!r) { spot.style.width = spot.style.height = "0px"; spot.style.top = "50%"; spot.style.left = "50%"; }
    else {
      const pad = 8;
      spot.style.top = (r.top - pad) + "px"; spot.style.left = (r.left - pad) + "px";
      spot.style.width = (r.width + pad * 2) + "px"; spot.style.height = (r.height + pad * 2) + "px";
    }
    // 說明框貼螢幕邊緣（非目標旁）：大字體也不超出、按鈕永遠可點。上半目標→框貼下緣，下半→貼上緣。
    tip.classList.toggle("center", !r); tip.style.top = tip.style.bottom = "";
    if (r) {
      if (r.top + r.height / 2 < window.innerHeight * 0.5) tip.style.bottom = "calc(24px + var(--safe-b, 0px))";
      else tip.style.top = "84px";
    }
  }
  function renderTip(st) {
    const dots = steps.map((_, k) => `<span class="${k === i ? "on" : ""}"></span>`).join("");
    const btns = st.login
      ? `<button class="btn primary" id="tourLogin">${T("去登入")}</button><button class="info-link" id="tourNext" style="display:block;margin:10px auto 0">${T("先略過，繼續介紹")}</button>`
      : `<button class="btn primary" id="tourNext">${st.last ? T("開始探索") : T("下一步")}</button>`;
    const skipAll = st.last ? "" : `<button class="info-link tour-skipall" id="tourSkipAll">${T("跳過導覽")}</button>`;   // 明確的「跳過整個導覽」
    tip.innerHTML = `${st.last ? "" : `<button class="tour-skip" id="tourSkip" aria-label="${T("跳過導覽")}">✕</button>`}`
      + `<div class="tour-emoji">${st.e}</div><h3>${st.h}</h3><p>${st.p}</p>`
      + `<div class="tour-dots">${dots}</div>${btns}${skipAll}`;
    const nx = tip.querySelector("#tourNext"); if (nx) nx.addEventListener("click", () => { if (st.last) done(); else { i++; show(); } });
    const sk = tip.querySelector("#tourSkip"); if (sk) sk.addEventListener("click", done);
    const sa = tip.querySelector("#tourSkipAll"); if (sa) sa.addEventListener("click", done);
    const lg = tip.querySelector("#tourLogin"); if (lg) lg.addEventListener("click", loginThenResume);   // 登入完成後續播
  }
  async function show() {
    const st = steps[i];
    renderTip(st);                                   // 先把內容畫出來（切分頁/等目標時也看得到）
    place(null);                                      // 先置中（避免等目標時殘留上一步的聚光燈位置）
    if (st.view) { const tb = document.querySelector(`.tab[data-view="${st.view}"]`); if (tb && !tb.classList.contains("active")) tb.click(); }
    let target = null;
    if (st.sel && !st.center) {                      // 等目標出現（社群/寵物非同步渲染），最多等 ~2 秒
      for (let k = 0; k < 16 && !target; k++) { target = findTarget(st.sel); if (!target) await new Promise(r => setTimeout(r, 130)); }
    }
    let r = null;
    if (target) {
      try { target.scrollIntoView({ block: "center" }); } catch (e) { /* */ }
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));   // 等捲動＋版面穩定再量，框才準
      if (steps[i] !== st) return;                   // 使用者已前進 → 別覆蓋新步驟
      const rr = target.getBoundingClientRect();
      const huge = rr.width > window.innerWidth * 0.92 && rr.height > window.innerHeight * 0.8;   // 抓到整頁容器 → 不框
      if (!huge && rr.width > 4 && rr.height > 4) r = rr;
    }
    place(r);
  }
  show();
}
// 已選過語言的用戶（含重載回來的）：直接跑導覽；新用戶則由 langGate 選完語言後再觸發
onboarding();

// 情境式導覽：在「當前畫面」逐一聚光介紹某功能，各有 flag，看過一次就不再跳。與主導覽 onboarding 共用 .tour CSS。
// steps: [{sel,e,h,p,center}]；opts:{scope}（限定在某容器內找目標，如詳情 sheet／小隊浮層）。長句 p 已全數翻進字典。
window.ttCoach = function (flag, rawSteps, opts) {
  opts = opts || {};
  try { if (flag && localStorage.getItem(flag)) return; } catch (e) { return; }
  if (!localStorage.getItem("tt_lang")) return;      // 還沒選語言 → 等語言選擇覆蓋層
  if (document.querySelector(".tour, .ttdlg-ov")) return;   // 主導覽/情境導覽/對話框(如權限說明卡)進行中 → 讓路（flag 不設，下次再跳）
  const T = (typeof ttT === "function") ? ttT : (s => s);
  const steps = (rawSteps || []).filter(Boolean).map(s => ({ ...s, h: T(s.h), p: T(s.p) }));
  if (!steps.length) return;
  steps[steps.length - 1].last = true;                 // 最後一步收尾
  let i = 0;
  const root = () => (opts.scope ? document.querySelector(opts.scope) : null) || document;
  const ov = document.createElement("div"); ov.className = "tour";
  const spot = document.createElement("div"); spot.className = "tour-spot";
  const tip = document.createElement("div"); tip.className = "tour-tip";
  ov.appendChild(spot); ov.appendChild(tip); document.body.appendChild(ov);
  const done = () => { try { if (flag) localStorage.setItem(flag, "1"); } catch (e) { /* */ } ov.remove(); };
  const findTarget = sel => {
    const r = root();
    for (const s of (sel || "").split(",")) { const el = r.querySelector(s.trim()); if (el && el.offsetParent !== null) return el; }
    return null;
  };
  function place(rr) {
    if (!rr) { spot.style.width = spot.style.height = "0px"; spot.style.top = "50%"; spot.style.left = "50%"; }
    else {
      const pad = 8;
      spot.style.top = (rr.top - pad) + "px"; spot.style.left = (rr.left - pad) + "px";
      spot.style.width = (rr.width + pad * 2) + "px"; spot.style.height = (rr.height + pad * 2) + "px";
    }
    tip.classList.toggle("center", !rr); tip.style.top = tip.style.bottom = "";
    if (rr) {
      if (rr.top + rr.height / 2 < window.innerHeight * 0.5) tip.style.bottom = "calc(24px + var(--safe-b, 0px))";
      else tip.style.top = "84px";
    }
  }
  function renderTip(st) {
    const dots = steps.map((_, k) => `<span class="${k === i ? "on" : ""}"></span>`).join("");
    const skipAll = st.last ? "" : `<button class="info-link tour-skipall" id="tourSkipAll">${T("跳過導覽")}</button>`;
    tip.innerHTML = `${st.last ? "" : `<button class="tour-skip" id="tourSkip" aria-label="${T("跳過導覽")}">✕</button>`}`
      + `<div class="tour-emoji">${st.e}</div><h3>${st.h}</h3><p>${st.p}</p>`
      + `<div class="tour-dots">${dots}</div><button class="btn primary" id="tourNext">${st.last ? T("知道了") : T("下一步")}</button>${skipAll}`;
    const nx = tip.querySelector("#tourNext"); if (nx) nx.addEventListener("click", () => { if (st.last) done(); else { i++; show(); } });
    const sk = tip.querySelector("#tourSkip"); if (sk) sk.addEventListener("click", done);
    const sa = tip.querySelector("#tourSkipAll"); if (sa) sa.addEventListener("click", done);
  }
  async function show() {
    const st = steps[i];
    renderTip(st); place(null);
    if (st.pre) { try { st.pre(); } catch (e) { /* 切分頁等前置動作失敗不擋導覽 */ } await new Promise(r => setTimeout(r, 200)); }   // 目標在隱藏分頁 → 先切過去
    let target = null;
    if (st.sel && !st.center) { for (let k = 0; k < 16 && !target; k++) { target = findTarget(st.sel); if (!target) await new Promise(r => setTimeout(r, 130)); } }
    let r = null;
    if (target) {
      try { target.scrollIntoView({ block: "center" }); } catch (e) { /* */ }
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      if (steps[i] !== st) return;
      const rr = target.getBoundingClientRect();
      const huge = rr.width > window.innerWidth * 0.92 && rr.height > window.innerHeight * 0.8;
      if (!huge && rr.width > 4 && rr.height > 4) r = rr;
    }
    place(r);
  }
  show();
};

// 首次點開步道詳情：帶著切分頁介紹各區（天氣/海拔/離線在「路線」、生態在「生態」、分享/記錄在「概覽」）。
// 目標區塊分散在隱藏分頁 → 每步用 pre 先切到該分頁，聚光燈才框得到（改版分頁化後必要）。
window.ttCoachTrail = function (hasGeo) {
  if (!document.querySelector("#detailSheet.show")) return;
  const tab = code => () => { const b = document.querySelector(`#detailNav button[data-tab="${code}"]`); if (b) b.click(); };
  window.ttCoach("tt_coach_trail", [
    { sel: "#detailNav", e: "📑", h: "步道資訊", p: "上面這排分頁可切換不同步道資訊。", pre: tab("ov") },
    { sel: "#weatherBox", e: "🌦️", h: "天氣", p: "顯示步道所在地的即時天氣與未來預報，出發前先看一下。", pre: tab("rt") },
    hasGeo ? { sel: "#profileBox", e: "⛰️", h: "海拔剖面", p: "沿路的高度變化圖，幫你評估上坡有多硬、要爬多高。", pre: tab("rt") } : null,
    { sel: "#btnOffline", e: "⬇️", h: "離線地圖", p: "山區常常沒有訊號，先在這裡把地圖下載起來就不怕迷路。", pre: tab("rt") },
    { sel: "#ecoBox", e: "🦋", h: "生態", p: "這條步道常見的動植物，還能查 iNaturalist 附近的真實目擊。", pre: tab("ec") },
    { sel: ".link-row", e: "🔗", h: "分享", p: "分享步道、揪團出遊、加入比較、開啟導航，都在這一排。", pre: tab("ov") },
    { sel: "#btnGoRecord", e: "📍", h: "記錄健行", p: "準備好了嗎？從這條步道直接開始記錄你的足跡吧！", pre: tab("ov") },
  ], { scope: "#detailSheet" });
};

// 首次開啟小隊浮層：介紹小隊用途、建立、加入碼、與小隊同行。
window.ttCoachTeam = function (hasActive) {
  if (!document.querySelector('[data-ov="team"]')) return;
  window.ttCoach("tt_coach_team", [
    { center: true, e: "👥", h: "小隊", p: "和山友組隊，在記錄地圖上即時看到彼此的位置，一起安全同行。" },
    { sel: "#tmCreate", e: "➕", h: "建立小隊", p: "取個隊名按「建立」，系統會給你一組加入碼，分享給隊友。" },
    { sel: "#tmJoin, #tmCode", e: "🔑", h: "用加入碼加入", p: "拿到隊友的加入碼？輸入後按「加入」，就成為小隊的一員。" },
    hasActive ? { sel: ".team-live", e: "📍", h: "與小隊同行", p: "打開後，隊員在記錄頁的地圖上就能看到彼此的即時定位。" } : null,
  ], { scope: '[data-ov="team"]' });
};

// 登入後首次點開各社群分頁：一頁一張小卡介紹該頁用途。
window.ttCoachSocial = function (sub) {
  if (document.body.dataset.view !== "social") return;
  const M = {
    friends: { flag: "tt_coach_soc_friends", e: "📰", h: "動態", p: "看你追蹤的山友發的貼文，可以按讚、留言，或收藏他們的路線。" },
    explore: { flag: "tt_coach_soc_explore", e: "🧭", h: "探索", p: "探索其他山友公開的健行足跡與旅程，替下次出遊找靈感。" },
    search: { flag: "tt_coach_soc_search", e: "🔍", h: "搜尋山友", p: "用名稱或 @帳號找到山友，追蹤他們就能在動態看到更新。" },
    notif: { flag: "tt_coach_soc_notif", e: "🔔", h: "通知", p: "有人按讚、留言、追蹤你，或小隊邀請，都會出現在這裡。" },
    me: { flag: "tt_coach_soc_me", e: "👤", h: "我的檔案", p: "你的個人檔案、發過的貼文和追蹤名單，也能在這裡編輯資料。" },
  };
  const c = M[sub]; if (!c) return;
  window.ttCoach(c.flag, [{ center: true, e: c.e, h: c.h, p: c.p }], {});
};

// 首次進記錄頁（閒置）：介紹即時軌跡地圖與開始鈕。
window.ttCoachRecord = function () {
  if (document.body.dataset.view !== "record") return;
  window.ttCoach("tt_coach_record", [
    { sel: "#recMap", e: "🗺️", h: "記錄地圖", p: "開始後，地圖會即時畫出你走過的軌跡，鎖螢幕、沒訊號也照記。" },
    { sel: "#btnStart", e: "▶️", h: "記錄健行", p: "出發時按「開始」，結束按「結束」就會存成一筆健行紀錄。" },
  ], {});
};

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
