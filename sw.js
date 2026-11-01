/* 数学作战台 Service Worker —— 主屏 App 离线缓存
 * 策略：
 *  - 页面导航（HTML）：网络优先（3.5s 超时），失败回落缓存 → 断网也能进游戏
 *  - 图标/清单等静态资源：缓存优先，未命中走网络并回填
 *  - 跨域请求（云端数据表同步等）一律不拦截
 * 更新版本号 CACHE 后，新 SW 会在后台接管（skipWaiting + clients.claim）
 */
var CACHE = 'mathops-v2.5.0';
var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') { return; }
  var url = new URL(req.url);
  if (url.origin !== location.origin) { return; } /* 跨域（资料库同步）不拦 */

  /* 页面导航：网络优先，超时回落缓存 */
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') > -1) {
    e.respondWith(
      Promise.race([
        fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
          return res;
        }),
        new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, 3500); })
      ]).catch(function () {
        return caches.match('./index.html');
      })
    );
    return;
  }

  /* 静态资源：缓存优先 */
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) { return hit; }
      return fetch(req).then(function (res) {
        if (res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
