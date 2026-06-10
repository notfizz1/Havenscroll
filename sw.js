// HavenScroll Service Worker
// Update CACHE_NAME version string whenever you push a new release to GitHub.
// This is what triggers the "Update Available" banner for the user.
const CACHE_NAME = 'havenscroll-v3'; // ← bump this (v3, v4...) on every new release

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  // Add any icon paths here, e.g.:
  // './icons/icon-192.png',
  // './icons/icon-512.png',
];

// Install: cache all static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  // Don't call self.skipWaiting() here — we want the user to choose when to update
});

// Activate: delete old caches from previous versions
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: serve from cache, fall back to network
self.addEventListener('fetch', event => {
  // Don't intercept non-GET requests or external podcast audio URLs
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) {
    // For external resources (like podcast MP3s), just fetch from network
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request);
    })
  );
});

// Message handler: allows index.html to trigger skipWaiting
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
