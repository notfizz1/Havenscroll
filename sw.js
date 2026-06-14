const CACHE_NAME = 'havenscroll-cache-v2.5.0';

// Everything the sanctuary needs to run with zero network
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './data.json',
  './manifest.webmanifest',
  './fonts/Inter-Variable.ttf',
  './fonts/Inter-Italic-Variable.ttf',
  './audio/splash-sound.mp3',
  './audio/haven-ambient.mp3',
  './books/books.json',
  './video/sanctuary-bg.mp4',
  './video/neuro-bg.mp4',
  './video/satire-bg.mp4',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './assets/moon-photo.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Cache each core asset individually and tolerate misses.
      await Promise.all(ASSETS_TO_CACHE.map(url => cache.add(url).catch(() => null)));
      // Then cache every book (.txt + .png) listed in the catalog, so new
      // books only require a books.json edit — no sw.js change needed.
      try {
        const res = await fetch('./books/books.json', { cache: 'no-store' });
        const catalog = await res.json();
        const bookFiles = (catalog.books || [])
          .flatMap(b => [b.txt, b.cover])
          .filter(p => p && p.length);
        await Promise.all(bookFiles.map(url => cache.add(url).catch(() => null)));
      } catch (e) { /* catalog missing — core app still works */ }
    })
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

  // NETWORK-FIRST for the app shell + content — fresh when online,
  // cached when offline. (v1 served these network-only; v2 falls back.)
  const networkFirst = ['index.html', 'app.js', 'style.css', 'data.json', 'version.json', 'books.json'];
  const isNetworkFirst = networkFirst.some(p => url.pathname.endsWith(p))
    || url.pathname === '/'
    || url.pathname.endsWith('/');

  if (isNetworkFirst) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // CACHE-FIRST for heavy static media (fonts, video, audio, icons)
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return res;
    }))
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
   