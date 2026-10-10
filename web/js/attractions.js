// 步道周邊人文景點：Google Places 查附近的歷史古蹟、廟宇、博物館、文化與觀光景點，帶出 Google 的簡短介紹（editorialSummary）。
// 走完步道可順道走訪。底層在 places.js；與美食分開查詢、分開快取。
const Attractions = (() => {
  const RADIUS = 12000;            // 12 公里，方便走完步道再繞繞
  const CKEY = "attrg2_";
  const FIELDS = "places.displayName,places.rating,places.userRatingCount,places.location,places.primaryTypeDisplayName,places.googleMapsUri,places.editorialSummary,places.primaryType";
  // 文化/歷史/觀光類型；萬一含不支援型別導致 400，退回最小安全集重試
  const RICH = ["tourist_attraction", "historical_place", "cultural_landmark", "monument", "museum", "art_gallery", "visitor_center", "national_park"];
  const SAFE = ["tourist_attraction", "museum"];
  // tourist_attraction 會把 SUP 俱樂部、自行車出租、旅行社也算進來——這裡只要「人文景點」，店家類剔除。
  // 健行區（hiking_area）多半就是步道本身或隔壁步道，也不算景點。
  const DENY_TYPE = /club|rental|store|shop|agency|lodging|hotel|restaurant|cafe|parking|gym|hiking_area|campground|spa|police|government|city_hall|courthouse|school|university|hospital|doctor|bank|atm|post_office|insurance|real_estate|car_|gas_station|farm|corporate|service/;
  const DENY_KIND = /俱樂部|出租|租借|商店|旅行社|民宿|飯店|旅館|停車|健行區|露營|用品|警察|派出所|分局|公所|政府|學校|國小|國中|醫院|診所|銀行|郵局|農場|公司|服務業|加油|汽車/;
  const isCultural = (x, trail) => !DENY_TYPE.test(x.type || "") && !DENY_KIND.test(x.kind || "") && !/警察|派出所|分駐所|消防/.test(x.name || "") && x.name !== trail.name;   // 有的派出所分類是「觀光景點」，連名字一起擋
  async function nearby(trail) {
    if (!trail.lat) return [];
    if (!Places.key()) throw Places.noKey();
    const cached = Places.cacheGet(CKEY + trail.id);
    if (cached) return cached.filter(x => isCultural(x, trail));
    let res = await Places.search(trail, { types: RICH, radius: RADIUS, fields: FIELDS });
    if (res && res.status === 400) res = await Places.search(trail, { types: SAFE, radius: RADIUS, fields: FIELDS });   // 型別不支援 → 退回安全集
    if (!res) return [];
    if (!res.ok) throw new Error("places " + res.status);
    const items = ((await res.json()).places || []).map(p => ({
      name: p.displayName?.text || "（無名）",
      kind: p.primaryTypeDisplayName?.text || "景點",
      type: p.primaryType || "",
      rating: p.rating || null,
      reviews: p.userRatingCount || 0,
      summary: p.editorialSummary?.text || "",
      uri: p.googleMapsUri || "",
      lat: p.location?.latitude, lon: p.location?.longitude,
      dist: Places.distTo(trail, p),
    }));
    Places.cacheSet(CKEY + trail.id, items);
    return items.filter(x => isCultural(x, trail));
  }
  return { nearby, sortItems: Places.sortItems };
})();
