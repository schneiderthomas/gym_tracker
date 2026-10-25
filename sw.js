// Service worker: precache the app shell + dataset, serve navigations from cache when offline,
// and keep exercise images in a runtime cache once viewed.
const VERSION = 'v4';
const SHELL_CACHE = `shell-${VERSION}`;
const IMAGE_CACHE = 'images-v1';
const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/logic.js',
  './js/storage.js',
  './js/suggestions.js',
  './data/exercises.json',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];
const IMAGE_HOST = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, IMAGE_CACHE]);
    for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Navigations: network first (to pick up new deploys), cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(async () =>
      (await caches.match('./index.html', { cacheName: SHELL_CACHE })) || Response.error()));
    return;
  }

  // Exercise images: cache first, fill on first view.
  if (req.url.startsWith(IMAGE_HOST)) {
    event.respondWith((async () => {
      const cache = await caches.open(IMAGE_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // Same-origin shell assets: cache first, then network.
  if (new URL(req.url).origin === self.location.origin) {
    event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
  }
});
