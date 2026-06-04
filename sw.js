const CACHE_NAME = 'yujian-v2.1.0';

// 核心资源（必须缓存）
const CORE_ASSETS = [
  './',
  './index.html',
  './offline.html',
  './css/app.css',
  './css/onboarding.css',
  './js/app.js',
  './js/api.js',
  './js/storage.js',
  './js/charts.js',
  './js/calculator.js',
  './js/utils.js',
  './js/ble.js',
  './js/onboarding.js',
  './js/auth.js',
  './manifest.json'
];

// 可选资源（缓存失败不阻塞安装）
const OPTIONAL_ASSETS = [
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.svg',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.8/dist/chart.umd.min.js'
];

// 安装：缓存核心资源（必须全部成功）
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 缓存核心资源
      await cache.addAll(CORE_ASSETS);

      // 尝试缓存可选资源（失败不阻塞）
      for (const url of OPTIONAL_ASSETS) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            await cache.put(url, response);
          }
        } catch (err) {
          console.log('Optional asset skipped:', url);
        }
      }
    })
  );
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 拦截请求：优先缓存，失败则网络，再失败则离线页
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;

      return fetch(e.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // 网络失败，返回离线页
        return caches.match('./offline.html');
      });
    })
  );
});
