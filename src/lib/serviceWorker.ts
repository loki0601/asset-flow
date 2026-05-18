'use client';

/**
 * Register the AssetFlow service worker. Idempotent — safe to call on every
 * AuthProvider mount. We don't await registration; the SW progress lives in
 * its own lifecycle and doesn't block app boot.
 *
 * When a new SW version is detected we postMessage('skipWaiting') and bump
 * a counter in sessionStorage. After two cycles we trigger a soft reload so
 * the new HTML chunk graph is picked up — without this the user can sit on
 * the previous deploy's bundle for the whole session.
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  // Avoid double-registering on react strict-mode double-mounts.
  if (navigator.serviceWorker.controller && (window as unknown as { __sw_registered?: boolean }).__sw_registered) {
    return;
  }
  (window as unknown as { __sw_registered?: boolean }).__sw_registered = true;

  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((reg) => {
      // Surface updates: when a new SW takes over after we already have
      // controlled chunks, force a soft reload so the new HTML chunk graph
      // is fetched. Throttled via session flag to avoid reload loops.
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            nw.postMessage('skipWaiting');
            const k = '__assetflow_sw_reload_at';
            const last = Number(sessionStorage.getItem(k) || '0');
            if (Date.now() - last > 30_000) {
              sessionStorage.setItem(k, String(Date.now()));
              // Soft reload — chunks come from the new SW cache.
              setTimeout(() => location.reload(), 500);
            }
          }
        });
      });
    })
    .catch((err) => {
      console.warn('[sw] registration failed', err);
    });
}
