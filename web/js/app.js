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
// 通用：動態載入 script（首屏拆載用；重複呼叫共用同一 Promise、已載入直接 resolve）
const _loadedScripts = {};
function ensureScript(src) {
  if (_loadedScripts[src]) return _loadedScripts[src];
  _loadedScripts[src] = new Promise(resolve => {
    const s = document.createElement("script"); s.src = src;
    s.onload = () => resolve(true); s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return _loadedScripts[src];
}
// canvas 圓角矩形（年度回顧圖卡＋成就分享圖卡共用；放常駐檔避免被延遲載入的 analytics 綁住）
function roundRect(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
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
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10.5 5-3v9l-5-3"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="m9.5 4.5 2.5 2 2.5-2M9.5 19.5l2.5-2 2.5 2"/>',
  cloudsun: '<path d="M12 3.5V5M5.8 6.3l1 1M3.5 12H5"/><path d="M8.6 11.3a3.6 3.6 0 0 1 6.7-1.9"/><path d="M8 19.5h9.5a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6 1.6A2.8 2.8 0 0 0 8 19.5Z"/>',
  fog: '<path d="M5 8h14M3 12h18M6 16h12M8 20h8"/>',
  storm: '<path d="M7 15a4 4 0 0 1 .4-8 5 5 0 0 1 9.6 1.6 3.4 3.4 0 0 1 .5 6.4"/><path d="m12.5 12-2.5 4.5h4L11.5 21"/>',
  bird: '<path d="M3 13c3.5.5 6-1 7.5-4.5C11.7 5.6 13.6 4 16 4a3 3 0 0 1 3 3l2 1.2-2 .8c0 5.6-4 9.5-9.5 9.5H6"/><path d="M10 18v3M13.5 17.5l1 3"/><circle cx="16" cy="7" r=".6" fill="currentColor"/>',
  bug: '<ellipse cx="12" cy="14" rx="4.5" ry="6"/><path d="M12 8V4.5M9.5 4 12 5.8 14.5 4M7.5 11.5H4M7.6 15.5H4.5M16.5 11.5H20M16.4 15.5h3.1M12 10v10"/>',
  frog: '<path d="M4 15.5c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5-3.6 4.5-8 4.5-8-.5-8-4.5Z"/><circle cx="8.5" cy="8.5" r="2.2"/><circle cx="15.5" cy="8.5" r="2.2"/><path d="M9 15.5c1.7 1 4.3 1 6 0"/>',
  parking: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M10 17V7.5h3.2a2.7 2.7 0 0 1 0 5.4H10"/>',
  toilet: '<circle cx="7.5" cy="5" r="1.7"/><circle cx="16.5" cy="5" r="1.7"/><path d="M5.5 9h4v5.5H8.6V20H6.4v-5.5h-.9ZM16.5 9l2.8 6.5h-1.8V20h-2v-4.5h-1.8Z"/><path d="M12 3v18"/>',
  store: '<path d="M4 9 5.5 4h13L20 9"/><path d="M4 9h16v1.5a2.7 2.7 0 0 1-5.3 0 2.7 2.7 0 0 1-5.4 0 2.7 2.7 0 0 1-5.3 0Z"/><path d="M5.5 12.5V20h13v-7.5M10 20v-4.5h4V20"/>',
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
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  backpack: '<path d="M7 8a5 5 0 0 1 10 0v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8Z"/><path d="M10 3.5h4M9 13h6v4H9z"/>',
  sunset: '<path d="M4 18h16M7 14a5 5 0 0 1 10 0"/><path d="M12 4v4m-6.4.6 2 2m10.8-2-2 2M3 14h2m14 0h2"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8 8 0 1 0 11 11Z"/>',
  phone: '<path d="M5 3.5h3.2l1.6 4.3-2.1 1.5a11 11 0 0 0 7 7l1.5-2.1 4.3 1.6V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.1 1.5 1.5 0 0 1 5 3.5Z"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6 1.3A3.5 3.5 0 0 1 17 18H7Z"/>',
  rain: '<path d="M7 14a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6 1.3A3.5 3.5 0 0 1 17 14H7Z"/><path d="m9 17-1 3m5-3-1 3m5-3-1 3"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  drop: '<path d="M12 3.5c-4 5.6-5.5 8.6-5.5 11a5.5 5.5 0 0 0 11 0c0-2.4-1.5-5.4-5.5-11Z"/>',
  wave: '<path d="M2 9c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/>',
  tree: '<path d="M12 3 6 11h3l-4 6h14l-4-6h3L12 3Z"/><path d="M12 17v4"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6ZM12 14c0-3-2.4-5-6-5 0 3 2.4 5 6 5Z"/>',
  lake: '<path d="M3 16c3 2 6 2 9 0s6-2 9 0"/><path d="m5 12 4-6 3 4 2-2 5 4"/>',
  gate: '<path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
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
// 收藏星星：SVG（原本是 ☆／★ 文字，換字型就跑位）；填色由 .fav-star.on 控制
const STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z"/></svg>';
// 空狀態手繪山林插圖
const EMPTY_ART = `<svg class="empty-art" viewBox="0 0 140 96" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="108" cy="22" r="9" fill="var(--accent-soft, #f1e3cf)" stroke="var(--accent, #c2683d)" stroke-width="2"/>
  <path d="M6 80 42 30l18 22 16-20 34 48" stroke="var(--brand-mid, #3f7a55)" stroke-width="2.4"/>
  <path d="M36 38l6-8 6 8" stroke="var(--brand-mid, #3f7a55)" stroke-width="2.4"/>
  <path d="M30 90c10-8 30-4 38-14s4-18 18-22" stroke="var(--ink-faint, #9a947f)" stroke-width="2" stroke-dasharray="1 6"/>
  <path d="M96 58v26" stroke="var(--ink-soft, #6f6a57)" stroke-width="2.2"/>
  <path d="M96 60h16l4 4-4 4H96z" fill="var(--surface, #fff)" stroke="var(--ink-soft, #6f6a57)" stroke-width="2"/>
  <path d="M101 64h8" stroke="var(--accent, #c2683d)" stroke-width="2"/>
</svg>`;

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
function openGradeInfo(cur) {
  if (typeof cur !== "number") cur = null;   // 也會被當成事件處理函式呼叫（收到 Event）
  const rows = Object.entries(GRADES).map(([n, g]) => `
    <div class="grade-row${+n === cur ? " cur" : ""}">
      <span class="grade-chip" style="background:${g.color}">${n}級·${g.name}</span>${+n === cur ? `<span class="grade-cur">${ttT("這條步道")}</span>` : ""}
      <div class="grade-text">
        <div class="grade-plain">${g.plain}</div>
        <div class="grade-meta"><span><i>適合</i>${g.who}</span><span><i>時間</i>${g.time}</span><span><i>裝備</i>${g.gear}</span></div>
      </div>
    </div>`).join("");
  $("#gradeBody").innerHTML = `
    <h2 style="margin-top:6px">步道分級怎麼看？</h2>
    <p style="font-size:13.5px;color:var(--ink-soft);line-height:1.6;margin:0 0 14px">數字越大越難。等級照林業署的「自然步道使用困難度分級標準」，看海拔、坡度、路況、天候等 10 項來打分。</p>
    <div class="grade-list">${rows}</div>
    <div class="grade-note" style="margin-top:14px">
      「親子友善」不是難度，是另外貼的標籤：路短、好走、坡緩，帶小孩去剛剛好。
    </div>
    <p class="grade-foot">難度前面有「≈」的是 OpenStreetMap 社群步道，等級是照長度和爬升推估的，參考就好；林業署的步道才是官方分級。出門前記得再看一下路況和天氣。</p>
    <button class="btn ghost" id="btnGradeClose" style="margin-top:8px">好，知道了</button>`;
  $("#gradeMask").classList.add("show");
  $("#gradeSheet").classList.add("show");
  $("#gradeSheet").scrollTop = 0;                 // 浮到最上層並回到頂部
  if (cur != null) setTimeout(() => { const r = document.querySelector("#gradeBody .grade-row.cur"); if (r) r.scrollIntoView({ block: "center", behavior: "smooth" }); }, 250);
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
// ── 戶外安全用的地理工具（全部離線可算）──
// 日落時間：NOAA 日出日落方程式，誤差約 1 分鐘。山上沒網路也算得出來，不靠天氣 API
function sunsetAt(lat, lon, date) {
  const rad = Math.PI / 180, d = date || new Date();
  const noon = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  const jd = noon.getTime() / 864e5 + 2440587.5;
  const n = Math.round(jd - 2451545.0 + 0.0008);
  const Js = n - lon / 360;
  const M = (357.5291 + 0.98560028 * Js) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const lam = (M + C + 180 + 102.9372) % 360;
  const Jt = 2451545.0 + Js + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lam * rad);
  const sd = Math.sin(lam * rad) * Math.sin(23.4397 * rad), cd = Math.cos(Math.asin(sd));
  const cw = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * sd) / (Math.cos(lat * rad) * cd);
  if (cw > 1 || cw < -1) return null;   // 極晝／極夜（台灣不會發生）
  const Jset = Jt + Math.acos(cw) / rad / 360;
  return new Date((Jset - 2440587.5) * 864e5);
}
// WGS84 → TWD97 二度分帶（TM2，中央經線 121°）：台灣搜救單位常用的座標
function toTWD97(lat, lon) {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9999, lon0 = 121 * Math.PI / 180, dx = 250000;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const phi = lat * Math.PI / 180, lam = lon * Math.PI / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2), T = Math.tan(phi) ** 2, C = ep2 * Math.cos(phi) ** 2, A = (lam - lon0) * Math.cos(phi);
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi));
  const x = dx + k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120);
  const y = k0 * (M + N * Math.tan(phi) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24 + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720));
  return { x: Math.round(x), y: Math.round(y) };
}
// 度分秒：24°27'03.5"N
function toDMS(v, pos, neg) { const s = v < 0 ? neg : pos; v = Math.abs(v); const d = Math.floor(v), mF = (v - d) * 60, m = Math.floor(mF), sec = (mF - m) * 60; return `${d}°${String(m).padStart(2, "0")}'${sec.toFixed(1).padStart(4, "0")}"${s}`; }
function hhmm(dt) { return dt ? `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}` : "--:--"; }
if (typeof window !== "undefined") { window.sunsetAt = sunsetAt; window.toTWD97 = toTWD97; }
// 紀錄卡用的短時長 h:mm（2:10）：卡片窄，「2 小時 10 分」會把大卡擠到第二行
function fmtDurShort(ms) { const m = Math.round((ms || 0) / 60000); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; }
// 人看得懂的時長：「00:19」到底是 19 秒還 19 分？結算與紀錄一律寫清楚（記錄中的碼表仍用 fmtTime）
function fmtDur(ms) {
  const s = Math.round((ms || 0) / 1000);
  if (s < 60) return `${s} ${ttT("秒")}`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} ${ttT("分鐘")}`;
  const h = Math.floor(m / 60), mm = m % 60;
  return mm ? `${h} ${ttT("小時")} ${mm} ${ttT("分")}` : `${h} ${ttT("小時")}`;
}
function toast(msg, opts) {
  const t = $("#toast"); t.textContent = msg; t.classList.toggle("top", !!(opts && opts.top)); t.classList.add("show");   // top：底部會蓋住內容時改從上方出現
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
let _recFollow = true;   // 記錄地圖是否自動跟隨定位；使用者手動滑動→關閉（不再硬拉回中間），按「回到我的位置」→重新開啟
function setRecFollow(on) {
  _recFollow = on;
  const b = recMap && recMap._recenterBtn; if (b) b.classList.toggle("following", on);
  if (!recMap) return;
  if (!on) {
    // 使用者滑開地圖＝暫停導航旋轉：地圖轉正，拖曳平順且方向正確（旋轉狀態下拖曳會抖、方向也不對）
    if (typeof applyPaneRotation === "function") applyPaneRotation();   // _recFollow=false → 清掉 rotate
    document.querySelectorAll("#recMap .tm-av, #recMap .pm-e").forEach(e => e.style.transform = "");
  } else if (_navUp && typeof updateMeCone === "function") {
    updateMeCone();   // 恢復跟隨→重新套回導航旋轉
  }
}

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
function wpKey(w) { return `${w.name || ""}@${(+w.lat).toFixed(5)},${(+w.lon).toFixed(5)}`; }   // 同名地標（兩個三角點）用座標分開
function drawWaypoints(layer, wps, reached) {
  if (!layer) return;
  layer.clearLayers();
  (wps || []).forEach(w => {
    const m = WP_META[w.type] || WP_META.view;
    const done = reached && reached.has(wpKey(w));
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
    document.body.classList.toggle("hdr-compact", view === "explore" && window.scrollY > 90);
    setTimeout(() => { if (typeof setHeaderH === "function") setHeaderH(); }, 230);   // 頁首高度換了，搜尋列吸頂位置跟著更新
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
        Recorder._trailName = null; Recorder._trailId = null;   // 沒清的話這趟自由記錄會被冠上上一趟的步道名
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
    if (view === "me") {
      renderHistory(); refreshOfflineStatus(); renderPalette(); renderProColor(); renderReminderToggle(); renderMeProfileCard(); renderSyncStatus();
      if (typeof Premium !== "undefined") { const was = Premium.isOn(); Premium.renderBox($("#premiumBox")); Premium.refresh().then(on => { if (on === was) return; Premium.renderBox($("#premiumBox")); renderPalette(); renderProColor(); renderMeProfileCard(); applyPalette(); }); }   // 狀態沒變就不再畫第二次
    }
    if (view === "social") {
      // 社群模組延遲載入：還沒載就先載完再進（開機後 2 秒會自動載，多數時候已就緒）
      if (typeof SocialUI === "undefined" && window.loadSocial) window.loadSocial().then(() => { if (window.wireTeamLive) window.wireTeamLive(); if (typeof SocialUI !== "undefined") SocialUI.onShow(); });
      else if (typeof SocialUI !== "undefined") SocialUI.onShow();
    }
  });
});

// 探索頁（搜尋、篩選、列表、地圖瀏覽）已拆到 js/explore.js，在 app.js 之後載入
// 地圖瀏覽模式
let browseMap = null, browseLayer = null, mapOn = false;
let browseMarkers = new Map(), browseMoveBound = false, browseMoveTimer = null;   // 視野虛擬化用
const DIFF_COLOR = { 0: "#3aa3a0", 1: "#46a24f", 2: "#6aa83e", 3: "#d8a127", 4: "#e07a2c", 5: "#d2542e", 6: "#5d6b7c" };   // 6＝雪季：冷灰藍（以前和「封閉」同一個紅）
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
// 地圖右下的來源只留圖資單位（拿掉「Leaflet」字樣）：小地圖空間有限，要讓「© 內政部國土測繪中心」完整顯示
if (typeof L !== "undefined" && L.Control && L.Control.Attribution) L.Control.Attribution.prototype.options.prefix = false;
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
function condStamp() {
  const u = (typeof Conditions !== "undefined" && Conditions.lastUpdated()) || 0;
  if (!u) return "";
  return new Date(u).toLocaleString(ttLocale(), { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
// 外部來源的字串插進 innerHTML 前一律跳脫：Google Places 的店名/簡介是店家可自訂的欄位、
// 林業署公告也是外部資料，直接插入會破版（最壞情況是 stored XSS）。
function escHtml(v) {
  return String(v == null ? "" : v).replace(/[<>&"']/g, ch =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[ch]));
}
function conditionBanner(t) {
  const c = t.condition;
  const src = (txt, time) => `<div class="cond-meta">${txt}</div>${time ? `<div class="cond-meta">${ttT("更新於")} ${time}</div>` : ""}`;
  // 有官方公告（落石／坍方／崩塌／封閉等）→ 紅/黃警示橫幅
  if (c && c.status) {
    const closed = /暫停|封閉|關閉/.test(c.status);
    // 「部分封閉（全線）」這種官方寫法自相矛盾 → 全線時就不再括號標示
    const sec = c.section && !(c.section === "全線" && /部分/.test(c.status)) ? `（${escHtml(c.section)}）` : "";
    return `<div class="cond-banner ${closed ? "danger" : "warn"}">
      <div class="cond-h">${ic("alert")}<span>${escHtml(c.status)}</span>${sec}</div>
      ${c.title ? `<div class="cond-body">${escHtml(c.title)}</div>` : ""}
      ${(c.title && typeof I18n !== "undefined" && I18n.lang() !== "zh") ? `<div class="pv-tr-row"><button class="link-btn" id="condTranslate">${ic("translate")} ${ttT("翻譯年糕")}</button></div><div class="cond-body pv-cap-tr" id="condTr" hidden></div>` : ""}
      ${c.reopen ? `<div class="cond-meta">${ttT("預計重新開放")}：${fmtYmd(c.reopen)}${c.dep ? `・${escHtml(c.dep)}` : ""}</div>` : ""}
      ${src(`${ttT("資料來源：林業及自然保育署")}（${ttT("以官方公告為準")}）`, condStamp())}
    </div>`;
  }
  // 林業署步道、無公告 → 綠色「通行正常」
  if (t.source === "forestry") {
    return `<div class="cond-banner ok">
      <div class="cond-h">${ic("check")}<span>${ttT("目前無封閉公告，通行正常")}</span></div>
      ${src(`${ttT("資料來源：林業及自然保育署即時路況")}・${ttT("出發前仍請留意現場天候與狀況")}`, condStamp())}
    </div>`;
  }
  // OSM 步道：無官方即時路況來源 → 中性提示，誠實告知
  return `<div class="cond-banner note">
    <div class="cond-h">${ic("info")}<span>${ttT("無官方即時路況資料")}</span></div>
    <div class="cond-meta">${ttT("這條不歸林業署管，我們拿不到即時封閉公告。出發前查一下當地公告，或看看最近的山友回報。")}</div>
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
function gradeExplain(t) {
  const g = GRADES[t.difficulty];
  if (!g) return t.difficulty === 6
    ? `<div class="grade-note">${ttT("這條在雪季才會有積雪，需要冰攀裝備與經驗；其他季節的難度沒有官方分級。")}</div>`
    : `<div class="grade-note">${ttT("此步道尚無分級資料。")}</div>`;
  const basis = t.source === "forestry" ? ttT("林業署官方分級") : ttT("照長度推估的，參考就好");
  return `<div class="grade-note">
    <b>${t.difficulty}級·${g.name}</b>：${g.plain}
    <div class="grade-note-meta"><span><i>適合</i>${g.who}</span><span><i>裝備</i>${g.gear}</span>
      <span class="gn-basis">${basis}・<a href="#" id="lnkGradeAll">${ttT("看完整分級說明")}</a></span></div>
  </div>`;
}

