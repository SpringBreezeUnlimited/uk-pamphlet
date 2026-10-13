const CACHE_NAME = 'ukousai2026-v27-survey';
const ASSETS = [
  './',
  './index.html',
  './saiji.html',
  './map.html',
  './map.png',
  './map-links.json',
  './map-positions.json',
  './map-local-data.js',
  './crowd.css',
  './crowd-model.js',
  './crowd-view.js',
  './announcement.css',
  './announcement.js',
  './survey.js',
  './aisatsu.html',
  './greeting.js',
  './taiikukan.html',
  './gym.js',
  './visit-counter.js',
  './crowd-firebase.js',
  './event-data.js',
  './firebase-config.js',
  './monitor.html',
  './monitor.css',
  './monitor.js',
  './manifest.json',
  './events.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('ukousai2026-') && k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Firebaseの通信・管理画面はキャッシュしない。公開HTMLとデータはネット優先。
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (['/admin.html', '/admin.js', '/admin-access.js', '/editor.html', '/crowd-admin.html', '/crowd-admin.js', '/announcement-admin.html', '/announcement-admin.js', '/survey-admin.html', '/survey-admin.js', '/greeting-admin.html', '/greeting-admin.js', '/gym-admin.html', '/gym-admin.js'].some(path => url.pathname.endsWith(path))) return;
  const isLiveAsset = e.request.mode === 'navigate' || /\.(html|json|js|css)$/.test(url.pathname);
  if (isLiveAsset) {
    const cacheKey = new Request(url.origin + url.pathname);
    e.respondWith(
      fetch(e.request, {cache: 'no-store'})
        .then(async (res) => {
          if (res.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(cacheKey, res.clone());
          }
          return res;
        })
        .catch(async () => (await caches.match(cacheKey)) || Response.error())
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
