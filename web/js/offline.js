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

  async function download(tiles, onProgress) {
    const cache = await caches.open(TILE_CACHE);
    let done = 0, ok = 0;
    for (const url of tiles) {
      try {
        if (await cache.match(url)) { ok++; }
        else {
          const res = await fetch(url, { mode: "cors" });
          if (res.ok) { await cache.put(url, res.clone()); ok++; }
        }
      } catch { /* 單張失敗略過 */ }
      done++;
      if (onProgress) onProgress(done, tiles.length, ok);
      await new Promise(r => setTimeout(r, 45));   // 禮貌節流，善待公用圖磚伺服器
    }
    return { total: tiles.length, ok };
  }

  async function cachedCount() {
    try { return (await (await caches.open(TILE_CACHE)).keys()).length; } catch { return 0; }
  }
  async function clear() { try { await caches.delete(TILE_CACHE); } catch { /* ignore */ } }

  return { tileList, planZoom, bboxFor, download, cachedCount, clear };
})();
