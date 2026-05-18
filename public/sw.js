/* AssetFlow service worker — turns the live-URL Capacitor WebView into a
 * mostly-offline app.
 *
 * Strategies:
 *   - /_next/static/*  (chunks, css, fonts — content-hashed)   → CacheFirst
 *   - /sql-wasm.wasm                                            → CacheFirst
 *   - HTML navigations (mode=navigate / app routes)             → StaleWhileRevalidate
 *   - GET /api/catalog, /api/catalog/version                    → StaleWhileRevalidate
 *   - GET /api/prices*, /api/fx*, /api/prices/history*          → StaleWhileRevalidate
 *   - POST and other mutating methods                           → Network only (pass-through)
 *
 * Cache version is bumped here on intentional invalidation (or via the
 * client posting {type: 'BUMP_CACHE'}). Old caches are pruned on activate.
 */
const VERSION = 'v4';
const CACHE = `assetflow-${VERSION}`;

const STATIC_PATTERNS = [/^\/_next\/static\//, /\.wasm$/, /\/sql-wasm\.wasm$/];
const SWR_API_PATTERNS = [
  /^\/api\/catalog(?:\/|$|\?)/,
  /^\/api\/prices(?:\/|$|\?)/,
  /^\/api\/fx(?:\/|$|\?)/,
];

self.addEventListener('install', (event) => {
  // Activate immediately on first install; on subsequent updates the page
  // can postMessage('skipWaiting') after letting users finish current work.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // mutations bypass the SW entirely

  const url = new URL(req.url);
  // Only cache same-origin requests — third-party (fonts, CDN) handled by browser.
  if (url.origin !== self.location.origin) return;

  if (STATIC_PATTERNS.some((re) => re.test(url.pathname))) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (SWR_API_PATTERNS.some((re) => re.test(url.pathname))) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (req.mode === 'navigate' || req.destination === 'document') {
    // HTML navigations use NetworkFirst (with cache fallback for offline):
    // we previously did SWR here but it made the user see *cached* HTML —
    // which referenced *old* chunk hashes — even after a fresh deploy. The
    // new HTML was only used on the visit AFTER. NetworkFirst gives the
    // fresh chunk graph immediately, and offline access still works via
    // the fallback when the network is unreachable.
    event.respondWith(networkFirst(req));
    return;
  }
  // Other GETs: let the network handle directly (no caching).
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data === 'skipWaiting' || data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (data?.type === 'BUMP_CACHE') {
    // Force the activate path to prune everything.
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    // Network failed and no cache — best we can do is propagate the error.
    return new Response('', { status: 504, statusText: 'offline' });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => null);
  // Return cached immediately if present; otherwise wait for network.
  return cached || (await networkPromise) || new Response('', { status: 504 });
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch {
    const cached = await cache.match(request);
    return cached || new Response('', { status: 504, statusText: 'offline' });
  }
}
