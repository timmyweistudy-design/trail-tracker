// 步道照片：用 Wikimedia Commons 地理搜尋（免金鑰、有 CORS、CC 授權）依步道座標找附近照片。
// 結果以 localStorage 快取 30 天。
const Photos = (() => {
  const TTL = 30 * 864e5;
  const CKEY = "photoc_";
  const SKIP = /map|diagram|plan|svg|logo|icon|sign|路線圖|地圖/i;   // 排除地圖/示意圖

  function cacheGet(id) {
    try { const c = JSON.parse(localStorage.getItem(CKEY + id)); if (c && Date.now() - c.ts < TTL) return c.url; } catch { /* */ }
    return undefined;
  }
  function cacheSet(id, url) { try { localStorage.setItem(CKEY + id, JSON.stringify({ ts: Date.now(), url })); } catch { /* */ } }

  async function forTrail(trail) {
    if (!trail.lat) return null;
    const cached = cacheGet(trail.id);
    if (cached !== undefined) return cached;
    let url = null;
    try {
      const api = "https://commons.wikimedia.org/w/api.php?action=query&generator=geosearch" +
        `&ggscoord=${trail.lat}%7C${trail.lon}&ggsradius=5000&ggslimit=12&ggsnamespace=6` +
        "&prop=imageinfo&iiprop=url%7Cmime&iiurlwidth=900&format=json&origin=*";
      const res = await fetch(api);
      if (res.ok) {
        const pages = ((await res.json()).query || {}).pages || {};
        const imgs = Object.values(pages)
          .filter(p => p.imageinfo && p.imageinfo[0].mime && p.imageinfo[0].mime.startsWith("image/")
            && !SKIP.test(p.title || ""))
          .map(p => p.imageinfo[0].thumburl || p.imageinfo[0].url);
        if (imgs.length) url = imgs[0];
      }
    } catch { /* 無照片 */ }
    cacheSet(trail.id, url);
    return url;
  }

  return { forTrail };
})();
