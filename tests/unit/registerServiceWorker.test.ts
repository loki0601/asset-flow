/**
 * Regression test for "shipped sw.js update never reaches the device".
 *
 * Cause: registerServiceWorker() relied on the browser's automatic SW update
 * check, which only runs on navigation / every ~24h. Capacitor's live-mode
 * WebView never navigates that way, so a stale v4 service worker kept serving
 * cached /api/prices for days — the headline price froze while the chart (a
 * different URL) refreshed. The fix forces reg.update() every boot, promotes
 * any already-installed `waiting` worker, and reloads once on controllerchange
 * so the page is actually controlled by the new SW.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

async function flush() {
  // Let the register() promise + its .then chain settle.
  await Promise.resolve();
  await Promise.resolve();
}

function installMocks(opts: { hasWaiting: boolean; hasController: boolean }) {
  const waiting = opts.hasWaiting ? { postMessage: vi.fn() } : null;
  const reg = {
    update: vi.fn().mockResolvedValue(undefined),
    waiting,
    addEventListener: vi.fn(),
  };
  const swListeners: Record<string, () => void> = {};
  const serviceWorker = {
    controller: opts.hasController ? {} : null,
    register: vi.fn().mockResolvedValue(reg),
    addEventListener: vi.fn((type: string, cb: () => void) => {
      swListeners[type] = cb;
    }),
  };
  const reload = vi.fn();
  vi.stubGlobal('window', {});
  vi.stubGlobal('navigator', { serviceWorker });
  vi.stubGlobal('location', { reload });
  vi.stubGlobal('sessionStorage', {
    _m: new Map<string, string>(),
    getItem(k: string) {
      return this._m.get(k) ?? null;
    },
    setItem(k: string, v: string) {
      this._m.set(k, v);
    },
  });
  return { reg, waiting, serviceWorker, reload, swListeners };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('registerServiceWorker', () => {
  it('forces an update check on every boot', async () => {
    const { reg } = installMocks({ hasWaiting: false, hasController: true });
    const { registerServiceWorker } = await import('@/lib/serviceWorker');
    registerServiceWorker();
    await flush();
    expect(reg.update).toHaveBeenCalled();
  });

  it('promotes an already-waiting worker immediately', async () => {
    const { waiting } = installMocks({ hasWaiting: true, hasController: true });
    const { registerServiceWorker } = await import('@/lib/serviceWorker');
    registerServiceWorker();
    await flush();
    expect(waiting?.postMessage).toHaveBeenCalledWith('skipWaiting');
  });

  it('reloads once when the controller changes', async () => {
    const { reload, swListeners } = installMocks({ hasWaiting: false, hasController: true });
    const { registerServiceWorker } = await import('@/lib/serviceWorker');
    registerServiceWorker();
    await flush();
    expect(typeof swListeners.controllerchange).toBe('function');
    swListeners.controllerchange();
    expect(reload).toHaveBeenCalledTimes(1);
    // A second controllerchange must not cause a reload loop.
    swListeners.controllerchange();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
