/* 离线缓存外壳：把 UI 资源缓存到本地，弱网也能立刻渲染界面 */
var C = 'xjk-shell-v1';
var ASSETS = ['./', './index.html', './app.css', './api.js', './app.js', './manifest.json'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(C).then(function (c) { return c.addAll(ASSETS); }).catch(function () {}));
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { return k === C ? null : caches.delete(k); }));
  }));
  self.clients.claim();
});
/* 只缓存本地静态资源，接口请求一律走网络（保证数据实时） */
self.addEventListener('fetch', function (e) {
  var url = e.request.url;
  if (url.indexOf('/api/') >= 0 || url.indexOf('/uploads/') >= 0) return;
  e.respondWith(
    caches.match(e.request).then(function (r) {
      return r || fetch(e.request).catch(function () {
        return caches.match('./index.html');
      });
    })
  );
});
