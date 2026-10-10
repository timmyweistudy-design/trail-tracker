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
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  megaphone: '<path d="M3 10.5v3l15 5.5V5L3 10.5Z"/><path d="M7.5 15l1 4.5h3l-.8-3.4M21 9.5v5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  backpack: '<path d="M7 8a5 5 0 0 1 10 0v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V8Z"/><path d="M10 3.5h4M9 13h6v4H9z"/>',
  sunset: '<path d="M4 18h16M7 14a5 5 0 0 1 10 0"/><path d="M12 4v4m-6.4.6 2 2m10.8-2-2 2M3 14h2m14 0h2"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8 8 0 1 0 11 11Z"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h16a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
  phone: '<path d="M5 3.5h3.2l1.6 4.3-2.1 1.5a11 11 0 0 0 7 7l1.5-2.1 4.3 1.6V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.1 1.5 1.5 0 0 1 5 3.5Z"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6 1.3A3.5 3.5 0 0 1 17 18H7Z"/>',
  rain: '<path d="M7 14a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6 1.3A3.5 3.5 0 0 1 17 14H7Z"/><path d="m9 17-1 3m5-3-1 3m5-3-1 3"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  signal: '<path d="M4 20v-3M9 20v-7M14 20v-11M19 20V5"/><path d="M3 4l18 17"/>',   // 沒訊號：訊號格＋斜線
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
// 日出：同一套 NOAA 方程式（日落往回推）。步道頁「出發前」用來算最晚出發時間
function sunriseAt(lat, lon, date) {
  const set = sunsetAt(lat, lon, date); if (!set) return null;
  const rad = Math.PI / 180, d = date || new Date();
  const noon = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  const n = Math.round(noon.getTime() / 864e5 + 2440587.5 - 2451545.0 + 0.0008), Js = n - lon / 360;
  const M = (357.5291 + 0.98560028 * Js) % 360, C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const lam = (M + C + 180 + 102.9372) % 360, Jt = 2451545.0 + Js + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lam * rad);
  const sd = Math.sin(lam * rad) * Math.sin(23.4397 * rad), cd = Math.cos(Math.asin(sd));
  const cw = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * sd) / (Math.cos(lat * rad) * cd);
  if (cw > 1 || cw < -1) return null;
  return new Date((Jt - Math.acos(cw) / rad / 360 - 2440587.5) * 864e5);
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
  const hs = typeof ttCount === "function" ? ttCount(h, "hour") : `${h} ${ttT("小時")}`;   // 英文等要分單複數（1 hour／2 hours）
  return mm ? `${hs} ${mm} ${ttT("分")}` : hs;
}
function toast(msg, opts) {
  const t = $("#toast"); t.textContent = msg; t.classList.toggle("top", !!(opts && opts.top)); t.classList.add("show");   // top：底部會蓋住內容時改從上方出現
  if (opts && opts.icon) { const s = document.createElement("span"); s.className = "toast-ic"; s.innerHTML = opts.icon; t.appendChild(s); }   /* icon：程式自己給的圖（例如當季果實），不是使用者內容 */
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
      const petSocial = () => {
        Pets.claimGifts().then(n => { if (n > 0) { if (typeof petGiftBerries === "function") petGiftBerries(n); else { toast(`${ttT("收到好友送的果實")} +${n}`, { icon: BERRY_SVG }); renderPet(); } } });   // 寵物新一輪 #20：果實從舞台上方飄下來
        Pets.renderFriends();   // 好友清單＋朋友的夥伴來串門子（清單 3 分鐘快取；串門子成功才記今天來過）
        if (Pets.claimItems) Promise.all([Pets.claimItems(), Pets.claimVisits()]).then(([a, b]) => { if (a + b > 0 && document.body.dataset.view === "pet") renderPet(); });   // R12：好友送的小東西、回訪（還沒跑 phase41 時安靜略過）
      };
      if (typeof Pets !== "undefined") petSocial();
      /* R11：開機後馬上進夥伴頁時社群模組還沒載完，以前好友、串門子整個跳過；改成等它載完、人還在夥伴頁就補做 */
      else if (window.loadSocial) window.loadSocial().then(() => { if (typeof Pets !== "undefined" && document.body.dataset.view === "pet") petSocial(); });
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
// NLSC 電子地圖：z15 以下用開放資料版 EMAP5_OPENDATA（和一般 EMAP 是同一張圖，網址要和離線下載一致才吃得到快取），
// z16 以上線上看一般 EMAP（細節多）；離線抓不到 z16+ 時，改拿已存的 z15 那張放大裁切，不會整片空白。（2026-10-10 授權檢查）
const _NlscTopo = L.TileLayer.extend({
  getTileUrl(c) {
    const z = this._getZoomForUrl();
    return z <= 15 ? Offline.tileUrl(z, c.x, c.y) : `https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/${z}/${c.y}/${c.x}`;
  },
  createTile(c, done) {
    const tile = document.createElement("div"), img = document.createElement("img"), z = this._getZoomForUrl();
    tile.style.overflow = "hidden"; img.alt = ""; img.setAttribute("role", "presentation");
    img.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;max-width:none;";
    let fell = false;
    img.onload = () => done(null, tile);
    img.onerror = e => {
      if (fell || z <= 15) return done(e, tile);
      fell = true; const d = z - 15, k = 2 ** d, px = c.x >> d, py = c.y >> d;
      img.style.width = img.style.height = k * 100 + "%";
      img.style.left = -(c.x - px * k) * 100 + "%"; img.style.top = -(c.y - py * k) * 100 + "%";
      img.src = Offline.tileUrl(15, px, py);
    };
    img.src = this.getTileUrl(c); tile.appendChild(img);
    return tile;
  },
});
function baseTopo() { return new _NlscTopo("", { attribution: "© 內政部國土測繪中心", maxZoom: 19, maxNativeZoom: 18, detectRetina: true }); }
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
// 照片淡入（優化輪 4 C4／G2）：載好的圖加 .ld，CSS 從流動淡光淡入；已經在快取裡的（complete）也補上
document.addEventListener("load", e => { const t = e.target; if (t && t.tagName === "IMG" && t.closest(".fc-shot, .fc-vid, .eco-ob, .det-photos")) t.classList.add("ld"); }, true);
document.addEventListener("error", e => { const t = e.target; if (t && t.tagName === "IMG" && t.closest(".fc-shot, .fc-vid, .eco-ob, .det-photos")) t.classList.add("ld"); }, true);
new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.querySelectorAll) n.querySelectorAll(".fc-shot img, .fc-vid img, .eco-ob img, .det-photos img").forEach(i => { if (i.complete && i.naturalWidth) i.classList.add("ld"); }); }).observe(document.body, { childList: true, subtree: true });
