// 步道周邊美食：開啟步道詳情時即時向 OpenStreetMap Overpass 查詢附近餐飲，
// 結果以 localStorage 快取（7 天），避免重複查詢。
const Food = (() => {
  const MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];
  const TTL = 7 * 864e5;            // 7 天
  const RADIUS = 4000;              // 4 公里
  const CUISINE_ZH = {
    chinese: "中式", taiwanese: "台菜", japanese: "日式", noodle: "麵食",
    ramen: "拉麵", coffee_shop: "咖啡", cafe: "咖啡", italian: "義式",
    pizza: "披薩", korean: "韓式", thai: "泰式", western: "西式",
    breakfast: "早餐", dumpling: "水餃", hot_pot: "火鍋", barbecue: "燒烤",
    seafood: "海鮮", vegetarian: "蔬食", ice_cream: "冰品", dessert: "甜點",
  };
  const TYPE_ZH = {
    restaurant: "餐廳", cafe: "咖啡", fast_food: "速食",
    bakery: "烘焙", convenience: "超商",
  };

  function cacheGet(id) {
    try {
      const c = JSON.parse(localStorage.getItem("food_" + id));
      if (c && Date.now() - c.ts < TTL) return c.items;
    } catch { /* ignore */ }
    return null;
  }
  function cacheSet(id, items) {
    try { localStorage.setItem("food_" + id, JSON.stringify({ ts: Date.now(), items })); } catch { /* quota */ }
  }

  function label(tags) {
    const c = tags.cuisine ? tags.cuisine.split(";")[0] : null;
    return CUISINE_ZH[c] || TYPE_ZH[tags.amenity] || TYPE_ZH[tags.shop] || "餐飲";
  }

  async function query(lat, lon) {
    const q = `[out:json][timeout:25];(` +
      `node["amenity"~"restaurant|cafe|fast_food"](around:${RADIUS},${lat},${lon});` +
      `node["shop"~"bakery"](around:${RADIUS},${lat},${lon});` +
      `);out body 40;`;
    for (const url of MIRRORS) {
      try {
        const res = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q),
          headers: { "Content-Type": "application/x-www-form-urlencoded" } });
        if (!res.ok) continue;
        const data = await res.json();
        return (data.elements || []);
      } catch { /* try next mirror */ }
    }
    throw new Error("overpass unreachable");
  }

  // 回傳依距離排序、最多 8 筆具名餐飲
  async function nearby(trail) {
    if (!trail.lat) return [];
    const cached = cacheGet(trail.id);
    if (cached) return cached;
    const els = await query(trail.lat, trail.lon);
    const items = els
      .filter(e => e.tags && e.tags.name)
      .map(e => ({
        name: e.tags.name,
        kind: label(e.tags),
        dist: haversine({ lat: trail.lat, lon: trail.lon }, { lat: e.lat, lon: e.lon }),
        lat: e.lat, lon: e.lon,
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 8);
    cacheSet(trail.id, items);
    return items;
  }

  return { nearby };
})();
