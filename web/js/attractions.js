// 步道周邊人文景點：Google Places API (New) 查附近的歷史古蹟、廟宇、博物館、文化與觀光景點，
// 並帶出 Google 的簡短介紹（editorialSummary）。走完步道可順道走訪。
//
// 共用 js/config.js 的金鑰（window.PLACES_KEY）。與美食分開查詢、分開快取。
const Attractions = (() => {
  const KEY = (typeof window !== "undefined" && window.PLACES_KEY) || "";
  const ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby";
  const TTL = 7 * 864e5;
  const RADIUS = 12000;            // 12 公里，方便走完步道再繞繞
  const CKEY = "attrg2_";   // 換鍵：新增 primaryType 欄位
  const FIELDS = "places.displayName,places.rating,places.userRatingCount,places.location,places.primaryTypeDisplayName,places.googleMapsUri,places.editorialSummary,places.primaryType";
  // 文化/歷史/觀光類型；萬一含不支援型別導致 400，退回最小安全集重試
  const RICH = ["tourist_attraction", "historical_place", "cultural_landmark", "monument", "museum", "art_gallery", "visitor_center", "national_park"];
  const SAFE = ["tourist_attraction", "museum"];

  // tourist_attraction 會把 SUP 俱樂部、自行車出租、旅行社也算進來——這裡只要「人文景點」，店家類剔除。
  // 健行區（hiking_area）多半就是步道本身或隔壁步道，也不算景點。
  const DENY_TYPE = /club|rental|store|shop|agency|lodging|hotel|restaurant|cafe|parking|gym|hiking_area|campground|spa/;
  const DENY_KIND = /俱樂部|出租|租借|商店|旅行社|民宿|飯店|旅館|停車|健行區|露營|用品/;
  const isCultural = (x, trail) => !DENY_TYPE.test(x.type || "") && !DENY_KIND.test(x.kind || "") && x.name !== trail.name;
  function cacheGet(id) {
    try { const c = JSON.parse(localStorage.getItem(CKEY + id)); if (c && Date.now() - c.ts < TTL) return c.items; } catch { /* */ }
    return null;
  }
  function cacheSet(id, items) {
    try { localStorage.setItem(CKEY + id, JSON.stringify({ ts: Date.now(), items })); } catch { /* quota */ }
  }

  async function call(lat, lon, types) {
    if (typeof ttPlacesAllow === "function" && !ttPlacesAllow()) return [];   // 每日用量守門：超限改用快取
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": FIELDS },
      body: JSON.stringify({
        includedTypes: types, maxResultCount: 20, languageCode: "zh-TW", rankPreference: "DISTANCE",
        locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius: RADIUS } },
      }),
    });
    return res;
  }
  async function query(lat, lon) {
    let res = await call(lat, lon, RICH);
    if (res.status === 400) res = await call(lat, lon, SAFE);   // 型別不支援 → 退回安全集
    if (!res.ok) throw new Error("places " + res.status);
    return (await res.json()).places || [];
  }

  async function nearby(trail) {
    if (!trail.lat) return [];
    if (!KEY) { const e = new Error("nokey"); e.nokey = true; throw e; }
    const cached = cacheGet(trail.id);
    if (cached) return cached.filter(x => isCultural(x, trail));
    const places = await query(trail.lat, trail.lon);
    const items = places.map(p => ({
      name: p.displayName?.text || "（無名）",
      kind: p.primaryTypeDisplayName?.text || "景點",
      type: p.primaryType || "",
      rating: p.rating || null,
      reviews: p.userRatingCount || 0,
      summary: p.editorialSummary?.text || "",
      uri: p.googleMapsUri || "",
      lat: p.location?.latitude, lon: p.location?.longitude,
      dist: (p.location) ? haversine({ lat: trail.lat, lon: trail.lon },
        { lat: p.location.latitude, lon: p.location.longitude }) : 9e9,
    }));
    cacheSet(trail.id, items);
    return items.filter(x => isCultural(x, trail));
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