// ---------- 詳情面板 ----------
let _detailTrail = null, _detailBack = null;
// 生態：小黑蚊/蚊蟲警示 + 這個海拔帶常見動植物（離線）+ 選配的 iNaturalist 真實目擊。
// 每段可翻文字都獨立成一個文字節點——複合節點字典查不到會漏翻。
function ecologyHtml(t) {
  if (typeof Ecology === "undefined") return "";
  const r = Ecology.speciesFor(t);
  const alt = t.alt_low != null ? t.alt_low : t.alt_high;   // 小黑蚊在低海拔 → 用步道最低點最保守
  const env = (t.name || "") + (t.position || "") + tagsOf(t).join("");
  const risk = Ecology.biteRisk(alt, t.region, new Date(), env);
  const LV = { high: ["風險高", "eco-hi"], mid: ["風險中", "eco-mid"], low: ["風險低", "eco-lo"], none: ["幾乎無", "eco-no"] };
  const [lvTxt, lvCls] = LV[risk.level] || LV.none;
  const CATN = { mammal: ["paw", "哺乳類"], bird: ["bird", "鳥類"], insect: ["bug", "昆蟲"], herp: ["frog", "兩棲爬蟲"] };
  const SHOW = 6;   // 每類先列 6 個，其餘收起來（以前 30 多顆一次攤開）
  const cats = Ecology.CATS.map(k => {
    const arr = r.species[k] || []; if (!arr.length) return "";
    const [icon, nm] = CATN[k];
    const chip = sp => `<span class="eco-sp${Ecology.isPoison(sp) ? " eco-poison" : ""}">${Ecology.isPoison(sp) ? ic("alert") : ""}${escHtml(sp)}</span>`;
    const more = arr.length > SHOW ? `<button class="eco-more" type="button">+${arr.length - SHOW}</button><span class="eco-rest" hidden>${arr.slice(SHOW).map(chip).join("")}</span>` : "";
    return `<div class="eco-cat"><span class="eco-cat-h">${ic(icon)}<span>${nm}</span></span><span class="eco-chips">${arr.slice(0, SHOW).map(chip).join("")}${more}</span></div>`;
  }).join("");
  return `
    <div id="ecoBox" class="eco-box">
      <div class="eco-bite ${lvCls}">
        <div class="eco-bite-h">${ic("bug")}<span>小黑蚊・蚊蟲</span><span class="eco-lv">${lvTxt}</span></div>
        <ul class="eco-tips">${risk.tips.map(x => `<li>${x}</li>`).join("")}</ul>
      </div>
      <div class="eco-src">這個海拔常碰到的傢伙（不是這條步道的實際紀錄）</div>
      ${cats}
      <button class="btn ghost eco-nearby-btn" id="ecoNearbyBtn">${ic("search")}<span>看這附近的真實目擊</span></button>
      <div id="ecoNearbyBox" class="eco-nearby" hidden></div>
    </div>`;
}
function bindEcology(t) {
  document.querySelectorAll("#detailBody .eco-more").forEach(b => b.addEventListener("click", () => { const r = b.nextElementSibling; if (r) r.hidden = false; b.remove(); }));
  const enb = $("#ecoNearbyBtn");
  if (enb) enb.addEventListener("click", async () => {
    const box = $("#ecoNearbyBox"); if (!box) return;
    if (enb.dataset.done) { box.hidden = !box.hidden; return; }
    box.hidden = false;
    if (!navigator.onLine) { box.innerHTML = `<div class="eco-src">${ttT("需要網路才能看真實目擊")}</div>`; return; }
    enb.disabled = true;
    box.innerHTML = `<div class="food-loading"><span class="spin"></span>${ttT("查詢附近目擊中…")}</div>`;
    const obs = (typeof Ecology !== "undefined") ? await Ecology.nearbyObservations(t.lat, t.lon) : null;
    enb.disabled = false;
    if (!obs) { box.innerHTML = `<div class="eco-src">${ttT("這附近暫時沒有可顯示的目擊記錄")}</div>`; return; }
    enb.dataset.done = "1";
    box.innerHTML = `<div class="eco-src">${ttT("iNaturalist 附近 5 公里的真實觀察")}</div><div class="eco-obs">`
      + obs.map(o => `<div class="eco-ob">${o.thumb ? `<img src="${escHtml(o.thumb)}" loading="lazy" alt="">` : `<span class="eco-ob-noimg">${ic("search")}</span>`}<span>${escHtml(o.name)}</span></div>`).join("")
      + `</div>`;
  });
}
function currentDetailTrail() { return $("#detailSheet").classList.contains("show") ? _detailTrail : null; }

