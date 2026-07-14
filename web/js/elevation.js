// 地形海拔校正(DEM)：用準確的水平軌跡查地面真實高度，重算爬升/下降/海拔。GPS 高度太雜，這比它準很多。
//
// 主要資料源：AWS terrarium 高程圖磚（z14，約 30 m 網格，3D 地圖已在用、SW 也已快取 → 離線可算）。
// 後備：Open-Meteo Elevation API（90 m 網格，需要網路）。
// 為什麼換：拿 2183 條步道的官方爬升當基準實測，中位絕對誤差 11.1% → 7.5%，
// 且修掉了 90 m DEM 的爆表案例（知本越嶺古道官方 250 m，Open-Meteo 算出 549 m，terrarium 295 m）。
const Elevation = (() => {
  const API = "https://api.open-meteo.com/v1/elevation";
  // URL 形式必須與 app.js 的 _TERR_URL 一致，否則快取鍵不同 → 吃不到記錄時預載的那批圖磚（會重抓）
  const TILE = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium";
  const Z = 14;   // 落在預載的 z12–15 範圍內

  // 降取樣到 ≤max 點（保留首尾），減少請求數
  function downsample(track, max) {
    const pts = (track || []).filter(p => p && p.lat != null && p.lon != null);
    if (pts.length <= max) return pts;
    const step = (pts.length - 1) / (max - 1), out = [];
    for (let i = 0; i < max; i++) out.push(pts[Math.round(i * step)]);
    return out;
  }

  async function lookupChunk(pts) {
    const lat = pts.map(p => p.lat.toFixed(5)).join(",");
    const lon = pts.map(p => p.lon.toFixed(5)).join(",");
    const r = await fetch(`${API}?latitude=${lat}&longitude=${lon}`);
    if (!r.ok) throw new Error("elev " + r.status);
    const j = await r.json();
    return j.elevation || [];
  }
  async function lookupApi(pts) {
    const out = [];
    for (let i = 0; i < pts.length; i += 100) {
      out.push(...await lookupChunk(pts.slice(i, i + 100)));
      if (i + 100 < pts.length) await new Promise(r => setTimeout(r, 250));
    }
    return out;
  }

  // ── terrarium 高程圖磚 ──
  // 高度(m) = R*256 + G + B/256 - 32768（Mapzen terrarium 編碼）
  function decode(r, g, b) { return (r * 256 + g + b / 256) - 32768; }
  // 經緯度 → 圖磚座標（Web Mercator，含圖磚內像素位置）
  function tileXY(lat, lon) {
    const n = 2 ** Z;
    const la = lat * Math.PI / 180;
    return {
      fx: (lon + 180) / 360 * n,
      fy: (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n,
    };
  }
  const _tiles = new Map();   // 跨次校正共用（圖磚是靜態的）；一條軌跡通常只跨幾張
  const _ready = new Map();   // 已解碼完成的圖磚（供記錄中同步取樣，不能等 await）
  async function tile(x, y) {
    const k = x + "/" + y;
    if (_tiles.has(k)) return _tiles.get(k);
    // LRU 淘汰最舊的幾張（每張解碼後 128 KB）。
    // ⚠️ 不可以整包 clear()：記錄中背景持續取樣（recorder 的 groundAlt）與行程回顧的坡度著色共用這份快取，
    //    使用者一邊記錄一邊看舊行程時，整包清空會把「記錄中正在用的那張圖磚」也砍掉 → 即時爬升瞬間掉回 GPS。
    const CAP = 48;
    if (_tiles.size > CAP) {
      const drop = [..._tiles.keys()].slice(0, _tiles.size - CAP + 8);   // Map 依插入序 → 前面的最舊
      for (const k of drop) { _tiles.delete(k); _ready.delete(k); }
    }
    const p = (async () => {
      const r = await fetch(`${TILE}/${Z}/${x}/${y}.png`);   // SW 走圖磚快取 → 預載過/看過的路段離線也命中
      if (!r.ok) throw new Error("tile " + r.status);
      const bmp = await createImageBitmap(await r.blob());
      const cv = document.createElement("canvas");
      cv.width = bmp.width; cv.height = bmp.height;
      const cx = cv.getContext("2d", { willReadFrequently: true });
      cx.drawImage(bmp, 0, 0);
      const d = cx.getImageData(0, 0, bmp.width, bmp.height).data;
      // 解碼後只留高度（Int16 公尺）：RGBA 一張 256 KB → 這樣 128 KB，查值也不用每次算
      const e = new Int16Array(bmp.width * bmp.height);
      for (let i = 0; i < e.length; i++) e[i] = Math.round(decode(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]));
      const t = { e, w: bmp.width };
      _ready.set(k, t);
      return t;
    })();
    // 失敗的 Promise 不可以留在快取：訊號不穩時抓失敗一次，之後同一塊區域就永遠拿不到地形
    // （使用者本來就一直走在那張圖磚裡）→ 即時爬升退回雜訊大的 GPS、結算校正整批退回 API。
    p.catch(() => { if (_tiles.get(k) === p) _tiles.delete(k); });
    _tiles.set(k, p);
    return p;
  }

  // 記錄中即時取樣：圖磚已在記憶體→同步回傳地面高度；否則背景抓、這次先回 null（呼叫端退回 GPS 高度）。
  // 目的：記錄中的即時爬升與結算的 DEM 校正用同一份資料，數字不會前後打架。
  function sample(lat, lon) {
    if (lat == null || lon == null || typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
    const { fx, fy } = tileXY(lat, lon);
    const tx = Math.floor(fx), ty = Math.floor(fy), k = tx + "/" + ty;
    const t = _ready.get(k);
    if (!t) { tile(tx, ty).catch(() => {}); return null; }   // 首次進入這張圖磚 → 背景抓，不擋記錄
    const px = Math.min(255, Math.floor((fx % 1) * 256));
    const py = Math.min(255, Math.floor((fy % 1) * 256));
    return t.e[py * t.w + px];
  }
  async function lookupTiles(pts) {
    const at = pts.map(p => {
      const { fx, fy } = tileXY(p.lat, p.lon);
      return { tx: Math.floor(fx), ty: Math.floor(fy), px: Math.min(255, Math.floor((fx % 1) * 256)), py: Math.min(255, Math.floor((fy % 1) * 256)) };
    });
    // 先平行抓齊所有「不重複」的圖磚（逐點循序等待會把延遲乘上點數）
    const need = [...new Set(at.map(a => a.tx + "/" + a.ty))];
    await Promise.all(need.map(k => { const [x, y] = k.split("/"); return tile(+x, +y); }));
    const out = [];
    for (const a of at) {
      const t = await tile(a.tx, a.ty);
      out.push(t.e[a.py * t.w + a.px]);
    }
    return out;
  }
  // 圖磚優先（較準、可離線），失敗才退回 API
  async function lookup(pts) {
    if (typeof createImageBitmap === "function" && typeof document !== "undefined") {
      try {
        const e = await lookupTiles(pts);
        if (e.some(v => isFinite(v))) return e;
      } catch (err) { /* 圖磚拿不到 → 退回 API */ }
    }
    return lookupApi(pts);
  }

  // 從 DEM 高度序列重算。先 3 點中值壓量化毛刺，再 3 點移動平均進一步去噪，
  // 最後用「遲滯門檻(3m)」累積——只有離開參考點超過 3m 才計，避免 DEM 量化雜訊灌爆爬升，更接近實際。
  function recompute(elevs) {
    const v = (elevs || []).filter(e => typeof e === "number");
    if (v.length < 2) return null;
    const med3 = (a, b, c) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
    let s = v.map((e, i) => (i > 0 && i < v.length - 1) ? med3(v[i - 1], e, v[i + 1]) : e);
    s = s.map((e, i) => (i > 0 && i < s.length - 1) ? (s[i - 1] + e + s[i + 1]) / 3 : e);   // 再平滑一次
    let ascent = 0, descent = 0, ref = s[0], high = s[0], low = s[0];
    const DB = 3;   // 遲滯門檻（公尺）
    for (const e of s) {
      if (e > high) high = e; if (e < low) low = e;
      const dz = e - ref;
      if (Math.abs(dz) >= DB) { if (dz > 0) ascent += dz; else descent += -dz; ref = e; }
    }
    return { ascent: Math.round(ascent), descent: Math.round(descent), altHigh: Math.round(high), altLow: Math.round(low) };
  }

  // 依 gap 標記切段（暫停→繼續的位移不相連，不可把跳段高度差算進爬升）
  function segsOf(track) {
    if (typeof trackSegments === "function") return trackSegments(track);
    return [track || []];
  }
  // 軌跡水平長度（公尺），供決定取樣密度
  function lengthOf(pts) {
    if (typeof haversine !== "function") return 0;
    let s = 0;
    for (let i = 1; i < pts.length; i++) s += haversine(pts[i - 1], pts[i]);
    return s;
  }

  async function correct(track) {
    try {
      const segs = segsOf(track).filter(s => s && s.length > 1);
      if (!segs.length) return null;
      // 取樣密度依總長度調整：約每 20 m 一點，上限 500 點（長程更準、短程不浪費）
      const totalLen = segs.reduce((s, seg) => s + lengthOf(seg), 0);
      const budget = Math.max(100, Math.min(500, Math.round(totalLen / 20) || 200));
      let ascent = 0, descent = 0, high = -Infinity, low = Infinity, any = false;
      for (const seg of segs) {
        const share = Math.max(8, Math.round(budget * (lengthOf(seg) / (totalLen || 1))) || budget);
        const pts = downsample(seg, share);
        if (pts.length < 2) continue;
        const r = recompute(await lookup(pts));
        if (!r) continue;
        any = true;
        ascent += r.ascent; descent += r.descent;
        high = Math.max(high, r.altHigh); low = Math.min(low, r.altLow);
      }
      if (!any) return null;
      return { ascent: Math.round(ascent), descent: Math.round(descent), altHigh: Math.round(high), altLow: Math.round(low) };
    } catch (e) { if (typeof console !== "undefined") console.warn("elev correct failed", e && e.message); return null; }
  }

  // 整條軌跡的地形高度（給坡度著色用）：一次抓齊圖磚，回傳與輸入等長的高度陣列（失敗回 null）
  async function profile(pts) {
    const p = (pts || []).filter(x => x && x.lat != null && x.lon != null);
    if (p.length < 2) return null;
    try {
      const e = await lookup(p);
      return (e && e.length === p.length && e.some(v => isFinite(v))) ? e : null;
    } catch (err) { return null; }
  }

  return { correct, downsample, recompute, decode, tileXY, sample, profile };
})();
if (typeof module !== "undefined") module.exports = Elevation;
