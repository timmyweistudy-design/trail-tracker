// 離線地圖：下載/快取指定範圍的 OSM 圖磚，供山區無網路時使用。
// 圖磚存在 Cache Storage 'tt-tiles'，Service Worker 會優先從此快取取用。
const Offline = (() => {
  const TILE_CACHE = "tt-tiles";
  // 與 app.js baseTopo 用同一組 URL（NLSC 台灣官方電子地圖；下載與顯示快取鍵必須完全一致）。
  // 免金鑰、座標 z/y/x。（Esri 授權端點無地形 raster，故底圖改 NLSC。）
  const tileUrl = (z, x, y) => `https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/${z}/${y}/${x}`;

  const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
  const lat2y = (lat, z) => {
    const r = lat * Math.PI / 180;
    return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z);
  };

  function tileList(bbox, zmin, zmax) {     // bbox = {n, s, e, w}
    const tiles = [];
    for (let z = zmin; z <= zmax; z++) {
      const xs = [lon2x(bbox.w, z), lon2x(bbox.e, z)];
      const ys = [lat2y(bbox.n, z), lat2y(bbox.s, z)];
      for (let x = Math.min(...xs); x <= Math.max(...xs); x++)
        for (let y = Math.min(...ys); y <= Math.max(...ys); y++)
          tiles.push(tileUrl(z, x, y));
    }
    return tiles;
  }

  // 通用版：可指定圖磚 URL 產生器（供 3D 預載衛星＋地形圖磚用）
  function tileListUrl(bbox, zmin, zmax, urlFn) {
    const tiles = [];
    for (let z = zmin; z <= zmax; z++) {
      const xs = [lon2x(bbox.w, z), lon2x(bbox.e, z)];
      const ys = [lat2y(bbox.n, z), lat2y(bbox.s, z)];
      for (let x = Math.min(...xs); x <= Math.max(...xs); x++)
        for (let y = Math.min(...ys); y <= Math.max(...ys); y++)
          tiles.push(urlFn(z, x, y));
    }
    return tiles;
  }
  // 自動選擇縮放範圍，讓總圖磚數不過大
  function planZoom(bbox) {
    let zmax = 16;
    while (zmax > 13 && tileList(bbox, 13, zmax).length > 700) zmax--;
    return { zmin: 13, zmax };
  }

  function bboxFor(trail, marginDeg = 0.012) {
    const pts = (trail.entrances && trail.entrances.length)
      ? trail.entrances.map(e => [e.lat, e.lon]) : [[trail.lat, trail.lon]];
    const lats = pts.map(p => p[0]), lons = pts.map(p => p[1]);
    return {
      n: Math.max(...lats) + marginDeg, s: Math.min(...lats) - marginDeg,
      e: Math.max(...lons) + marginDeg, w: Math.min(...lons) - marginDeg,
    };
  }

  // 併發下載（Esri 商用圖磚伺服器，5 併發沒問題）：全台 6000 張從 ~15 分鐘縮到 1–2 分鐘
  async function download(tiles, onProgress) {
    const cache = await caches.open(TILE_CACHE);
    let done = 0, ok = 0, bytes = 0, idx = 0;
    async function worker() {
      while (idx < tiles.length) {
        const url = tiles[idx++];
        try {
          if (await cache.match(url)) { ok++; }   // 已快取過的不重複計流量
          else {
            const res = await fetch(url, { mode: "cors" });
            if (res.ok) {
              const buf = await res.clone().arrayBuffer();   // 實際大小，供 MB 額度計算
              bytes += buf.byteLength;
              await cache.put(url, res); ok++;
            }
          }
        } catch { /* 單張失敗略過 */ }
        done++;
        if (onProgress) onProgress(done, tiles.length, ok);
      }
    }
    await Promise.all(Array.from({ length: Math.min(5, tiles.length || 1) }, worker));
    enforceCap().catch(() => { });   // 下載完順手控管快取上限
    return { total: tiles.length, ok, bytes, mb: bytes / 1048576 };
  }

  // 圖磚快取上限：只進不出會慢慢撐爆手機儲存。超過上限刪最舊的（Cache keys 依寫入順序）
  const TILE_CAP = 6000;   // 約 120 MB
  async function enforceCap(max = TILE_CAP) {
    try {
      const cache = await caches.open(TILE_CACHE);
      const keys = await cache.keys();
      const excess = keys.length - max;
      for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
    } catch { /* ignore */ }
  }

  async function cachedCount() {
    try { return (await (await caches.open(TILE_CACHE)).keys()).length; } catch { return 0; }
  }
  async function clear() { try { await caches.delete(TILE_CACHE); } catch { /* ignore */ } }

  // ---- 離線地圖包匯出/匯入（.ttmap）----
  // 格式：8 bytes（魔數 "TTMP" + 索引長度）+ JSON 索引 + 圖磚原始位元組串接。
  // 用途：把下載好的圖磚存成一個檔案備份，或傳給朋友/另一台裝置匯入，不必重新下載。
  const MAGIC = 0x54544d50;   // "TTMP"
  async function exportPack(onProgress) {
    const cache = await caches.open(TILE_CACHE);
    const keys = await cache.keys();
    if (!keys.length) return null;
    const parts = [], index = [];
    let off = 0, done = 0;
    for (const req of keys) {
      try {
        const res = await cache.match(req); if (!res) continue;
        const buf = await res.arrayBuffer();
        index.push({ u: req.url, o: off, l: buf.byteLength });
        parts.push(buf); off += buf.byteLength;
      } catch { /* 單張略過 */ }
      done++;
      if (onProgress) onProgress(done, keys.length);
    }
    const head = new TextEncoder().encode(JSON.stringify({ v: 1, tiles: index }));
    const lenBuf = new ArrayBuffer(8);
    const dv = new DataView(lenBuf); dv.setUint32(0, MAGIC); dv.setUint32(4, head.byteLength);
    return { blob: new Blob([lenBuf, head, ...parts], { type: "application/octet-stream" }), count: index.length, bytes: off };
  }
  async function importPack(file, onProgress) {
    const dv = new DataView(await file.slice(0, 8).arrayBuffer());
    if (dv.getUint32(0) !== MAGIC) throw new Error("badformat");
    const hl = dv.getUint32(4);
    const head = JSON.parse(new TextDecoder().decode(await file.slice(8, 8 + hl).arrayBuffer()));
    const cache = await caches.open(TILE_CACHE);
    const base = 8 + hl;
    let done = 0;
    for (const t of (head.tiles || [])) {
      try {
        const buf = await file.slice(base + t.o, base + t.o + t.l).arrayBuffer();
        await cache.put(t.u, new Response(buf, { headers: { "Content-Type": "image/jpeg" } }));
      } catch { /* 單張略過 */ }
      done++;
      if (onProgress) onProgress(done, head.tiles.length);
    }
    enforceCap().catch(() => { });
    return done;
  }

  return { tileList, tileListUrl, planZoom, bboxFor, download, cachedCount, clear, enforceCap, exportPack, importPack };
})();