// 分享連結：只有真的是網站才給網址（iOS App 裡 location 是 capacitor://localhost，別人打不開）
function ttShareLink(query) {
  try {
    if (!/^https?:$/.test(location.protocol) || /^(localhost|127\.)/.test(location.hostname)) return null;
    return location.origin + location.pathname + (query || "");
  } catch (e) { return null; }
}

// ── 詳情頁各區塊 ──
function detailHeroHtml(t) {
  const fav = Store.isFav(t.id);
  return `<div class="detail-hero noimg" id="heroWrap">
      <div class="hero-cap">
        <h2>${escHtml(t.name)}</h2>
        <div class="badges">
          ${diffBadgeHtml(t)}
          ${t.family_friendly ? `<span class="badge family">${ttT("親子友善")}</span>` : ""}
          ${t.region ? `<span class="badge ghost">${escHtml(t.region)}</span>` : ""}
        </div>
      </div>
      <button class="hero-fav${fav ? " on" : ""}" id="favDetail" aria-pressed="${fav}" aria-label="${ttT("收藏")}">${STAR_SVG}</button>
    </div>`;
}
// 重點數字：固定 4 格（長度／爬升／時間／海拔或陡度），難度和縣市已在上方，不再重複
function detailStatsHtml(t) {
  const ascCached = (typeof Profile !== "undefined" && Profile.cachedGain) ? Profile.cachedGain(t.id) : null;
  const asc = ascCached != null ? ascCached : (t.ascent != null ? Math.round(t.ascent) : null);
  const ascEst = t.source !== "forestry" && ascCached == null;   // OSM 沿線推估、還沒用地形算過 → ≈
  const cells = [
    ["ruler", "長度", `${fmtKm(t.length_km)} km`],
    ["up", "累積爬升", `<span id="kvAscent">${asc != null ? `${ascEst ? `<span class="approx">≈</span>` : ""}${asc} m` : (geoOf(t) ? ttT("計算中…") : "—")}</span>`],
    ["clock", "所需時間", timeHtml(t) + myTimeHtml(t)],   // 走過幾趟之後，多一行「依你的腳程」
  ];
  if (t.alt_high != null && t.alt_low != null) cells.push(["mountain", "海拔範圍", `${t.alt_low}–${t.alt_high} m`]);
  else { const sl = slopeInfo(t); if (sl && sl.word) cells.push(["mountain", "坡度", `${ttT(sl.word)}<small> ${Math.round(sl.perKm)} m/km</small>`]); }
  return `<div class="statcard">${cells.map(([ico, l, v]) =>
    `<div class="stat"><div class="stat-h">${ic(ico)}<span>${ttT(l)}</span></div><div class="stat-v">${v}</div></div>`).join("")}</div>
    <div class="len-note" id="lenNote" hidden></div>`;
}
function detailMetaHtml(t) {
  const bits = [];
  if (t.pave) bits.push(escHtml(t.pave));
  if (t.best_season) bits.push(escHtml(t.best_season));
  if (t.transport?.car) bits.push(ttT("可開車"));
  if (t.transport?.m_bus || t.transport?.l_bus) bits.push(ttT("有公車"));
  return bits.length ? `<div class="det-meta"><div class="det-meta-l">${ttT("路面・季節・交通")}</div><div class="det-meta-v">${bits.map(b => `<span>${b}</span>`).join("・")}</div></div>` : "";
}
function detailGuideHtml(t) {
  if (!t.guide) return "";
  const g = String(t.guide).trim();
  // OSM 的「介紹」常只有一句「步道系統：地方級」→ 當成小註記，不當正文
  if (g.length < 40 && !/\n/.test(g)) return `<div class="det-meta det-meta-sm"><div class="det-meta-v">${escHtml(g)}</div></div>`;
  const tr = (typeof I18n !== "undefined" && I18n.lang() !== "zh")
    ? `<div class="pv-tr-row"><button class="link-btn" id="guideTranslate">${ic("translate")} ${ttT("翻譯年糕")}</button></div><div class="guide pv-cap-tr" id="guideTr" hidden></div>` : "";
  return `<div class="guide">${escHtml(g).replace(/\n/g, "<br>")}</div>${tr}`;
}
function detailOverviewHtml(t) {
  const nav = t.lat ? `https://www.google.com/maps/dir/?api=1&destination=${t.lat},${t.lon}` : "";
  const moreSearch = `https://www.google.com/search?q=${encodeURIComponent(t.name + " 步道")}`;
  // 標籤：「親子」上面已經有「親子友善」，不再重複
  const tags = tagsOf(t).filter(g => !(t.family_friendly && /親子/.test(g)));
  return `<div id="condLive">${conditionBanner(t)}</div>
    ${detailStatsHtml(t)}
    ${tags.length ? `<div class="tag-row">${tags.map(g => `<span class="tag">${escHtml(g)}</span>`).join("")}</div>` : ""}
    ${gradeExplain(t)}
    ${detailMetaHtml(t)}
    ${siblingHtml(t)}
    ${detailGuideHtml(t)}
    <div class="link-row flow det-acts">
      ${nav ? `<a class="link-btn" href="${nav}" target="_blank" rel="noopener">${ic("compass")} ${ttT("導航")}</a>` : ""}
      <a class="link-btn" href="${moreSearch}" target="_blank" rel="noopener">${ic("search")} ${ttT("查資訊")}</a>
      <button class="link-btn" id="btnShareTrail">${ic("share")} ${ttT("分享")}</button>
      <button class="link-btn social-only" id="btnEventTrail">${ic("calendar")} ${ttT("揪團")}</button>
      <button class="link-btn" id="btnDetMore">${ic("more")} ${ttT("更多")}</button>
    </div>
    <div id="activityBox" hidden></div>
    <div id="trailFeedBox"></div>`;
}
function detailRouteHtml(t) {
  const done = typeof offlineSets === "function" && offlineSets()["trail:" + t.id];
  return `<div class="section-title" id="secWx">${ic("sun")}${ttT("天氣（步道所在地）")}</div>
    <div id="weatherBox"><div class="food-loading"><span class="spin"></span>${ttT("查詢天氣中…")}</div></div>
    ${geoOf(t) ? `<div class="section-title" id="secElev">${ic("mountain")}${ttT("海拔剖面")}</div><div id="profileBox"><div class="food-loading"><span class="spin"></span>${ttT("計算海拔剖面中…")}</div></div>` : ""}
    ${wpListHtml(t)}
    <button class="btn ghost" id="btnOffline" style="margin-top:14px">${done ? `${ic("check")} ${ttT("已預載離線地圖")}<small>・${ttT("再按一次會補齊")}</small>` : `${ic("download")} ${ttT("預載此步道離線地圖")}`}</button>
    <div id="offlineBox" class="offline-box" hidden></div>`;
}
function detailNearbyHtml(t) {
  return `<div id="amenBox" class="amen-box"></div>
    <div class="section-title" id="secPoi">${ic("landmark")}${ttT("附近人文景點")}</div>
    <div id="poiBox">${skelCards(3)}</div>
    <div class="section-title" id="secFood">${ic("food")}${ttT("步道周邊美食")}</div>
    <div id="foodBox">${skelCards(3)}</div>
    ${nearbyStripHtml(t)}`;
}

