// Google Places（New）共用底層（2026-10-10 優化輪 E1）：美食 food.js、景點 attractions.js、登山口設施 amenities.js 三支共用。
// 以前三支各自複製一份金鑰、端點、30 分鐘記憶體快取、每日用量守門、距離計算，改一個地方要改三次。
// 條款（docs/map-licensing.md）：結果只能在記憶體放 30 分鐘、不寫硬碟；不能畫在非 Google 的地圖上；要標「Google Maps」。
// 金鑰由 js/config.js 注入（window.PLACES_KEY），Render 建置時依 GOOGLE_PLACES_KEY 產生。金鑰前端可見，Google Cloud 端已限網址、只開 Places API、設用量上限。
const Places = (() => {
  const ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby";
  const TTL = 30 * 60e3;   // Google Places 條款不允許長期存店名／評分：只在記憶體裡放 30 分鐘，關掉 App 就沒了
  const MEM = new Map();
  const key = () => (typeof window !== "undefined" && window.PLACES_KEY) || "";
  function cacheGet(k) { const c = MEM.get(k); return c && Date.now() - c.ts < TTL ? c.items : null; }
  function cacheSet(k, items) { MEM.set(k, { ts: Date.now(), items }); }
  // 回傳 fetch 的 Response（呼叫端自己決定 400 要不要換型別重試）；超過每日用量回 null
  async function search(trail, { types, radius, fields, max = 20 }) {
    if (typeof ttPlacesAllow === "function" && !ttPlacesAllow()) return null;   // 每日用量守門：超限就不查
    return fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key(), "X-Goog-FieldMask": fields },
      body: JSON.stringify({
        includedTypes: types, maxResultCount: max, languageCode: "zh-TW", rankPreference: "DISTANCE",
        locationRestriction: { circle: { center: { latitude: trail.lat, longitude: trail.lon }, radius } },
      }),
    });
  }
  const distTo = (trail, p) => (p && p.location ? haversine({ lat: trail.lat, lon: trail.lon }, { lat: p.location.latitude, lon: p.location.longitude }) : 9e9);
  // 星級排序要把評論數算進去：1 則評論的 ★5.0 不該排在 1,200 則的 ★4.6 前面。
  // 貝氏平均：評論少的往全體平均（4.0）拉，評論多的才站得住自己的分數。
  const score = x => { const v = x.reviews || 0, R = x.rating || 0; return R ? (v * R + 20 * 4.0) / (v + 20) : 0; };
  function sortItems(items, by) {
    const a = items.slice();
    if (by === "rating") a.sort((x, y) => score(y) - score(x) || y.reviews - x.reviews);
    else a.sort((x, y) => x.dist - y.dist);
    return a;
  }
  function noKey() { const e = new Error("nokey"); e.nokey = true; return e; }
  return { key, search, cacheGet, cacheSet, distTo, sortItems, noKey, _mem: MEM };
})();

// 以前版本把 Google Places 結果存在 localStorage 7 天（違反 Places 條款）→ 清掉留在手機上的舊快取
try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && /^(foodg?_|attrg2?_|amen_)/.test(k)) localStorage.removeItem(k); } } catch (e) { /* */ }
