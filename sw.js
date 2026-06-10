const CACHE_NAME = 'havenscroll-cache-v1';

const ASSETS_TO_CACHE = [
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never intercept external URLs (podcast audio etc.)
  if (url.origin !== self.location.origin) return;

  // NEVER cache these — always fetch fresh from network
  const alwaysFresh = ['index.html', 'version.json', './'];
  const isAlwaysFresh = alwaysFresh.some(p => url.pathname.endsWith(p))
    || url.pathname === '/'
    || url.pathname.endsWith('/');

  if (isAlwaysFresh) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Everything else (icons, manifest): cache first
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