// opts.from：從詳情頁裡的「同名路段／附近步道」跳過來 → 顯示「回到上一條」
async function openDetail(id, opts) {
  const t = TRAILS.find(x => x.id === id);
  if (!t) return;
  _detailBack = (opts && opts.from && _detailTrail && _detailTrail.id !== id) ? _detailTrail : null;
  _detailTrail = t;
  clearDetailObs();
  // 先開面板給回饋，再（首次）載入幾何
  $("#detailHero").innerHTML = "";
  $("#detailBody").innerHTML = `<div class="det-loading"><span class="spin"></span>${ttT("載入中…")}</div>`;
  $("#sheetMask").classList.add("show");
  $("#detailSheet").classList.add("show");
  $("#detailSheet").scrollTop = 0;
  $("#closeDetailBtn").focus({ preventScroll: true });
  await Promise.all([ensureGeo(t.region), ensureDetail()]);   // 幾何只載這條步道的縣市分片
  if (_detailTrail !== t) return;
  mergeDetail(t);                       // 併入 guide/entrances/交通等詳情欄位
  const credit = t.source === "forestry" ? ttT("資料來源：林業及自然保育署 開放資料") : ttT("資料來源：OpenStreetMap 貢獻者（社群步道，詳細資料有限）");
  $("#detailHero").innerHTML = detailHeroHtml(t);
  // 生態、周邊兩頁點到才建（以前一打開就把 4 頁 600 個元素全建好）
  $("#detailBody").innerHTML = `
    ${_detailBack ? `<button class="det-back" id="detBack">${ic("chevron")}<span>${ttT("回到")} ${escHtml(_detailBack.name)}</span></button>` : ""}
    <div class="detail-tabs" id="detailNav" role="tablist">
      <button data-tab="ov" class="on" role="tab">${ttT("概覽")}</button>
      <button data-tab="rt" role="tab">${ttT("路線")}</button>
      <button data-tab="ec" role="tab">${ttT("生態")}</button>
      <button data-tab="nb" role="tab">${ttT("周邊")}</button>
    </div>
    <div class="tabwrap">
      <section class="tabpane" data-pane="ov" role="tabpanel">${detailOverviewHtml(t)}</section>
      <section class="tabpane" data-pane="rt" role="tabpanel" hidden>${detailRouteHtml(t)}</section>
      <section class="tabpane" data-pane="ec" role="tabpanel" hidden></section>
      <section class="tabpane" data-pane="nb" role="tabpanel" hidden></section>
    </div>
    <div class="detail-credit">${credit}</div>
    <div class="detail-actionbar">
      <button class="btn primary" id="btnGoRecord">${ic("pin")}${ttT("在此步道開始記錄")}</button>
    </div>`;
  bindDetail(t);
  loadPhoto(t);
  loadWeather(t);
  loadElevation(t);
  loadTrailFeed(t);
  loadTrailActivity(t);
  drawDetailMap(t);
  // 首次點開步道詳情 → 情境導覽（等面板滑入穩定再跳；已關閉就不跳）
  if (typeof window.ttCoachTrail === "function") setTimeout(() => window.ttCoachTrail(!!geoOf(t)), 550);
}

function bindDetail(t) {
  const body = $("#detailBody");
  const back = $("#detBack"); if (back) back.addEventListener("click", () => openDetail(back._id || _detailBack.id));
  if (back) back._id = _detailBack.id;
  body.querySelectorAll(".sib-chip").forEach(b => b.addEventListener("click", () => openDetail(b.dataset.sib, { from: true })));
  // 翻譯年糕：路況公告、介紹文（非中文介面）
  const trBtn = (btnId, outId, getSrc) => {
    const btn = $(btnId); if (!btn) return;
    btn.addEventListener("click", async () => {
      const out = $(outId); if (!out) return;
      if (!out.hidden) { out.hidden = true; btn.innerHTML = `${ic("translate")} ${ttT("翻譯年糕")}`; return; }
      if (out.dataset.done) { out.hidden = false; btn.innerHTML = `${ic("translate")} ${ttT("收合翻譯")}`; return; }
      btn.disabled = true; btn.textContent = ttT("翻譯中…");
      const src = getSrc();
      const tr = (typeof ttTranslate === "function" && src) ? await ttTranslate(src, ttTrTarget()) : null;
      btn.disabled = false;
      if (!tr) { btn.textContent = ttT("翻譯失敗，點此重試"); return; }
      out.textContent = tr; out.dataset.done = "1"; out.hidden = false;
      btn.innerHTML = `${ic("translate")} ${ttT("收合翻譯")}`;
    });
  };
  trBtn("#condTranslate", "#condTr", () => (t.condition && [t.condition.title, t.condition.content].filter(Boolean).join("\n")) || "");
  trBtn("#guideTranslate", "#guideTr", () => t.guide || "");
  // 分頁：生態／周邊第一次點到才建內容
  const navBtns = $("#detailNav").querySelectorAll("button");
  const panes = body.querySelectorAll(".tabpane");
  const built = {};
  const build = tab => {
    if (built[tab]) return; built[tab] = true;
    const pane = body.querySelector(`.tabpane[data-pane="${tab}"]`);
    if (tab === "ec") { pane.innerHTML = ecologyHtml(t); bindEcology(t); }
    if (tab === "nb") {
      pane.innerHTML = detailNearbyHtml(t);
      pane.querySelectorAll(".nearby-card").forEach(el => el.addEventListener("click", () => { if (el.dataset.id) openDetail(el.dataset.id, { from: true }); }));
      // Places 查詢（設施/美食/景點）較耗額度 → 滑到該區塊才查
      whenVisible($("#amenBox"), () => loadAmenities(t));
      whenVisible($("#poiBox"), () => loadAttractions(t));
      whenVisible($("#foodBox"), () => loadFood(t));
    }
  };
  const showTab = tab => {
    build(tab);
    navBtns.forEach(b => { b.classList.toggle("on", b.dataset.tab === tab); b.setAttribute("aria-selected", b.dataset.tab === tab); });
    panes.forEach(p => { p.hidden = p.dataset.pane !== tab; });
    const sheet = $("#detailSheet"), navTop = $("#detailNav").offsetTop;
    if (sheet.scrollTop > navTop) sheet.scrollTop = navTop;   // 對齊頁籤，避免切到較短分頁時捲過頭露白
  };
  navBtns.forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
  // 區塊可收合（沿線地標）
  body.querySelectorAll(".section-title.collapsible").forEach(hd => hd.addEventListener("click", () => {
    const collapsed = hd.classList.toggle("collapsed");
    hd.setAttribute("aria-expanded", !collapsed);
    const box = hd.nextElementSibling; if (box) box.hidden = collapsed;
  }));
  // 沿線地標：點清單一列 → 地圖跳到該地標並開泡泡
  body.querySelectorAll(".wp-row").forEach(b => b.addEventListener("click", () => {
    const la = +b.dataset.wplat, lo = +b.dataset.wplon;
    if (detailMap) { detailMap.setView([la, lo], 16); const mp = $("#detailMap"); if (mp) mp.scrollIntoView({ block: "center", behavior: "smooth" }); }
    detailWpLayer && detailWpLayer.eachLayer(m => { try { const ll = m.getLatLng(); if (Math.abs(ll.lat - la) < 1e-5 && Math.abs(ll.lng - lo) < 1e-5) setTimeout(() => m.openPopup(), 350); } catch (e) { /* */ } });
  }));
  $("#btnGoRecord").addEventListener("click", () => {
    closeDetail();
    document.querySelector('.tab[data-view="record"]').click();   // 會先清空 selectedTrailGeo
    selectTrailForRecord(t);                 // 路線疊圖、偏離判斷、沿線地標、行前小卡、可取消的選定列
  });
  const lnk = $("#lnkGradeAll");
  if (lnk) lnk.addEventListener("click", e => { e.preventDefault(); openGradeInfo(t.difficulty); });
  const offBtn = $("#btnOffline");
  if (offBtn) offBtn.addEventListener("click", () => downloadOffline(t, offBtn));
  const favD = $("#favDetail");
  if (favD) favD.addEventListener("click", () => {
    if (!Store.isFav(t.id) && !favAddAllowed()) return;
    const added = Store.toggleFav(t.id);
    favD.classList.toggle("on", added); favD.setAttribute("aria-pressed", added);
    if (added) { favD.classList.remove("pop"); void favD.offsetWidth; favD.classList.add("pop"); }
    toast(ttT(added ? "已加入收藏" : "已移除收藏"));
    const star = document.querySelector(`#trailList .fav-star[data-fav="${CSS.escape(t.id)}"]`);   // 列表上的星星同步
    if (star) { star.classList.toggle("on", added); star.setAttribute("aria-pressed", added); }
  });
  const shareT = $("#btnShareTrail");
  if (shareT) shareT.addEventListener("click", () => {
    const url = ttShareLink(`?trail=${encodeURIComponent(t.id)}`);
    const text = `${t.name}（${diffLabel(t)}${t.length_km ? " · " + fmtKm(t.length_km) + " km" : ""}）— 循徑拾光`;
    if (navigator.share) navigator.share(url ? { title: t.name, text, url } : { title: t.name, text }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url ? text + "\n" + url : text).then(() => toast(ttT("複製好了")));
  });
  const evT = $("#btnEventTrail");
  if (evT) evT.addEventListener("click", () => { if (typeof Events !== "undefined") Events.open(t); else toast(ttT("社群尚未啟用")); });
  // 「更多」：加入比較、林業署原始頁（不常用，收起來）
  const more = $("#btnDetMore");
  if (more) more.addEventListener("click", async () => {
    const inSet = compareSet.has(t.id);
    const opts = [{ label: ttT(inSet ? "移出比較" : "加入比較"), value: "cmp", cls: "ghost" }];
    if (t.url) opts.push({ label: ttT("看官方原始頁"), value: "src", cls: "ghost" });
    opts.push({ label: ttT("取消"), value: null, cls: "primary" });
    const act = await ttChoice(escHtml(t.name), opts);
    if (act === "src") window.open(t.url, "_blank", "noopener");
    if (act === "cmp") {
      if (compareSet.has(t.id)) compareSet.delete(t.id);
      else { if (compareSet.size >= 3) { toast(ttT("最多比較 3 條")); return; } compareSet.add(t.id); }
      toast(ttT(compareSet.has(t.id) ? "已加入比較" : "已移出比較"));
      updateCompareBar();
    }
  });
}

