/**
 * Regression test for the "manual price sync shows stale value" bug.
 *
 * Symptom: tapping 시세 동기화 (or any refresh) never updated the displayed
 * price — the app kept showing the value from the *previous* sync. Cause:
 * public/sw.js routed GET /api/prices* through StaleWhileRevalidate, which
 * returns the cached (stale) response immediately and only refreshes the
 * cache in the background. So applyPricePayload() always saw last cycle's
 * data. Price/FX endpoints must be NetworkFirst (fresh online, cache only
 * as an offline fallback); the large, rarely-changing catalog stays SWR.
 *
 * This evaluates the *actual* public/sw.js (no duplicated logic) by pulling
 * its pure chooseStrategy() out of the file text, so the test can't drift
 * from what ships.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const swPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../public/sw.js',
);
const src = readFileSync(swPath, 'utf8');
// sw.js guards its `self.addEventListener(...)` registrations, so loading it
// outside a ServiceWorker scope is safe; we just grab chooseStrategy.
const chooseStrategy = new Function(`${src}\n; return chooseStrategy;`)() as (
  pathname: string,
  method?: string,
  mode?: string,
) => string;

describe('sw chooseStrategy', () => {
  it('serves price data network-first (the bug: was stale-while-revalidate)', () => {
    expect(chooseStrategy('/api/prices')).toBe('networkFirst');
    expect(chooseStrategy('/api/prices/live')).toBe('networkFirst');
    expect(chooseStrategy('/api/prices/history')).toBe('networkFirst');
  });

  it('serves fx data network-first', () => {
    expect(chooseStrategy('/api/fx/history')).toBe('networkFirst');
  });

  it('keeps the large catalog on stale-while-revalidate', () => {
    expect(chooseStrategy('/api/catalog')).toBe('staleWhileRevalidate');
    expect(chooseStrategy('/api/catalog/version')).toBe('staleWhileRevalidate');
  });

  it('caches content-hashed static assets cache-first', () => {
    expect(chooseStrategy('/_next/static/chunks/main.js')).toBe('cacheFirst');
    expect(chooseStrategy('/sql-wasm.wasm')).toBe('cacheFirst');
  });

  it('serves HTML navigations network-first', () => {
    expect(chooseStrategy('/holdings', 'GET', 'navigate')).toBe('networkFirst');
  });

  it('passes through mutations and unmatched GETs', () => {
    expect(chooseStrategy('/api/prices', 'POST')).toBe('passthrough');
    expect(chooseStrategy('/api/backup', 'GET')).toBe('passthrough');
  });
});
