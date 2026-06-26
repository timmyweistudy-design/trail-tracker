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
  function cacheSet(id, url) { try { localStorage.setItem(CKEY + id, JSON.stringify({ ts: Date.now(), url })); } catch { /* */ } }

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

  return { forTrail };
})();