function drawDetailMap(t) {
  setTimeout(() => {
    if (_detailTrail !== t) return;
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
      // 起點/終點標示（用最長段的端點；判斷環狀）
      const main = geom.reduce((a, b) => (b.length > a.length ? b : a), geom[0]);
      const start = main[0], end = main[main.length - 1];
      const loop = haversine({ lat: start[0], lon: start[1] }, { lat: end[0], lon: end[1] }) < 120;
      L.circleMarker(start, { radius: 7, color: "#fff", weight: 2, fillColor: "#2f7d4f", fillOpacity: 1 })
        .addTo(detailOverlay).bindPopup(ttT(loop ? "起／終點（環狀）" : "起點"));
      if (!loop) L.circleMarker(end, { radius: 7, color: "#fff", weight: 2, fillColor: "#d2542e", fillOpacity: 1 })
        .addTo(detailOverlay).bindPopup(ttT("終點"));
      detailMap.fitBounds(L.featureGroup(lines).getBounds(), { padding: [20, 20] });
    } else if (t.lat) {
      detailMap.setView([t.lat, t.lon], 14);
      (t.entrances || []).forEach(e => L.marker([e.lat, e.lon]).addTo(detailOverlay).bindPopup(escHtml(e.memo || ttT("步道入口"))));
    } else {
      detailMap.setView([23.7, 121], 7);
    }
    detailMap.invalidateSize();
  }, 120);
}

async function loadAmenities(t) {
  const box = $("#amenBox");
  if (!box) return;
  try {
    const items = await Amenities.nearby(t);
    if (_detailTrail !== t) return;                    // 使用者已切到別條步道 → 這批資料不是他要看的
    if (!items || !items.length) { box.hidden = true; return; }
    // 舊快取的分類名帶 emoji（🅿️ 停車）→ 拿掉，改用 SVG 圖示
    const AIC = { "停車": "parking", "廁所": "toilet", "超商": "store" };
    box.innerHTML = `<div class="amen-row">` + items.map(a => {
      const lb = String(a.label || "").replace(/^\S+\s+/, "");
      return `<span class="amen">${ic(AIC[lb] || "pin")}<b>${ttT(lb)}</b> ${(a.dist / 1000).toFixed(1)} km</span>`;
    }).join("") + `</div>`;
  } catch { box.hidden = true; }
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
    car.innerHTML = items.map(it => `<img alt="${escHtml(t.name)}" src="${escHtml(it.url)}" loading="lazy" decoding="async">`).join("")
      + (items.length > 1 ? `<div class="hero-dots">${items.map((_, i) => `<span class="${i ? "" : "on"}"></span>`).join("")}</div>` : "");
    hero.insertBefore(car, hero.firstChild);
    // CC 授權要求標作者＋授權：隨輪播顯示當張照片的 credit
    const creditEl = document.createElement("div");
    creditEl.className = "hero-credit";
    const setCredit = i => { creditEl.textContent = `© ${items[i].credit}`; };   // 下方的點點已經告訴人可以滑，不必再寫
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
    if (!p) { box.hidden = true; return; }
    // 地圖畫出來的路線和官方記載的長度差很多 → 說清楚為什麼兩個數字不一樣
    if (t.length_km && p.distKm && Math.abs(p.distKm - t.length_km) / t.length_km > 0.25) {
      const ln = $("#lenNote");
      if (ln) { ln.hidden = false; ln.innerHTML = `${ic("info")}<span>${ttT("地圖上的路線約")} ${fmtKm(p.distKm)} km，${ttT("和記載的")} ${fmtKm(t.length_km)} km ${ttT("不一樣：記載的常只算主線，地圖可能含支線或來回。")}</span>`; }
    }
    if (p.gain != null) {
      const kvA = $("#kvAscent"); if (kvA) kvA.textContent = p.gain + " m";   // 詳情頁即時覆蓋（用地形算的，比資料準）
      // 同步更新探索列表中該步道卡的累積爬升（不必重開 App）
      const sel = (window.CSS && CSS.escape) ? CSS.escape(t.id) : t.id;
      document.querySelectorAll(`#trailList .card[data-id="${sel}"] [data-card-asc]`).forEach(el => { el.textContent = "↑" + p.gain; });
    }
    box.innerHTML = `<div class="profile-wrap" id="profWrap">${p.svg}
        <div class="prof-cursor" id="profCursor"></div><div class="prof-tip" id="profTip"></div></div>
      <div class="profile-stat"><span>${ttT("最低")}<b>${p.min} m</b></span><span>${ttT("最高")}<b>${p.max} m</b></span><span>${ttT("累積爬升")}<b>↑${p.gain} m</b></span><span>${ttT("路線長")}<b>${fmtKm(p.distKm)} km</b></span></div>
      <div class="profile-legend"><span><i style="background:#4a8f55"></i>${ttT("緩")}</span><span><i style="background:#c39327"></i>${ttT("中")}</span><span><i style="background:#c0542f"></i>${ttT("陡")}</span><span class="pl-hint">${ttT("滑過看各點海拔")}</span></div>`;
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
      tip.textContent = `${best.d.toFixed(2)} km · ${best.e} m`;
    };
    wrap.addEventListener("pointermove", e => move(e.clientX));
    wrap.addEventListener("pointerdown", e => move(e.clientX));
    wrap.addEventListener("pointerleave", () => { cur.style.display = "none"; tip.style.display = "none"; });
  } catch {
    box.innerHTML = `<div class="food-empty">${ttT("海拔剖面算不出來，要有網路")}</div>`;
  }
}

async function loadWeather(t) {
  const box = $("#weatherBox");
  if (!box) return;
  if (!t.lat) { box.innerHTML = `<div class="food-empty">${ttT("這條步道沒有座標，查不了天氣")}</div>`; return; }
  try {
    const d = await Weather.get(t.lat, t.lon);
    if (_detailTrail !== t) return;                    // 已切換步道 → 不要把舊步道的天氣寫進新面板
    const c = d.current, dd = d.daily;
    const [, txt] = Weather.desc(c.weather_code);
    const wd = i => i === 0 ? ttT("今天") : new Date(dd.time[i] + "T12:00").toLocaleDateString(ttLocale(), { weekday: "short" });
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
    const allWet = dd.precipitation_probability_max.every(v => (v ?? 0) >= 60);   // 整週都很可能下雨 → 不硬挑「最適合」的一天
    const fc = dd.time.map((t2, i) => `<div class="wx-day${i === best && !allWet ? " best" : ""}"><div class="wx-d">${wd(i)}</div><div class="wx-e">${wxIcon(dd.weather_code[i])}</div>
        <div class="wx-t">${Math.round(dd.temperature_2m_min[i])}°/${Math.round(dd.temperature_2m_max[i])}°</div>
        <div class="wx-p">${ic("drop")}${dd.precipitation_probability_max[i] ?? "—"}%</div></div>`).join("");
    box.innerHTML = `<div class="wx-now">
        <span class="wx-now-e">${wxIcon(c.weather_code)}</span>
        <span class="wx-now-t">${Math.round(c.temperature_2m)}°C</span>
        <span class="wx-now-d"><span>${ttT(txt)}</span><span>${ttT("濕度")} ${c.relative_humidity_2m}%</span><span>${ttT("風")} ${Math.round(c.wind_speed_10m)} km/h</span></span>
      </div>
      ${allWet ? `<div class="wx-best wet">${ic("rain")}<span>${ttT("這週每天降雨機率都在 6 成以上，沒有特別適合的一天")}</span></div>`
        : `<div class="wx-best">${ic("calendar")}<span>${ttT("最適合出發")}：<b>${wd(best)}</b>（${ttT("降雨")} ${dd.precipitation_probability_max[best] ?? "—"}%・${Math.round(dd.temperature_2m_min[best])}–${Math.round(dd.temperature_2m_max[best])}°）</span></div>`}
      <svg class="wx-curve" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${line}" fill="none" stroke="var(--brand-mid)" stroke-width="2"/>${dots}</svg>
      <div class="wx-fc">${fc}</div>
      <div class="food-credit">${ttT("天氣資料：Open-Meteo · 7 日預報")}</div>`;
  } catch {
    box.innerHTML = `<div class="food-empty">${ttT("天氣查不到，要有網路")}</div>`;
  }
}

