// 簡易離線快取（app shell）
const CACHE = "trail-tracker-v8";
const ASSETS = [
  "./", "./index.html",
  "./css/style.css",
  "./js/trails-data.js", "./js/storage.js", "./js/grades.js", "./js/food.js", "./js/recorder.js", "./js/app.js",
  "./manifest.webmanifest",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = e.request.url;
  // 地圖圖磚與 CDN 走網路優先；其餘 cache 優先
  if (url.includes("tile.openstreetmap") || url.includes("unpkg.com")) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
