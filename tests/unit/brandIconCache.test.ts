import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  _resetDbForTests,
  initDb,
  MemoryDbPersister,
  setPersister,
  SqliteKvStore,
} from '@/lib/db';
import { setStorage } from '@/lib/storage';
import {
  _resetBrandIconCacheForTests,
  cachedBrandIcon,
  cachedManifestVersion,
  syncBrandIconManifest,
} from '@/lib/brandIconCache';
import { assetBrandIcon } from '@/lib/assetBrandIcon';

const WASM_PATH = path.resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm');
fs.readFileSync(WASM_PATH);

function fakeFetch(handler: (input: string, init?: RequestInit) => Response): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init)) as unknown as typeof fetch;
}

beforeEach(async () => {
  _resetDbForTests();
  setPersister(new MemoryDbPersister());
  await initDb({ locateFile: () => `file://${WASM_PATH}` });
  setStorage(new SqliteKvStore());
  _resetBrandIconCacheForTests();
});

describe('syncBrandIconManifest', () => {
  it('populates the KV cache on first sync and exposes the version', async () => {
    const payload = {
      version: 'v1',
      icons: {
        'NASDAQ:DIS': { path: 'M0 0h1', viewBox: '0 0 24 24', slug: 'disney' },
      },
    };
    const fn = fakeFetch(() =>
      new Response(JSON.stringify(payload), { status: 200 }),
    );
    await syncBrandIconManifest(fn);
    expect(cachedManifestVersion()).toBe('v1');
    expect(cachedBrandIcon('NASDAQ:DIS')).toMatchObject({ slug: 'disney' });
  });

  it('sends If-None-Match on subsequent calls and skips a 304 response', async () => {
    const payload = {
      version: 'v1',
      icons: {
        'NASDAQ:DIS': { path: 'M0 0h1', viewBox: '0 0 24 24', slug: 'disney' },
      },
    };
    let firstResponse = true;
    const seenHeaders: (string | null)[] = [];
    const fn = fakeFetch((_url, init) => {
      seenHeaders.push(
        (init?.headers as Record<string, string> | undefined)?.['If-None-Match'] ?? null,
      );
      if (firstResponse) {
        firstResponse = false;
        return new Response(JSON.stringify(payload), { status: 200 });
      }
      return new Response(null, { status: 304 });
    });

    await syncBrandIconManifest(fn);
    await syncBrandIconManifest(fn);

    expect(seenHeaders[0]).toBeNull();
    expect(seenHeaders[1]).toBe('"v1"');
    expect(cachedManifestVersion()).toBe('v1'); // unchanged
  });

  it('replaces the cache when the manifest version changes', async () => {
    const v1 = {
      version: 'v1',
      icons: {
        'NASDAQ:AAPL': { path: 'OLD', viewBox: '0 0 24 24', slug: 'apple-v1' },
      },
    };
    const v2 = {
      version: 'v2',
      icons: {
        'NASDAQ:AAPL': { path: 'NEW', viewBox: '0 0 24 24', slug: 'apple-v2' },
        'NASDAQ:DIS': { path: 'D', viewBox: '0 0 24 24', slug: 'disney' },
      },
    };
    let i = 0;
    const fn = fakeFetch(() =>
      new Response(JSON.stringify([v1, v2][i++]), { status: 200 }),
    );
    await syncBrandIconManifest(fn);
    expect(cachedBrandIcon('NASDAQ:AAPL')?.slug).toBe('apple-v1');
    await syncBrandIconManifest(fn);
    expect(cachedBrandIcon('NASDAQ:AAPL')?.slug).toBe('apple-v2');
    expect(cachedBrandIcon('NASDAQ:DIS')?.slug).toBe('disney');
  });

  it('swallows network failures without throwing', async () => {
    const fn = fakeFetch(() => {
      throw new Error('network unreachable');
    });
    await expect(syncBrandIconManifest(fn)).resolves.toBeUndefined();
  });

  it('keeps the previous cache when the server returns a non-OK response', async () => {
    const payload = {
      version: 'v1',
      icons: {
        'NASDAQ:AAPL': { path: 'OK', viewBox: '0 0 24 24', slug: 'apple' },
      },
    };
    const fn = fakeFetch(() => new Response(JSON.stringify(payload), { status: 200 }));
    await syncBrandIconManifest(fn);
    const badFn = fakeFetch(() => new Response('boom', { status: 500 }));
    await syncBrandIconManifest(badFn);
    expect(cachedBrandIcon('NASDAQ:AAPL')?.slug).toBe('apple');
  });
});

describe('assetBrandIcon — cache integration', () => {
  it('prefers the KV cache over the inline fallback', async () => {
    const payload = {
      version: 'v1',
      icons: {
        'NASDAQ:AAPL': { path: 'CACHED', viewBox: '0 0 24 24', slug: 'apple-cached' },
      },
    };
    const fn = fakeFetch(() => new Response(JSON.stringify(payload), { status: 200 }));
    await syncBrandIconManifest(fn);
    const icon = assetBrandIcon({ symbol: 'NASDAQ:AAPL' });
    expect(icon?.slug).toBe('apple-cached');
    expect(icon?.path).toBe('CACHED');
  });

  it('falls back to the inline map when the cache lacks the symbol', () => {
    // Cache empty (no sync), but AAPL is in the inline SYMBOL_MAP.
    const icon = assetBrandIcon({ symbol: 'NASDAQ:AAPL' });
    expect(icon).not.toBeNull();
  });

  it('returns null when neither cache nor inline map have the symbol', () => {
    expect(assetBrandIcon({ symbol: 'NASDAQ:NEVERHEARDOF' })).toBeNull();
  });
});
