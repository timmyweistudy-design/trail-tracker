// 行前資訊：用 Google Places 查登山口附近的停車場、廁所、超商。
// 結果 localStorage 快取 7 天。
const Amenities = (() => {
  const KEY = (typeof window !== "undefined" && window.PLACES_KEY) || "";
  const ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby";
  const TTL = 7 * 864e5;
  const CKEY = "amen_";
  const ORDER = ["🅿️ 停車", "🚻 廁所", "🏪 超商"];
  // Google 回的 primaryType 是子類型（parking_lot 等），用模糊對應分類
  function categoryOf(ty) {
    ty = ty || "";
    if (/parking/.test(ty)) return "🅿️ 停車";
    if (/bathroom|restroom|toilet/.test(ty)) return "🚻 廁所";
    if (/convenience/.test(ty)) return "🏪 超商";
    return null;
  }

  function cacheGet(id) {
    try { const c = JSON.parse(localStorage.getItem(CKEY + id)); if (c && Date.now() - c.ts < TTL) return c.items; } catch { /* */ }
    return null;
  }
  function cacheSet(id, items) { try { localStorage.setItem(CKEY + id, JSON.stringify({ ts: Date.now(), items })); } catch { /* */ } }

  async function nearby(trail) {
    if (!KEY || !trail.lat) return null;
    const cached = cacheGet(trail.id);
    if (cached) return cached;
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": KEY,
        "X-Goog-FieldMask": "places.displayName,places.location,places.primaryType",
      },
      body: JSON.stringify({
        includedTypes: ["parking", "public_bathroom", "convenience_store"],
        maxResultCount: 20, languageCode: "zh-TW", rankPreference: "DISTANCE",
        locationRestriction: { circle: { center: { latitude: trail.lat, longitude: trail.lon }, radius: 3000 } },
      }),
    });
    if (!res.ok) throw new Error("amen " + res.status);
    const places = (await res.json()).places || [];
    // 每類取最近一個（已依距離排序）
    const best = {};
    for (const p of places) {
      const cat = categoryOf(p.primaryType);
      if (!cat || best[cat] || !p.location) continue;
      best[cat] = {
        label: cat, name: p.displayName?.text || "",
        dist: haversine({ lat: trail.lat, lon: trail.lon }, { lat: p.location.latitude, lon: p.location.longitude }),
      };
    }
    const items = ORDER.filter(c => best[c]).map(c => best[c]);
    cacheSet(trail.id, items);
    return items;
  }

  return { nearby };
})();
