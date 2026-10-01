// 步道周邊美食：Google Places API (New) 查附近餐飲，含 Google 星級與評論數。
// 結果以 localStorage 快取（7 天），可按「距離 / 星級」排序。
//
// 金鑰由 js/config.js 注入（window.PLACES_KEY）——該檔不進公開 repo，
// 由 Render 建置時依環境變數 GOOGLE_PLACES_KEY 產生（見 render.yaml）。
// ⚠️ 金鑰仍為前端可見，務必在 Google Cloud：
//    1) 應用程式限制 → HTTP 參照網址，只允許本站網址
//    2) API 限制 → 只允許 Places API
//    3) 設預算/配額上限，避免被盜刷
const Food = (() => {
  const KEY = (typeof window !== "undefined" && window.PLACES_KEY) || "";
  const ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby";
  const TTL = 7 * 864e5;
  const RADIUS = 8000;             // 8 公里
  const CKEY = "foodg_";           // Google 版快取（與舊 OSM 版區隔）

  function cacheGet(id) {
    try { const c = JSON.parse(localStorage.getItem(CKEY + id)); if (c && Date.now() - c.ts < TTL) return c.items; } catch { /* */ }
    return null;
  }
  function cacheSet(id, items) {
    try { localStorage.setItem(CKEY + id, JSON.stringify({ ts: Date.now(), items })); } catch { /* quota */ }
  }

  async function query(lat, lon) {
    if (typeof ttPlacesAllow === "function" && !ttPlacesAllow()) return [];   // 每日用量守門：超限改用快取
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": KEY,
        "X-Goog-FieldMask": "places.displayName,places.rating,places.userRatingCount,places.location,places.primaryTypeDisplayName,places.googleMapsUri",
      },
      body: JSON.stringify({
        includedTypes: ["restaurant", "cafe", "bakery", "meal_takeaway"],
        maxResultCount: 20, languageCode: "zh-TW", rankPreference: "DISTANCE",
        locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius: RADIUS } },
      }),
    });
    if (!res.ok) throw new Error("places " + res.status);
    return (await res.json()).places || [];
  }

  // 回傳店家陣列（含 Google 星級、評論數、距離）
  async function nearby(trail) {
    if (!trail.lat) return [];
    if (!KEY) { const e = new Error("nokey"); e.nokey = true; throw e; }
    // 餐飲查詢偶爾混進「服務業」「農場」「公司」這類不是吃飯的地方 → 濾掉
    const isFood = x => !/服務業|農場|公司|商店|超市|加油|旅行社|批發/.test(x.kind || "");
    const cached = cacheGet(trail.id);
    if (cached) return cached.filter(isFood);
    const places = await query(trail.lat, trail.lon);
    const items = places.map(p => ({
      name: p.displayName?.text || "（無名）",
      kind: p.primaryTypeDisplayName?.text || "餐飲",
      rating: p.rating || null,
      reviews: p.userRatingCount || 0,
      uri: p.googleMapsUri || "",
      lat: p.location?.latitude, lon: p.location?.longitude,
      dist: (p.location) ? haversine({ lat: trail.lat, lon: trail.lon },
        { lat: p.location.latitude, lon: p.location.longitude }) : 9e9,
    }));
    cacheSet(trail.id, items);
    return items.filter(isFood);
  }

  // 星級排序要把評論數算進去：1 則評論的 ★5.0 不該排在 1,200 則的 ★4.6 前面。
  // 貝氏平均：評論少的往全體平均（4.0）拉，評論多的才站得住自己的分數。
  const score = x => { const v = x.reviews || 0, R = x.rating || 0; return R ? (v * R + 20 * 4.0) / (v + 20) : 0; };
  function sortItems(items, by) {
    const a = items.slice();
    if (by === "rating") a.sort((x, y) => score(y) - score(x) || y.reviews - x.reviews);
    else a.sort((x, y) => x.dist - y.dist);
    return a;
  }

  return { nearby, sortItems };
})();
