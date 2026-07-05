// 離線快取：app shell + 地圖圖磚
const CACHE = "trail-tracker-v286";
const TILE_CACHE = "tt-tiles";   // 地圖圖磚（不隨版本清除，保留離線地圖）
const ASSETS = [
  "./", "./index.html",
  "./css/style.css",
  "./js/trails-data.js", "./js/trails-detail.js", "./js/geo-manifest.js", "./js/geo/geo-0.js", "./js/geo/geo-1.js", "./js/geo/geo-10.js", "./js/geo/geo-11.js", "./js/geo/geo-12.js", "./js/geo/geo-13.js", "./js/geo/geo-14.js", "./js/geo/geo-15.js", "./js/geo/geo-16.js", "./js/geo/geo-17.js", "./js/geo/geo-18.js", "./js/geo/geo-19.js", "./js/geo/geo-2.js", "./js/geo/geo-20.js", "./js/geo/geo-21.js", "./js/geo/geo-3.js", "./js/geo/geo-4.js", "./js/geo/geo-5.js", "./js/geo/geo-6.js", "./js/geo/geo-7.js", "./js/geo/geo-8.js", "./js/geo/geo-9.js", "./js/storage.js", "./js/dialog.js", "./js/i18n.js", "./js/i18n-names.js", "./js/grades.js", "./js/config.js", "./js/conditions.js",
  "./js/photos.js", "./js/amenities.js", "./js/food.js", "./js/attractions.js", "./js/weather.js", "./js/profile.js", "./js/recorder.js", "./js/elevation.js", "./js/offline.js", "./js/gpx.js", "./js/premium.js", "./js/pet.js", "./js/analytics.js", "./js/app.js",
  "./vendor/supabase/supabase.js",
  "./js/social/supa.js", "./js/social/handle.js", "./js/social/media.js", "./js/social/posts.js", "./js/social/composer.js", "./js/social/safety.js", "./js/social/feed.js", "./js/social/postview.js", "./js/social/discover.js", "./js/social/petsocial.js", "./js/social/teamlive.js", "./js/social/teams.js", "./js/social/notifications.js", "./js/social/push.js", "./js/social/autocomplete.js", "./js/social/events.js", "./js/social/lightbox.js", "./js/social/auth.js", "./js/social/profiles.js", "./js/social/social-ui.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-180.png",
  "./vendor/leaflet/leaflet.js", "./vendor/leaflet/leaflet.css",
  "./vendor/markercluster/markercluster.js", "./vendor/markercluster/markercluster.css", "./vendor/markercluster/markercluster-default.css",
  "./vendor/leaflet/images/marker-icon.png",
  "./vendor/leaflet/images/marker-icon-2x.png",
  "./vendor/leaflet/images/marker-shadow.png",
];

self.addEventListener("install", e => {
  // ⚠️ 緊急模式（v242）：v241 日文版有無限迴圈凍結 bug，中招頁面點不到更新橫幅，
  // 暫時自動 skipWaiting 讓所有裝置重開即修復。全數恢復後可改回橫幅模式。
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(ASSETS.map(a => c.add(a)))));
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
      caches.open(TILE_CACHE).then(c => c.match(e.request).then(hit => {
        // 近似 LRU：命中時 2% 抽樣重新寫入（移到快取尾端），常看的圖磚不會被上限清掉
        if (hit && Math.random() < 0.02) { c.delete(e.request).then(() => c.put(e.request, hit.clone())).catch(() => {}); }
        return hit || fetch(e.request).then(res => {
          if (res && res.status === 200) c.put(e.request, res.clone());
          return res;
        }).catch(() => hit);   // 離線且未快取 → 該圖磚留白
      }))
    );
    return;
  }
  // 非 GET（POST/DELETE…）或跨網域（Supabase API、Places…）→ 不攔截、直接走網路，
  // 避免把動態資料快取成舊的（發文/刪除/路況即時反映）。
  if (e.request.method !== "GET" || !url.startsWith(self.location.origin)) return;
  // 自家同源檔案（app shell）：cache 優先
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
      // 只有「頁面導航」失敗才回 index.html；其他資源（圖片/JSON）失敗不能拿 HTML 充數
    }).catch(() => (e.request.mode === "navigate" ? caches.match("./index.html") : undefined)))
  );
});

// Web Push：收到推播 → 顯示系統通知
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  const title = d.title || "循徑拾光";
  const opts = {
    body: d.body || "你有新的社群動態",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    data: { url: d.url || "./" },
    tag: d.tag || undefined,
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});
// 點通知 → 聚焦既有分頁或開新分頁
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if ("focus" in c) { c.navigate && c.navigate(target); return c.focus(); } }
    if (clients.openWindow) return clients.openWindow(target);
  }));
});
