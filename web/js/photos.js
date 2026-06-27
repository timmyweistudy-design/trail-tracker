// 步道照片：用 Wikimedia Commons 以「步道名稱」搜尋檔案，並要求照片標題確實含該步道名（核心地名），
// 才採用 → 避免抓到旁邊的草/蝴蝶等不相關照片。寧可不顯示也不放錯的。CC 授權、免金鑰。
const Photos = (() => {
  const TTL = 30 * 864e5;
  const CKEY = "photon_";
  const BAD = /\.(svg|djvu|pdf|tif|tiff|gif)$|map|diagram|地圖|路線圖|示意圖|logo|icon/i;
  // 去掉步道常見後綴，取核心地名（如「象山步道」→「象山」）
  function core(name) {
    return name.replace(/(國家步道|自然步道|親山步道|登山步道|登山路線|環狀步道|生態步道|步道|古道|步徑|越嶺道|越嶺|親山|登山|路線|步行|線)+$/g, "") || name;
  }

  function cacheGet(id) {
    try { const c = JSON.parse(localStorage.getItem(CKEY + id)); if (c && Date.now() - c.ts < TTL) return c.url; } catch { /* */ }
    return undefined;
  }
  // 容量管理：寫入失敗(配額滿)時，淘汰最舊的 1/3 照片快取再重試
  function evictPhotos() {
    const ks = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith("photon_") || k.startsWith("photonm_"))) {
        let ts = 0; try { ts = (JSON.parse(localStorage.getItem(k)) || {}).ts || 0; } catch { /* */ }
        ks.push([k, ts]);
      }
    }
    ks.sort((a, b) => a[1] - b[1]);
    ks.slice(0, Math.max(1, Math.ceil(ks.length / 3))).forEach(([k]) => localStorage.removeItem(k));
  }
  function safeSet(key, val) {
    try { localStorage.setItem(key, val); }
    catch { try { evictPhotos(); localStorage.setItem(key, val); } catch { /* 仍滿就放棄 */ } }
  }
  function cacheSet(id, url) { safeSet(CKEY + id, JSON.stringify({ ts: Date.now(), url })); }

  async function forTrail(trail) {
    if (!trail.name) return null;
    const cached = cacheGet(trail.id);
    if (cached !== undefined) return cached;
    let url = null;
    const key = core(trail.name);
    try {
      const api = "https://commons.wikimedia.org/w/api.php?action=query&generator=search" +
        `&gsrsearch=${encodeURIComponent(trail.name)}&gsrnamespace=6&gsrlimit=10` +
        "&prop=imageinfo&iiprop=url%7Cmime&iiurlwidth=900&format=json&origin=*";
      const res = await fetch(api);
      if (res.ok) {
        const pages = ((await res.json()).query || {}).pages || {};
        const hit = Object.values(pages).find(p => {
          const title = (p.title || "").replace(/^File:/, "");
          const ii = p.imageinfo && p.imageinfo[0];
          return ii && ii.mime && ii.mime.startsWith("image/") && !BAD.test(title)
            && (title.includes(trail.name) || (key.length >= 2 && title.includes(key)));
        });
        if (hit) url = hit.imageinfo[0].thumburl || hit.imageinfo[0].url;
      }
    } catch { /* 無照片 */ }
    cacheSet(trail.id, url);
    return url;
  }

  // 多張照片（給 Hero 輪播）；同一搜尋取多個符合的命中
  async function forTrailMulti(trail, n = 5) {
    if (!trail.name) return [];
    const mk = "photonm_" + trail.id;
    try { const c = JSON.parse(localStorage.getItem(mk)); if (c && Date.now() - c.ts < TTL) return c.urls; } catch { /* */ }
    const key = core(trail.name); const urls = [];
    try {
      const api = "https://commons.wikimedia.org/w/api.php?action=query&generator=search" +
        `&gsrsearch=${encodeURIComponent(trail.name)}&gsrnamespace=6&gsrlimit=20` +
        "&prop=imageinfo&iiprop=url%7Cmime&iiurlwidth=900&format=json&origin=*";
      const res = await fetch(api);
      if (res.ok) {
        const pages = ((await res.json()).query || {}).pages || {};
        for (const p of Object.values(pages)) {
          const title = (p.title || "").replace(/^File:/, "");
          const ii = p.imageinfo && p.imageinfo[0];
          if (ii && ii.mime && ii.mime.startsWith("image/") && !BAD.test(title)
            && (title.includes(trail.name) || (key.length >= 2 && title.includes(key)))) {
            urls.push(ii.thumburl || ii.url);
            if (urls.length >= n) break;
          }
        }
      }
    } catch { /* */ }
    safeSet(mk, JSON.stringify({ ts: Date.now(), urls }));
    return urls;
  }

  return { forTrail, forTrailMulti };
})();
