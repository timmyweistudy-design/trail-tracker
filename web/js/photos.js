// 步道照片（每張都帶作者＋授權 credit，CC 合規）：用 Wikimedia Commons 以「步道名稱」搜尋檔案，並要求照片標題確實含該步道名（核心地名），
// 才採用 → 避免抓到旁邊的草/蝴蝶等不相關照片。寧可不顯示也不放錯的。CC 授權、免金鑰。
const Photos = (() => {
  const TTL = 30 * 864e5;
  // 公告/告示牌/施工說明也排除：草嶺古道曾經抓到一張「大里段施工公告」當封面，整頁像佈告欄
  const BAD = /\.(svg|djvu|pdf|tif|tiff|gif)$|map|diagram|地圖|路線圖|示意圖|logo|icon|公告|告示|施工|封閉|管制|禁止|注意事項|說明牌|看板|指示牌|標示牌|sign\b|notice|signboard|poster/i;
  // 去掉步道常見後綴，取核心地名（如「象山步道」→「象山」）
  function core(name) {
    return name.replace(/(國家步道|自然步道|親山步道|登山步道|登山路線|環狀步道|生態步道|步道|古道|步徑|越嶺道|越嶺|親山|登山|路線|步行|線)+$/g, "") || name;
  }

  // 照片說明也要看：草嶺古道那張檔名是「草嶺古道入口 不准你走！」，只有說明寫著「施工公告」
  const descOf = ii => String((ii && ii.extmetadata && ii.extmetadata.ImageDescription && ii.extmetadata.ImageDescription.value) || "").replace(/<[^>]+>/g, "");
  // 容量管理：寫入失敗(配額滿)時，淘汰最舊的 1/3 照片快取再重試
  function evictPhotos() {
    const ks = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("photon")) {   // photon_ / photonm_ / photonm2_ 都算
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

  // Wikimedia CC 授權要求標「作者＋授權條款」（不能只寫來源）。從 extmetadata 取作者/授權組 credit。
  function parseCredit(ii) {
    const m = (ii && ii.extmetadata) || {};
    const author = String((m.Artist && m.Artist.value) || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const lic = String((m.LicenseShortName && m.LicenseShortName.value) || "").trim();
    const parts = [];
    if (author) parts.push(author.slice(0, 40));
    if (lic) parts.push(lic);
    return parts.length ? parts.join(" · ") : "Wikimedia Commons";
  }

  // 多張照片（給 Hero 輪播）；回傳 [{url, credit}]，credit = 作者 · 授權（CC 合規）
  async function forTrailMulti(trail, n = 5) {
    if (!trail.name) return [];
    const mk = "photonm4_" + trail.id;   // 加了 credit → 換快取鍵，不與舊格式(只有 urls)衝突
    try { const c = JSON.parse(localStorage.getItem(mk)); if (c && Date.now() - c.ts < TTL) return c.items; } catch { /* */ }
    const key = core(trail.name); const items = [];
    try {
      const api = "https://commons.wikimedia.org/w/api.php?action=query&generator=search" +
        `&gsrsearch=${encodeURIComponent(trail.name)}&gsrnamespace=6&gsrlimit=20` +
        "&prop=imageinfo&iiprop=url%7Cmime%7Cextmetadata&iiextmetadatafilter=Artist%7CLicenseShortName%7CImageDescription&iiurlwidth=900&format=json&origin=*";
      const res = await fetch(api);
      if (res.ok) {
        const pages = ((await res.json()).query || {}).pages || {};
        for (const p of Object.values(pages)) {
          const title = (p.title || "").replace(/^File:/, "");
          const ii = p.imageinfo && p.imageinfo[0];
          if (ii && ii.mime && ii.mime.startsWith("image/") && !BAD.test(title) && !BAD.test(descOf(ii))
            && (title.includes(trail.name) || (key.length >= 2 && title.includes(key)))) {
            items.push({ url: ii.thumburl || ii.url, credit: parseCredit(ii) });
            if (items.length >= n) break;
          }
        }
      }
    } catch { /* */ }
    safeSet(mk, JSON.stringify({ ts: Date.now(), items }));
    return items;
  }

  return { forTrailMulti };
})();