// Google 回的分類名（中文）：中文介面照用；其他語言查字典，查不到就用通稱，不讓中文混在外文介面裡
function placeKind(kind, generic) {
  const k = String(kind || generic);
  if (typeof I18n === "undefined" || I18n.lang() === "zh") return escHtml(k);
  const tr = I18n.tx(k);
  return escHtml(tr || ttT(generic));
}
// 天氣代碼 → SVG 圖示（以前是 emoji，部分裝置顯示成方框）
function wxIcon(code) {
  const c = +code;
  const name = c === 0 ? "sun" : c <= 2 ? "cloudsun" : c === 3 ? "cloud" : c <= 48 ? "fog" : (c >= 71 && c <= 77) || c === 85 || c === 86 ? "snow" : c >= 95 ? "storm" : "rain";
  return ic(name, "wx-ic wx-" + name);
}
let _foodItems = [], _foodSort = "distance", _foodAll = false;
async function loadFood(t) {
  const box = $("#foodBox");
  if (!box) return;
  if (!t.lat) { box.innerHTML = `<div class="food-empty">此步道無座標，無法查詢周邊美食</div>`; return; }
  box.innerHTML = `<div class="food-loading">尋找附近美食中…</div>`;
  try {
    const items = await Food.nearby(t);
    if (_detailTrail !== t) return;                    // 已切換步道 → 舊步道的美食不可以蓋到新面板
    _foodItems = items; _foodAll = false;
    plotPoi(_foodItems, "#c2683d", "food");
    renderFood();
  } catch (err) {
    box.innerHTML = `<div class="food-empty">美食查詢失敗，請稍後再試（需網路）</div>`;
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
  const all = Food.sortItems(_foodItems, _foodSort);
  const items = _foodAll ? all : all.slice(0, 5);   // 先給 5 筆，周邊頁才不會長到滑不完
  box.innerHTML = `
    <div class="food-sort">排序
      <button class="food-sort-btn${_foodSort === "distance" ? " on" : ""}" data-fsort="distance">${ic("pin")}距離</button>
      <button class="food-sort-btn${_foodSort === "rating" ? " on" : ""}" data-fsort="rating">${ic("star")}星級</button>
    </div>
    <div class="food-list">${items.map(f => `
      <a class="food-item" href="${f.uri || "#"}" target="_blank" rel="noopener">
        <span class="food-kind">${placeKind(f.kind, "餐飲")}</span>
        <span class="food-name">${escHtml(f.name)}</span>
        ${foodStars(f)}
        <span class="food-dist">${(f.dist / 1000).toFixed(1)} km</span>
      </a>`).join("")}</div>
    ${all.length > items.length ? `<button class="more-btn" id="foodMore">${ttT("再看更多")}（${all.length - items.length}）</button>` : ""}
    <div class="food-credit"><i class="lg-dot" style="background:#c2683d"></i>已標在上方地圖・星級來自 Google 地圖</div>`;
  box.querySelectorAll(".food-sort-btn").forEach(b =>
    b.addEventListener("click", () => { _foodSort = b.dataset.fsort; renderFood(); }));
  const fm = box.querySelector("#foodMore"); if (fm) fm.addEventListener("click", () => { _foodAll = true; renderFood(); });
}

// 附近人文景點（歷史、廟宇、博物館、文化、觀光）
let _poiItems = [], _poiSort = "distance", _poiAll = false;
async function loadAttractions(t) {
  const box = $("#poiBox");
  if (!box) return;
  if (!t.lat) { box.innerHTML = `<div class="food-empty">此步道無座標，無法查詢周邊景點</div>`; return; }
  try {
    const pois = await Attractions.nearby(t);
    if (_detailTrail !== t) return;                    // 已切換步道
    _poiItems = pois; _poiAll = false;
    plotPoi(_poiItems, "#3b6ea5", "poi");
    renderAttractions();
  } catch (err) {
    box.innerHTML = `<div class="food-empty">景點查詢失敗，請稍後再試（需網路）</div>`;
  }
}
function renderAttractions() {
  const box = $("#poiBox");
  if (!box) return;
  if (!_poiItems.length) { box.innerHTML = `<div class="food-empty">附近 12 公里內查無人文景點</div>`; return; }
  const all = Attractions.sortItems(_poiItems, _poiSort);
  const items = _poiAll ? all : all.slice(0, 5);
  box.innerHTML = `
    <div class="food-sort">排序
      <button class="food-sort-btn${_poiSort === "distance" ? " on" : ""}" data-psort="distance">${ic("pin")}距離</button>
      <button class="food-sort-btn${_poiSort === "rating" ? " on" : ""}" data-psort="rating">${ic("star")}評價</button>
    </div>
    <div class="poi-list">${items.map(p => `
      <a class="poi-item" href="${p.uri || "#"}" target="_blank" rel="noopener">
        <div class="poi-top">
          <span class="poi-kind">${placeKind(p.kind, "景點")}</span>
          <span class="poi-name">${escHtml(p.name)}</span>
          ${p.rating ? `<span class="poi-rating">★ ${p.rating.toFixed(1)}</span>` : ""}
        </div>
        ${p.summary ? `<div class="poi-sum">${escHtml(p.summary)}</div>` : ""}
        <div class="poi-dist">${(p.dist / 1000).toFixed(1)} km</div>
      </a>`).join("")}</div>
    ${all.length > items.length ? `<button class="more-btn" id="poiMore">${ttT("再看更多")}（${all.length - items.length}）</button>` : ""}
    <div class="food-credit"><i class="lg-dot" style="background:#3b6ea5"></i>已標在上方地圖・資料來自 Google 地圖</div>`;
  box.querySelectorAll(".food-sort-btn").forEach(b =>
    b.addEventListener("click", () => { _poiSort = b.dataset.psort; renderAttractions(); }));
  const pm = box.querySelector("#poiMore"); if (pm) pm.addEventListener("click", () => { _poiAll = true; renderAttractions(); });
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
  // 確認文字講人話（以前寫「縮放 7–13」，而且整段沒翻譯）；按鈕文字分段翻譯、圖示不再被「下載中…」吃掉
  const mbTxt = (tiles.length * 0.02).toFixed(0);
  if (!(await ttConfirm(`${ttT("下載全台概覽地圖？")}\n${tiles.length} ${ttT("張圖磚")} · ≈ ${mbTxt} MB\n\n${ttT("離線也能看整個台灣的大範圍地圖；步道細節請到步道頁另外按「預載離線地圖」。下載要幾分鐘，請讓 App 開著。")}`, ttT("下載"), ttT("取消")))) return;
  if (!offlineAllow(tiles)) return;   // 非會員：MB 額度制
  box.hidden = false; box.style.display = "block";
  const label = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = `${ic("globe")} ${ttT("下載中…")}`;
  try {
    const r = await Offline.download(tiles, (done, total) => {
      box.innerHTML = `${ttT("下載全台地圖中…")} ${done}/${total}<div class="offline-bar"><i style="width:${Math.round(done / total * 100)}%"></i></div>`;
    });
    addOfflineMb(r.mb); saveOfflineSet("taiwan", { name: "全台概覽" });
    box.innerHTML = `${ic("check")} <span>${ttT("全台概覽地圖可以離線看了")}</span>${ttParen(`${r.ok}/${r.total} ${ttT("張圖磚")}`)}`;
    btn.innerHTML = `${ic("check")} ${ttT("已下載全台離線地圖")}`;
    refreshOfflineStatus();
  } catch {
    box.innerHTML = ttT("下載失敗，請確認網路後再試。");
    btn.disabled = false; btn.innerHTML = label;
  }
}
// 一鍵預載所有收藏步道的離線地圖
async function downloadFavOffline() {
  const favs = TRAILS.filter(t => Store.isFav(t.id) && t.lat);
  const btn = $("#btnFavOffline"), box = $("#favOfflineBox");
  if (!favs.length) { toast(ttT("還沒有收藏步道：先到步道頁按星星收藏，再回來一次預載")); return; }
  const seen = new Set(); let tiles = [];
  for (const t of favs) for (const k of trailTiles(t)) if (!seen.has(k)) { seen.add(k); tiles.push(k); }
  if (!offlineAllow(tiles)) return;   // 非會員：MB 額度制
  box.hidden = false; box.style.display = "block";
  box.innerHTML = `${ttT("準備下載")} ${tiles.length} ${ttT("張圖磚")}（≈ ${(tiles.length * 0.02).toFixed(1)} MB）…`;
  const label = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = `${ic("download")} ${ttT("下載中…")}`;
  try {
    const r = await Offline.download(tiles, (done, total) => {
      box.innerHTML = `${ttT("下載中…")} ${done}/${total}<div class="offline-bar"><i style="width:${Math.round(done / total * 100)}%"></i></div>`;
    });
    addOfflineMb(r.mb); favs.forEach(t => saveOfflineSet("trail:" + t.id, { name: t.name }));
    box.innerHTML = `${ic("check")} <span>${ttT("收藏的步道可以離線看地圖了")}</span>${ttParen(`${favs.length} ${ttT("條")} · ${r.ok}/${r.total} ${ttT("張圖磚")}`)}`;
    btn.innerHTML = `${ic("check")} ${ttT("已預載收藏")}`;
    refreshOfflineStatus();
  } catch {
    box.innerHTML = ttT("下載失敗，請確認網路後再試。");
    btn.disabled = false; btn.innerHTML = label;
  }
}
async function downloadOffline(t, btn) {
  if (!t.lat) { toast(ttT("這條步道沒有座標，下載不了地圖")); return; }
  const box = $("#offlineBox");
  // 底圖 + 高程圖磚（z13–14）：高程一起抓，山上沒訊號時爬升/下降校正與坡度著色才算得出來。
  // 高程圖磚數量比底圖少一個數量級（同範圍只需低倍），對額度影響很小。
  const tiles = trailTiles(t);
  if (!offlineAllow(tiles)) return;   // 非會員：MB 額度制
  box.hidden = false;
  box.innerHTML = `${ttT("準備下載")} ${tiles.length} ${ttT("張圖磚")}（≈ ${(tiles.length * 0.02).toFixed(1)} MB）…`;
  btn.disabled = true; btn.textContent = ttT("下載中…");
  try {
    const r = await Offline.download(tiles, (done, total) => {
      box.innerHTML = `${ttT("下載離線地圖中…")} ${done}/${total}
        <div class="offline-bar"><i style="width:${Math.round(done / total * 100)}%"></i></div>`;
    });
    addOfflineMb(r.mb); saveOfflineSet("trail:" + t.id, { name: t.name });
    const miss = r.total - r.ok;
    box.innerHTML = miss ? `${ic("alert")} ${ttT("有些圖磚沒抓到")}（${miss}）・${ttT("再按一次會補齊")}` : `${ic("check")} ${ttT("好了，這條步道沒訊號也看得到地圖")}`;
    btn.disabled = false; btn.innerHTML = `${ic("check")} ${ttT("已預載離線地圖")}<small>・${ttT("再按一次會補齊")}</small>`;
  } catch {
    box.innerHTML = `${ic("alert")} ${ttT("沒下載完：網路斷了或手機空間不夠。再按一次會從斷掉的地方接著下載。")}`;
    btn.disabled = false; btn.innerHTML = `${ic("download")} ${ttT("預載此步道離線地圖")}`;
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

// 記錄頁（記錄中、行程結算、閃退復原）已拆到 js/record.js，在 app.js、explore.js 之後載入
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
      ${row("步道", t => `<b class="cmp-nm">${escHtml(t.name)}</b>`)}
      ${row("難度", t => diffBadgeHtml(t))}
      ${row("長度", t => `<span class="nw">${fmtKm(t.length_km)} km</span>`)}
      ${row("累積爬升", t => t.ascent != null ? `<span class="nw">↑${Math.round(t.ascent)} m</span>` : "—")}
      ${row("所需時間", t => timeHtml(t))}
      ${row("親子友善", t => t.family_friendly ? "✓" : "—")}
      ${row("地區", t => t.region || "—")}
      ${row("主題", t => escHtml(tagsOf(t).slice(0, 3).join("、")) || "—")}
    </table></div>
  </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.querySelector("#cmpClose").onclick = close;
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
}
// ---------- 分級說明按鈕 ----------
$("#gradeMask").addEventListener("click", closeGradeInfo);
$("#closeGradeBtn").addEventListener("click", closeGradeInfo);

// ---------- 外觀主題 ----------
// mode：light / dark / auto（跟隨系統）
const _darkMQ = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
// 戶外顯示：normal／sun（陽光下高對比，強制淺色）／red（夜間紅光，強制深色＋整頁轉紅，不傷夜視）
function visMode() { try { const v = localStorage.getItem("tt_vis"); return v === "sun" || v === "red" ? v : "normal"; } catch (e) { return "normal"; } }
function applyVis(v) {
  try { if (v === "normal") localStorage.removeItem("tt_vis"); else localStorage.setItem("tt_vis", v); } catch (e) { /* */ }
  if (v === "normal") document.documentElement.removeAttribute("data-vis"); else document.documentElement.setAttribute("data-vis", v);
  applyTheme(localStorage.getItem("tt_theme") || "light");
  document.querySelectorAll("[data-vis-opt]").forEach(b => { const on = b.dataset.visOpt === v; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
}
if (typeof window !== "undefined") { window.applyVis = applyVis; window.visMode = visMode; }
document.addEventListener("click", e => { const b = e.target.closest("[data-vis-opt]"); if (!b) return; const v = b.dataset.visOpt; applyVis(v); toast(ttT(v === "sun" ? "陽光模式：字更黑、對比更高" : v === "red" ? "夜間紅光：不刺眼、保護夜視" : "回到一般顯示")); });
function applyTheme(mode) {
  const vis = visMode();
  const dark = vis === "red" || (vis !== "sun" && (mode === "dark" || (mode === "auto" && !!(_darkMQ && _darkMQ.matches))));
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#13160f" : "#16301f");
  document.querySelectorAll("[data-theme-opt]").forEach(b => b.classList.toggle("on", b.dataset.themeOpt === mode));
  document.querySelectorAll("[data-vis-opt]").forEach(b => { const on = b.dataset.visOpt === vis; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
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
  // 選中：兩排都用同一種外圈＋勾勾圖示（以前一個是細框、一個是文字「✓」）
  el.innerHTML = `<div class="accent-head">${ttT("PRO 徽章配色")}</div>
    <div class="proc-row">${PRO_STYLES.map((s, i) => `<button class="proc-sw${i === cb ? " on" : ""}" data-b="${i}" title="${ttT(s[3])}" aria-label="${ttT(s[3])}" aria-pressed="${i === cb}" style="background:linear-gradient(135deg,${s[0]},${s[1]});color:${s[2]}">PRO</button>`).join("")}</div>
    <div class="accent-head">${ttT("頭像框配色")}</div>
    <div class="proc-row">${PRO_FRAMES.map((s, i) => `<button class="acc-sw frame-sw${i === cf ? " on" : ""}" data-f="${i}" title="${ttT(s[1])}" aria-label="${ttT(s[1])}" aria-pressed="${i === cf}" style="box-shadow:0 0 0 3px ${s[0]} inset;color:${s[0]}">${i === cf ? ic("check") : ""}</button>`).join("")}</div>`;
  el.querySelectorAll(".proc-sw[data-b]").forEach(b => b.addEventListener("click", () => {
    localStorage.setItem("tt_pro_color", b.dataset.b); applyProColor(); renderProColor();
    if (typeof toast === "function") toast(ttT("已套用徽章配色"));
  }));
  el.querySelectorAll(".frame-sw[data-f]").forEach(b => b.addEventListener("click", () => {
    localStorage.setItem("tt_pro_frame", b.dataset.f); applyProColor(); renderProColor();
    if (typeof toast === "function") toast(ttT("已套用頭像框配色"));
  }));
}
// 共用個人卡頭部（「我的」頁與社群頁同一設計；chip 會 flex-wrap，放大字級也不跑版）
function ttProfileHero(prof, opts) {
  opts = opts || {};
  const esc = s => (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  const pro = typeof Premium !== "undefined" && Premium.isOn();
  const ps = (typeof petStats === "function") ? petStats() : null;
  const lvl = ps ? ps.level : 0;
  const av = prof.avatar_url
    ? `<img class="prof-av${pro ? " pro-av" : ""}" src="${esc(prof.avatar_url)}" alt="">`
    : `<div class="prof-av prof-av-ph${pro ? " pro-av" : ""}">${esc((prof.display_name || prof.handle || "?").slice(0, 1))}</div>`;
  let title = "";
  try { if (typeof achScore === "function") { const s = achScore(); const ci = (typeof ACH_TIER_IC !== "undefined" && typeof ic === "function") ? ic(ACH_TIER_IC[s.rankIdx]) : ""; title = `<span class="prof-title rkt-${s.rankIdx}">${ci} ${ttT(s.rank)}</span>`; } } catch (e) { /* */ }
  const lvChip = lvl ? `<span class="lv-chip lvt-${Math.min(lvl, 7)}">Lv.${lvl}</span>` : "";
  // Lv 與寵物一組
  const petHtml = ps ? `<div class="prof-pet">${lvChip}${typeof PET_ART !== "undefined" ? PET_ART.svg((ps.level || 1) - 1) : ps.emoji}<span class="prof-pet-t">${esc(petName() ? ps.name : ttT(ps.name))} · ${ttT("已走")} <b>${ps.km}</b> km</span></div>` : (lvChip ? `<div class="prof-pet">${lvChip}</div>` : "");
  let ach = "";
  if (opts.ach !== false) { try { if (typeof achScore === "function") { const s = achScore(); ach = `<button class="prof-ach" data-prof-ach="1" aria-label="${ttT("成就")} ${s.got}/${s.total} · ${ttT("成就分數")} ${s.score}">${ic("medal")} <b>${s.got}/${s.total}</b> · <b>${s.score}</b> ›</button>`; } } catch (e) { /* */ } }
  // 稱號與成就一組
  const achRow = (title || ach) ? `<div class="prof-achrow">${title}${ach}</div>` : "";
  return `<div class="prof-hero">${av}
    <div class="prof-hero-info">
      <div class="prof-name"><span class="prof-nm">${esc(prof.display_name || prof.handle)}</span>${pro ? ` <span class="pro-tag pro-id pro-mine">PRO</span>` : ""}</div>
      <div class="prof-handle">@${esc(prof.handle)}</div>
      ${petHtml}${achRow}
    </div>
  </div>`;
}
function bindProfAch(root) {
  (root || document).querySelectorAll('[data-prof-ach]').forEach(b => b.onclick = () => { const t = document.querySelector('.tab[data-view="pet"]'); if (t) t.click(); setTimeout(() => { if (typeof openAchTree === "function") openAchTree(); }, 260); });
}
if (typeof window !== "undefined") { window.ttProfileHero = ttProfileHero; window.bindProfAch = bindProfAch; }
// #8 modal 無障礙：dialog 語意＋Escape 關閉＋Tab 焦點鎖在 modal 內＋關閉後焦點歸位
function ttModalA11y(overlay, closeFn, opts) {
  if (!overlay) return () => { };
  opts = opts || {};
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  const prev = document.activeElement;
  const focusables = () => [...overlay.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent !== null);
  const first = opts.focus ? overlay.querySelector(opts.focus) : focusables()[0];
  if (first) setTimeout(() => { try { first.focus(); } catch (e) { /* */ } }, 40);
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); if (closeFn) closeFn(); return; }
    if (e.key !== "Tab") return;
    const f = focusables(); if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
  }
  overlay.addEventListener("keydown", onKey);
  return () => { overlay.removeEventListener("keydown", onKey); try { prev && prev.focus && prev.focus(); } catch (e) { /* */ } };
}
if (typeof window !== "undefined") window.ttModalA11y = ttModalA11y;
// 全域 Escape：關掉最上層的 [data-ov] 動態面板（成就 modal 自己已 preventDefault，這裡略過已處理的）
document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  const ovs = [...document.querySelectorAll("[data-ov]")].filter(m => m.getClientRects().length > 0);   // 不能用 offsetParent：覆蓋層是 position:fixed，offsetParent 永遠是 null，以前 Esc 一個都關不掉
  if (!ovs.length) return;
  const top = ovs[ovs.length - 1];
  const btn = top.querySelector('.sheet-close, .lb-close, .lb-x, .comp-x, [id$="Close"], button[aria-label="關閉"], button[aria-label="Close"]');
  if (btn) { e.preventDefault(); btn.click(); }
});
// 「我的」頂部：夥伴＋今年走了多少（沒登入也有個主角，不再一打開就是一條登入提示）
function meYearCard(loginHint) {
  const y = new Date().getFullYear(), recs = realRecords().filter(r => new Date(r.date).getFullYear() === y);
  const km = recs.reduce((s, r) => s + (r.distanceKm || 0), 0);
  const ps = typeof petStats === "function" ? petStats() : null;
  const art = (ps && typeof PET_ART !== "undefined") ? PET_ART.svg(ps.level - 1) : "";
  let rank = ""; try { const sc = achScore(); rank = `<button class="prof-ach" data-prof-ach="1">${ic(ACH_TIER_IC[sc.rankIdx])} ${ttT(sc.rank)} ›</button>`; } catch (e) { /* */ }
  return `<div class="me-card me-year">
    <div class="my-pet">${art}</div>
    <div class="my-body">
      <div class="my-h">${(() => { try { return new Intl.DateTimeFormat(ttLocale(), { year: "numeric" }).format(new Date()); } catch (e) { return y + " 年"; } })()}</div>
      <div class="my-big"><b>${km.toFixed(1)}</b> km<span>・${ttCount(recs.length, "trip")}</span></div>
      <div class="my-sub">${rank}</div>
    </div>
  </div>${loginHint ? `<button class="me-login" id="meCardLogin">${ic("backup")} ${loginHint} ›</button>` : ""}`;
}
// 我的分頁頂端：社群個人檔案摘要（頭像/名字/稱號/handle/寵物里程/成就）
async function renderMeProfileCard() {
  const el = $("#meProfileCard"); if (!el) return;
  if (typeof Supa === "undefined" || !Supa.ready() || typeof Auth === "undefined") { el.innerHTML = ""; return; }
  const sess = await Auth.session().catch(() => null);
  // 社群功能關掉時：登入只為了雲端備份，登入後這張卡就不用出現了
  if (socialHidden() || !sess) {
    el.innerHTML = meYearCard(sess ? "" : (socialHidden() ? ttT("登入一下，之後每趟都自動備份到雲端") : ttT("登入社群，看到自己的個人檔案")));
    const b = $("#meCardLogin"); if (b) b.addEventListener("click", () => { const t = document.querySelector('.tab[data-view="social"]'); if (t) t.click(); });
    bindProfAch(el);
    return;
  }
  const prof = await Auth.myProfile().catch(() => null);
  if (!prof) { el.innerHTML = `<div class="me-card me-card-guest" id="meCardLogin">${ttT("完成社群註冊以顯示個人檔案 ›")}</div>`; const b = $("#meCardLogin"); if (b) b.addEventListener("click", () => { const t = document.querySelector('.tab[data-view="social"]'); if (t) t.click(); }); return; }
  el.innerHTML = `<div class="me-card">${ttProfileHero(prof)}</div>`;
  bindProfAch(el);
}
// 社群功能開關（我的 → 外觀）：關掉＝收起社群分頁、小隊、揪團、分享到社群、好友比較、好友的夥伴。
// 只是藏入口，資料與登入都在（雲端備份仍要登入）。狀態存 tt_hide_social，開機時 index.html 就先套 class。
function socialHidden() { return document.documentElement.classList.contains("hide-social"); }
(function wireSocialToggle() {
  const cb = document.getElementById("socialToggle"); if (!cb) return;
  cb.checked = !socialHidden();
  cb.addEventListener("change", () => {
    const hide = !cb.checked;
    try { localStorage.setItem("tt_hide_social", hide ? "1" : "0"); } catch (e) { /* */ }
    document.documentElement.classList.toggle("hide-social", hide);
    renderMeProfileCard();
    toast(hide ? ttT("社群功能已收起") : ttT("社群功能回來了"));
  });
})();
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
  const saved = localStorage.getItem("tt_theme");
  const mode = saved === "dark" || saved === "auto" ? saved : "light";   // 預設淺色；選「跟隨系統」就照手機設定
  if (!_themeBound && _darkMQ) { const onSys = () => { if (localStorage.getItem("tt_theme") === "auto") applyTheme("auto"); }; if (_darkMQ.addEventListener) _darkMQ.addEventListener("change", onSys); else if (_darkMQ.addListener) _darkMQ.addListener(onSys); }
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
      document.documentElement.style.setProperty("--fs", b.dataset.fs); document.documentElement.toggleAttribute("data-fs-big", +b.dataset.fs >= 1.5); document.documentElement.toggleAttribute("data-fs-mid", +b.dataset.fs >= 1.35);
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
    const cur = TT_LANGS.find(x => x[0] === curLang) || TT_LANGS[0], lc = document.getElementById("langCur");
    if (lc) {
      lc.innerHTML = `<span class="lang-cur-n">${cur[2]}${cur[2] === cur[3] ? "" : ` <small>${cur[3]}</small>`}</span><button class="btn ghost lang-change" id="langChange" aria-expanded="false">${ttT("更換")}</button>`;
      const lb = document.getElementById("langChange");
      lb.addEventListener("click", () => { row.hidden = !row.hidden; lb.setAttribute("aria-expanded", row.hidden ? "false" : "true"); if (!row.hidden) { const sr = document.getElementById("langSearch"); if (sr) sr.focus({ preventScroll: true }); } });
    }
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

// ---------- 啟動 ----------
setTimeout(() => { const s = document.getElementById("splash"); if (s) s.remove(); }, 1700);
// 量測 header 高度供搜尋列吸頂用
function setHeaderH() { const h = document.querySelector(".app-header"); if (h) document.documentElement.style.setProperty("--hdr-h", h.offsetHeight + "px"); }
setHeaderH(); window.addEventListener("load", setHeaderH); window.addEventListener("resize", setHeaderH);
initTheme();
if (localStorage.getItem("tt_pet_stage") === null) localStorage.setItem("tt_pet_stage", petStageIndex(totalKm()));   // 既有里程不誤觸進化提示
// loadProfile() 移到 me.js 最後；探索列表的第一次 render() 在 explore.js 最後
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
      <div class="lang-gate-mark"><svg class="tt-logo" viewBox="0 0 48 48" aria-hidden="true"><circle cx="35" cy="12" r="5" fill="#f3e9c6"/><path d="M3 41 17 22l14 19Z" fill="#2f6b47"/><path d="M13 41 27 15l16 26Z" fill="#43905f"/><path d="m27 15-3.6 6.7L27 20l3.7 1.8Z" fill="#f4f1e6"/><path d="m17 22-2.3 3.2 2.3-.9 2.4 1Z" fill="#f4f1e6"/><path d="M27.5 21c-4.5 5-6.5 11-4.5 20" stroke="#e2b85c" stroke-width="2.6" fill="none" stroke-linecap="round"/></svg></div>
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
      document.documentElement.style.setProperty("--fs", b.dataset.fs); document.documentElement.toggleAttribute("data-fs-big", +b.dataset.fs >= 1.5); document.documentElement.toggleAttribute("data-fs-mid", +b.dataset.fs >= 1.35);
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
    { center: true, e: ic("mountain"), h: "嗨，歡迎來到循徑拾光", p: "花 30 秒帶你逛一圈，隨時可以跳過。" },
    { view: "social", sel: ".social-auth", e: ic("users"), h: "要雲端備份嗎？",
      p: "登入之後，每趟走完都會自動備份，換手機也不怕。現在不想弄就按「先略過」。", login: true },
    { view: "explore", sel: "#searchInput", e: ic("search"), h: "找步道",
      p: "打名字、地區，或「瀑布」「古道」這種關鍵字都行。" },
    { view: "explore", sel: ".toolbar .seg, .toolbar", e: ic("map"), h: "清單或地圖",
      p: "想用清單滑、還是在地圖上挑，這裡切。上面那排是幫你整理好的主題。" },
    { view: "explore", sel: "#trailList .card", e: ic("book"), h: "點進去看細節",
      p: "難度、路況、天氣、海拔、會遇到什麼動物、走完去哪吃，都在裡面。" },
    { view: "record", sel: "#btnStart", e: ic("pin"), h: "記錄健行",
      p: "出發按「開始」就好。鎖螢幕、山裡沒訊號，照樣記得到。" },
    { view: "pet", sel: "#petCard", e: ic("paw"), h: "你的山林夥伴",
      p: "一顆蛋，靠你走路長大。戳戳牠、餵牠、幫牠戴帽子，牠都會有反應。" },
    { view: "pet", sel: "#petFeed", e: ic("leaf"), h: "餵食與果實",
      p: "果實靠走路和每日任務賺，每天餵一次，牠就有精神。" },
    { view: "pet", sel: "#petBadges", e: ic("medal"), h: "成就",
      p: "里程、爬升、連續天數達標就解鎖勳章。拿到就是你的，不會不見。" },
    { view: "me", sel: "#meMonth", e: ic("calendar"), h: "健行日曆",
      p: "這個月走了幾天、幾公里，一眼看完。" },
    { view: "me", sel: "#meStats", e: ic("target"), h: "我的足跡",
      p: "從第一趟累積到現在的里程、爬升，都在這。" },
    { view: "me", sel: ".set-zone-title", e: ic("sliders"), h: "設定",
      p: "字太小、想換深色、要備份資料，往下找這裡。" },
    { center: true, e: ic("sparkle"), h: "逛完了", p: "挑一條步道，出門走走吧。", last: true },
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
    { sel: "#detailNav", e: ic("book"), h: "分頁", p: "概覽、路線、生態、周邊，點上面切換。", pre: tab("ov") },
    { sel: "#weatherBox", e: ic("sun"), h: "天氣", p: "步道那邊現在的天氣和一週預報，出門前瞄一眼。", pre: tab("rt") },
    hasGeo ? { sel: "#profileBox", e: ic("mountain"), h: "海拔剖面", p: "整條路的高低起伏。曲線越陡，腿越酸。", pre: tab("rt") } : null,
    { sel: "#btnOffline", e: ic("download"), h: "離線地圖", p: "山上常常沒訊號，出發前先把地圖存起來。", pre: tab("rt") },
    { sel: "#ecoBox", e: ic("leaf"), h: "生態", p: "這一帶常見的動植物，還能看附近真的有人拍到什麼。", pre: tab("ec") },
    { sel: ".link-row", e: ic("share"), h: "這一排", p: "導航、分享、加入比較，都在這。", pre: tab("ov") },
    { sel: "#btnGoRecord", e: ic("pin"), h: "記錄健行", p: "要走這條？按這裡直接開始記錄。", pre: tab("ov") },
  ], { scope: "#detailSheet" });
};

