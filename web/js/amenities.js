// 行前資訊：用 Google Places 查登山口附近的停車場、廁所、超商（底層在 places.js）。
const Amenities = (() => {
  const CKEY = "amen_";
  const ORDER = ["停車", "廁所", "超商"];   // 圖示交給畫面用 SVG（以前 emoji 在部分裝置是方框）
  // Google 回的 primaryType 是子類型（parking_lot 等），用模糊對應分類
  function categoryOf(ty) {
    ty = ty || "";
    if (/parking/.test(ty)) return "停車";
    if (/bathroom|restroom|toilet/.test(ty)) return "廁所";
    if (/convenience/.test(ty)) return "超商";
    return null;
  }
  async function nearby(trail) {
    if (!Places.key() || !trail.lat) return null;
    const cached = Places.cacheGet(CKEY + trail.id);
    if (cached) return cached;
    const res = await Places.search(trail, { types: ["parking", "public_bathroom", "convenience_store"], radius: 3000, fields: "places.displayName,places.location,places.primaryType" });
    if (!res) return null;
    if (!res.ok) throw new Error("amen " + res.status);
    const places = (await res.json()).places || [];
    // 每類取最近一個（已依距離排序）
    const best = {};
    for (const p of places) {
      const cat = categoryOf(p.primaryType);
      if (!cat || best[cat] || !p.location) continue;
      best[cat] = { label: cat, name: p.displayName?.text || "", dist: Places.distTo(trail, p) };
    }
    const items = ORDER.filter(c => best[c]).map(c => best[c]);
    Places.cacheSet(CKEY + trail.id, items);
    return items;
  }
  return { nearby };
})();
