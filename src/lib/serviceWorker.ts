'use client';

/**
 * Register the AssetFlow service worker. Idempotent — safe to call on every
 * AuthProvider mount. We don't await registration; the SW progress lives in
 * its own lifecycle and doesn't block app boot.
 *
 * Why the explicit reg.update(): browsers only auto-check for a new sw.js on
 * navigation and at most every ~24h. Capacitor's live-mode WebView doesn't
 * navigate in a way that triggers that check, so without a manual update()
 * call a shipped sw.js change can sit unapplied for days — the symptom was a
 * headline price frozen for over a week while the chart (a different URL that
 * dodged the stale cache) kept refreshing. We force the check every boot,
 * promote any worker already parked in `waiting`, and reload exactly once when
 * the controller flips so the page is actually driven by the new SW.
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  // Reload once when a new SW takes control, so the page runs under the fresh
  // worker (and its fresh caching strategies) instead of the one that booted
  // us. Guarded against reload loops: after the reload the new SW is already
  // the controller, so no further controllerchange fires.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((reg) => {
      // Force an update check on every boot (see header comment).
      reg.update().catch(() => {});
      // A worker installed on a previous boot but never activated — promote it.
      if (reg.waiting) reg.waiting.postMessage('skipWaiting');

      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          // As soon as the new worker is installed, tell it to skip waiting.
          // controllerchange (above) then reloads the page under the new SW.
          if (nw.state === 'installed') {
            nw.postMessage('skipWaiting');
          }
        });
      });
    })
    .catch((err) => {
      console.warn('[sw] registration failed', err);
    });
}
