// 步道周邊美食：Google Places 查附近餐飲，含 Google 星級與評論數（底層在 places.js），可按「距離 / 星級」排序。
const Food = (() => {
  const RADIUS = 8000;             // 8 公里
  const CKEY = "foodg_";
  const FIELDS = "places.displayName,places.rating,places.userRatingCount,places.location,places.primaryTypeDisplayName,places.googleMapsUri";
  // 餐飲查詢偶爾混進「服務業」「農場」「公司」這類不是吃飯的地方 → 濾掉
  const isFood = x => !/服務業|農場|公司|商店|超市|加油|旅行社|批發/.test(x.kind || "");
  // 回傳店家陣列（含 Google 星級、評論數、距離）
  async function nearby(trail) {
    if (!trail.lat) return [];
    if (!Places.key()) throw Places.noKey();
    const cached = Places.cacheGet(CKEY + trail.id);
    if (cached) return cached.filter(isFood);
    const res = await Places.search(trail, { types: ["restaurant", "cafe", "bakery", "meal_takeaway"], radius: RADIUS, fields: FIELDS });
    if (!res) return [];
    if (!res.ok) throw new Error("places " + res.status);
    const items = ((await res.json()).places || []).map(p => ({
      name: p.displayName?.text || "（無名）",
      kind: p.primaryTypeDisplayName?.text || "餐飲",
      rating: p.rating || null,
      reviews: p.userRatingCount || 0,
      uri: p.googleMapsUri || "",
      lat: p.location?.latitude, lon: p.location?.longitude,
      dist: Places.distTo(trail, p),
    }));
    Places.cacheSet(CKEY + trail.id, items);
    return items.filter(isFood);
  }
  return { nearby, sortItems: Places.sortItems };
})();
