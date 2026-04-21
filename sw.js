const CACHE_NAME = 'hub-v9';

// Core assets to cache for offline use
const PRE_CACHE = [
  './index.html',
  './manifest.json',
  './icon.svg',
  './exercise/index.html',
  './applied-anthropology/index.html'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRE_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// "Network-First" Strategy: 
// 1. Try to get it from the network first (so updates are seen immediately).
// 2. If network fails (offline), pull from cache.
// 3. If it's not in cache either, fail gracefully.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then(networkResponse => {
        // If we get a good response, clone it into the cache
        if (networkResponse && networkResponse.status === 200) {
          const cacheCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, cacheCopy));
        }
        return networkResponse;
      })
      .catch(() => {
        // If network is down, try the cache
        return caches.match(e.request);
      })
  );
});