// 首次開啟小隊浮層：介紹小隊用途、建立、加入碼、與小隊同行。
window.ttCoachTeam = function (hasActive) {
  if (!document.querySelector('[data-ov="team"]')) return;
  window.ttCoach("tt_coach_team", [
    { center: true, e: ic("users"), h: "小隊", p: "和山友組隊，在記錄地圖上即時看到彼此的位置，一起安全同行。" },
    { sel: "#tmCreate", e: ic("plus"), h: "建立小隊", p: "取個隊名按「建立」，系統會給你一組加入碼，分享給隊友。" },
    { sel: "#tmJoin, #tmCode", e: ic("users"), h: "用加入碼加入", p: "拿到隊友的加入碼？輸入後按「加入」，就成為小隊的一員。" },
    hasActive ? { sel: ".team-live", e: ic("pin"), h: "與小隊同行", p: "打開後，隊員在記錄頁的地圖上就能看到彼此的即時定位。" } : null,
  ], { scope: '[data-ov="team"]' });
};

// 登入後首次點開各社群分頁：一頁一張小卡介紹該頁用途。
window.ttCoachSocial = function (sub) {
  if (document.body.dataset.view !== "social") return;
  const M = {
    friends: { flag: "tt_coach_soc_friends", e: ic("megaphone"), h: "動態", p: "看你追蹤的山友發的貼文，可以按讚、留言，或收藏他們的路線。" },
    explore: { flag: "tt_coach_soc_explore", e: ic("compass"), h: "探索", p: "探索其他山友公開的健行足跡與旅程，替下次出遊找靈感。" },
    search: { flag: "tt_coach_soc_search", e: ic("search"), h: "搜尋山友", p: "用名稱或 @帳號找到山友，追蹤他們就能在動態看到更新。" },
    notif: { flag: "tt_coach_soc_notif", e: ic("bell"), h: "通知", p: "有人按讚、留言、追蹤你，或小隊邀請，都會出現在這裡。" },
    me: { flag: "tt_coach_soc_me", e: ic("users"), h: "我的檔案", p: "你的個人檔案、發過的貼文和追蹤名單，也能在這裡編輯資料。" },
  };
  const c = M[sub]; if (!c) return;
  window.ttCoach(c.flag, [{ center: true, e: c.e, h: c.h, p: c.p }], {});
};

// 首次進記錄頁（閒置）：介紹即時軌跡地圖與開始鈕。
window.ttCoachRecord = function () {
  if (document.body.dataset.view !== "record") return;
  window.ttCoach("tt_coach_record", [
    { sel: "#recMap", e: ic("map"), h: "記錄地圖", p: "開始之後，走過的路會一路畫在地圖上。" },
    { sel: "#btnStart", e: ic("play"), h: "記錄健行", p: "出發按「開始」，走完按「結束」，就存成一筆紀錄。" },
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
