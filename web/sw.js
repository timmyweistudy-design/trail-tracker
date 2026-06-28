// 離線快取：app shell + 地圖圖磚
const CACHE = "trail-tracker-v98";
const TILE_CACHE = "tt-tiles";   // 地圖圖磚（不隨版本清除，保留離線地圖）
const ASSETS = [
  "./", "./index.html",
  "./css/style.css",
  "./js/trails-data.js", "./js/trails-detail.js", "./js/trails-geo.js", "./js/storage.js", "./js/grades.js", "./js/config.js", "./js/conditions.js",
  "./js/photos.js", "./js/amenities.js", "./js/food.js", "./js/attractions.js", "./js/weather.js", "./js/profile.js", "./js/recorder.js", "./js/offline.js", "./js/gpx.js", "./js/app.js",
  "./manifest.webmanifest",
  "./vendor/leaflet/leaflet.js", "./vendor/leaflet/leaflet.css",
  "./vendor/markercluster/markercluster.js", "./vendor/markercluster/markercluster.css", "./vendor/markercluster/markercluster-default.css",
  "./vendor/leaflet/images/marker-icon.png",
  "./vendor/leaflet/images/marker-icon-2x.png",
  "./vendor/leaflet/images/marker-shadow.png",
];

self.addEventListener("install", e => {
  // 不自動 skipWaiting：讓新版進入 waiting，由前端顯示「有新版本」橫幅，使用者點擊才更新
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});
self.addEventListener("message", e => { if (e.data === "skipWaiting") self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE && k !== TILE_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = e.request.url;
  // 地圖圖磚：cache 優先，順手存入圖磚快取 → 看過/預載過的離線可用
  if (url.includes("server.arcgisonline.com") || url.includes("tile.opentopomap.org") || url.includes("tile.openstreetmap")) {
    e.respondWith(
      caches.open(TILE_CACHE).then(c => c.match(e.request).then(hit =>
        hit || fetch(e.request).then(res => {
          if (res && res.status === 200) c.put(e.request, res.clone());
          return res;
        }).catch(() => hit)   // 離線且未快取 → 該圖磚留白
      ))
    );
    return;
  }
  // 其餘（app shell）：cache 優先
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
