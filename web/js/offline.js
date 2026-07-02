// 離線地圖：下載/快取指定範圍的 OSM 圖磚，供山區無網路時使用。
// 圖磚存在 Cache Storage 'tt-tiles'，Service Worker 會優先從此快取取用。
const Offline = (() => {
  const TILE_CACHE = "tt-tiles";
  // 與 app.js 的 tileLayer 用同一組 URL（單一網域，確保下載與顯示的快取鍵一致）
  // OpenTopoMap 戶外地形圖（固定 a 子網域，讓下載與顯示快取鍵一致）
  const tileUrl = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${y}/${x}`;

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

  return { tileList, planZoom, bboxFor, download, cachedCount, clear, enforceCap };
})();
