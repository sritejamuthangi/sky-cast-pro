/**
 * SkyCast service worker: makes the app installable and lets it open offline.
 * - App files (including Three.js once it has been used): network first, cache as fallback.
 * - Weather APIs are not intercepted; the app keeps its own copy of the last forecast.
 */
const VERSION = 'skycast-v5';

const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/api.js',
  './js/conditions.js',
  './js/depth.js',
  './js/format.js',
  './js/insights.js',
  './js/model.js',
  './js/render.js',
  './js/scene3d.js',
  './js/search.js',
  './js/sky.js',
  './js/storage.js',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/fonts/inter-latin.woff2',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== VERSION) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  // Every page URL (e.g. /?lat=..&lon=..) is the same app shell.
  const key = request.mode === 'navigate' ? './' : request;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(key, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(key, { ignoreSearch: request.mode === 'navigate' });
    if (cached) return cached;
    throw err;
  }
}
