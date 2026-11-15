/* 星湾躲猫猫 PWA：安装后可离线打开界面，接口请求始终走网络 */
const CACHE = "starven-hns-v3";
const SHELL = [
  "./", "./index.html", "./css/app.css",
  "./js/app.js", "./js/api.js", "./js/ws.js", "./js/geo.js", "./js/scan.js",
  "./js/radar.js", "./js/coords.js", "./js/mapview.js", "./js/jsQR.js",
  "./vendor/leaflet/leaflet.js", "./vendor/leaflet/leaflet.css",
  "./vendor/leaflet/images/marker-icon.png", "./vendor/leaflet/images/marker-shadow.png",
  "./vendor/leaflet/images/layers.png",
  "./assets/hero-login.webp", "./assets/hero-home.webp",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-64.png",
  "./icons/favicon.png", "./manifest.webmanifest", "./js/perm.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // 接口、瓦片、导出一律走网络，绝不缓存
  if (e.request.method !== "GET" || url.pathname.includes("/api/")) return;
  if (/tile\.openstreetmap|autonavi|tianditu|\/tiles?\//.test(url.href)) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
