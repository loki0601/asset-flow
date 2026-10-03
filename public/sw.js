/* AssetFlow service worker — turns the live-URL Capacitor WebView into a
 * mostly-offline app.
 *
 * Strategies:
 *   - /_next/static/*  (chunks, css, fonts — content-hashed)   → CacheFirst
 *   - /sql-wasm.wasm                                            → CacheFirst
 *   - HTML navigations (mode=navigate / app routes)             → NetworkFirst + timeout
 *   - GET /api/catalog, /api/catalog/version                    → StaleWhileRevalidate
 *   - GET /api/prices*, /api/prices/live, /api/fx*              → NetworkFirst
 *   - POST and other mutating methods                           → Network only (pass-through)
 *
 * Why navigations get a TIMEOUT: plain NetworkFirst awaits the full
 * Cloudflare-tunnel round trip before rendering anything, so a slow tunnel
 * made every page transition crawl. The timeout races the network against
 * NAV_TIMEOUT_MS and serves the cached page when the network is slower —
 * fresh HTML still wins whenever the tunnel responds in time, so deploys
 * keep propagating normally (the no-store header policy stays authoritative).
 *
 * Why prices are NetworkFirst (not SWR): SWR returns the *cached* response
 * immediately and only refreshes the cache in the background, so the app
 * always rendered last sync's price — tapping refresh appeared to do nothing.
 * Prices/FX must be fresh when online; the cache is only an offline fallback.
 * The big, rarely-changing catalog stays on SWR for instant cold starts.
 *
 * Cache version is bumped here on intentional invalidation (or via the
 * client posting {type: 'BUMP_CACHE'}). Old caches are pruned on activate.
 */
// Bumped 2026-09-29: a stale cached navigation (HTML referencing an old JS
// bundle) survived a client-side bug fix deploy because networkFirstTimeout
// falls back to this SW's own cache — which next.config's no-store header
// on HTML doesn't touch, since the Cache Storage API isn't subject to it —
// whenever the Cloudflare Tunnel round trip missed NAV_TIMEOUT_MS. Bumping
// VERSION forces every client to drop that cache and re-fetch fresh HTML/JS
// on next boot. Bump this again whenever a client-side fix must reach
// existing installs immediately rather than on their next lucky fast fetch.
// Bumped 2026-09-30: client-side fix for a false "logged out" bounce
// (AuthProvider's boot effect treated any network failure during boot sync
// as "no session" — see src/lib/bootAuth.ts). Must reach existing installs
// immediately.
// Bumped 2026-10-03: price-history sync now mirrors the server (purges stale local
// history once) — must reach existing installs immediately.
const VERSION = 'v10';
const CACHE = `assetflow-${VERSION}`;

// Navigation network deadline. Long enough for a healthy tunnel round trip,
// short enough that a congested one falls back to cache instead of blocking.
const NAV_TIMEOUT_MS = 2500;

const STATIC_PATTERNS = [/^\/_next\/static\//, /\.wasm$/, /\/sql-wasm\.wasm$/];
// Catalog is large and changes rarely → serve cached instantly, refresh behind.
const SWR_API_PATTERNS = [/^\/api\/catalog(?:\/|$|\?)/];
// Prices/FX must reflect the server on every fetch → network-first.
const NETWORK_FIRST_API_PATTERNS = [
  /^\/api\/prices(?:\/|$|\?)/,
  /^\/api\/fx(?:\/|$|\?)/,
];

/**
 * Pure routing decision — given a request's pathname/method/mode, return the
 * caching strategy name. Kept side-effect free (no `caches`/`fetch`) so it can
 * be unit-tested directly against this file. Returns one of:
 *   'cacheFirst' | 'staleWhileRevalidate' | 'networkFirst' |
 *   'networkFirstTimeout' | 'passthrough'
 */
function chooseStrategy(pathname, method, mode) {
  if (method && method !== 'GET') return 'passthrough';
  if (STATIC_PATTERNS.some((re) => re.test(pathname))) return 'cacheFirst';
  if (NETWORK_FIRST_API_PATTERNS.some((re) => re.test(pathname))) return 'networkFirst';
  if (SWR_API_PATTERNS.some((re) => re.test(pathname))) return 'staleWhileRevalidate';
  if (mode === 'navigate') return 'networkFirstTimeout';
  return 'passthrough';
}

if (typeof self !== 'undefined' && self.addEventListener) {
  self.addEventListener('install', (event) => {
    // Activate immediately on first install; on subsequent updates the page
    // can postMessage('skipWaiting') after letting users finish current work.
    self.skipWaiting();
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
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

    // `document`-destination navigations count as navigate even when the
    // Request.mode isn't reported as such by the WebView.
    const mode = req.mode === 'navigate' || req.destination === 'document' ? 'navigate' : req.mode;
    const strategy = chooseStrategy(url.pathname, req.method, mode);

    if (strategy === 'cacheFirst') {
      event.respondWith(cacheFirst(req));
    } else if (strategy === 'staleWhileRevalidate') {
      event.respondWith(staleWhileRevalidate(req));
    } else if (strategy === 'networkFirst') {
      event.respondWith(networkFirst(req));
    } else if (strategy === 'networkFirstTimeout') {
      event.respondWith(networkFirst(req, NAV_TIMEOUT_MS));
    }
    // 'passthrough': let the network handle it directly (no caching).
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
}

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

async function networkFirst(request, timeoutMs) {
  const cache = await caches.open(CACHE);
  const networkPromise = fetch(request).then((res) => {
    // Cache-put even when the timeout already lost the race — the fresh
    // copy then serves the NEXT navigation instantly.
    if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  });
  try {
    if (!timeoutMs) return await networkPromise;
    const winner = await Promise.race([
      networkPromise,
      new Promise((resolve) => setTimeout(() => resolve('timeout'), timeoutMs)),
    ]);
    if (winner !== 'timeout') return winner;
    const cached = await cache.match(request);
    if (cached) {
      networkPromise.catch(() => {}); // keep background refresh from surfacing as unhandled
      return cached;
    }
    return await networkPromise; // nothing cached — wait it out
  } catch {
    const cached = await cache.match(request);
    return cached || new Response('', { status: 504, statusText: 'offline' });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { chooseStrategy };
}
