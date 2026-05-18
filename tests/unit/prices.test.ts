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
import { listLocalAssets, setLocalCatalog } from '@/lib/catalog';
import { getLastPriceSyncAt, syncPrices, type PricePayload } from '@/lib/prices';
import { priceHistoryRepo } from '@/lib/priceHistoryRepo';
import type { MarketAsset } from '@/lib/schema';

const WASM_PATH = path.resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm');
fs.readFileSync(WASM_PATH);

const asset = (symbol: string, price = 0): MarketAsset => ({
  symbol,
  name: symbol,
  category: '국내증권',
  currency: 'KRW',
  currentPrice: price,
  dailyChange: 0,
  dailyChangePct: 0,
  updatedAt: '',
});

function fakeFetch(payload: PricePayload, ok = true): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status: ok ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;
}

interface HistoryResp {
  symbol: string;
  status: 'pending' | 'ready' | 'failed' | 'unknown';
  rows: { date: string; close: number }[];
}

function multiFetch(handlers: {
  prices?: PricePayload;
  history?: Record<string, HistoryResp>;
}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/prices/history')) {
      const symbol = new URL(url, 'http://x').searchParams.get('symbol') ?? '';
      const resp = handlers.history?.[symbol] ?? {
        symbol,
        status: 'unknown' as const,
        rows: [],
      };
      return new Response(JSON.stringify(resp), { status: 200 });
    }
    if (url.startsWith('/api/prices')) {
      return new Response(JSON.stringify(handlers.prices ?? {}), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
}

beforeEach(async () => {
  _resetDbForTests();
  setPersister(new MemoryDbPersister());
  await initDb({ locateFile: () => `file://${WASM_PATH}` });
  setStorage(new SqliteKvStore());
});

describe('syncPrices', () => {
  it('updates price fields for matching symbols and leaves the rest', async () => {
    setLocalCatalog('1.0.0', [asset('KRX:A'), asset('KRX:B'), asset('KRX:GOLD')]);

    const payload: PricePayload = {
      version: '1.0.0',
      asOf: '2026-05-16T17:28:01+09:00',
      prices: {
        'KRX:A': { price: 1000, change: 10, changePct: 1.0 },
        'KRX:B': { price: 2000, change: -20, changePct: -1.0 },
        // KRX:GOLD intentionally omitted — should stay at 0
      },
    };

    await syncPrices(fakeFetch(payload));

    const after = listLocalAssets();
    const a = after.find((x) => x.symbol === 'KRX:A')!;
    const b = after.find((x) => x.symbol === 'KRX:B')!;
    const g = after.find((x) => x.symbol === 'KRX:GOLD')!;

    expect(a.currentPrice).toBe(1000);
    expect(a.dailyChange).toBe(10);
    expect(a.dailyChangePct).toBe(1.0);
    expect(a.updatedAt).toBe('2026-05-16T17:28:01+09:00');

    expect(b.currentPrice).toBe(2000);
    expect(b.dailyChangePct).toBe(-1.0);

    expect(g.currentPrice).toBe(0);
    expect(g.updatedAt).toBe('');
  });

  it('stores lastSyncAt on success', async () => {
    setLocalCatalog('1.0.0', [asset('KRX:A')]);
    expect(getLastPriceSyncAt()).toBeNull();

    await syncPrices(fakeFetch({ version: '1.0.0', asOf: '2026-05-16', prices: {} }));

    const ts = getLastPriceSyncAt();
    expect(ts).toBeTruthy();
    expect(new Date(ts!).toString()).not.toBe('Invalid Date');
  });

  it('throws on non-OK response and does not update lastSyncAt', async () => {
    setLocalCatalog('1.0.0', [asset('KRX:A')]);

    await expect(
      syncPrices(fakeFetch({ version: '1.0.0', asOf: '', prices: {} }, false)),
    ).rejects.toThrow();

    expect(getLastPriceSyncAt()).toBeNull();
  });

  it('preserves catalog version (does not bump catalog state)', async () => {
    setLocalCatalog('3.3.0', [asset('KRX:A')]);

    await syncPrices(
      fakeFetch({
        version: '3.3.0',
        asOf: '',
        prices: { 'KRX:A': { price: 500, change: 0, changePct: 0 } },
      }),
    );

    // listLocalAssets should still find the asset; catalog version untouched
    const { getLocalCatalogVersion } = await import('@/lib/catalog');
    expect(getLocalCatalogVersion()).toBe('3.3.0');
  });
});

describe('syncPrices — history sync (held symbols)', () => {
  const businessDays = ['2026-05-13', '2026-05-14', '2026-05-15'];
  const todayClose = 1100;

  function pricesPayload(): PricePayload {
    return {
      version: '3.3.0',
      asOf: '2026-05-15T15:30:00+09:00',
      prices: { 'KRX:A': { price: todayClose, change: 10, changePct: 1.0 } },
      recentBusinessDays: businessDays,
    };
  }

  it('first sync (empty local history) → fetches /api/prices/history and appends rows', async () => {
    setLocalCatalog('1.0.0', [asset('KRX:A')]);
    expect(priceHistoryRepo.getMaxDate('KRX:A')).toBeNull();

    const fetch = multiFetch({
      prices: pricesPayload(),
      history: {
        'KRX:A': {
          symbol: 'KRX:A',
          status: 'ready',
          rows: [
            { date: '2026-05-13', close: 1080 },
            { date: '2026-05-14', close: 1090 },
            { date: '2026-05-15', close: 1100 },
          ],
        },
      },
    });

    await syncPrices(fetch, ['KRX:A']);

    expect(priceHistoryRepo.getMaxDate('KRX:A')).toBe('2026-05-15');
    expect(priceHistoryRepo.listSince('KRX:A', '2026-01-01')).toHaveLength(3);
  });

  it('1-business-day gap → appends today\'s close from bulk payload (no /api/prices/history call)', async () => {
    setLocalCatalog('1.0.0', [asset('KRX:A')]);
    priceHistoryRepo.append('KRX:A', [
      { date: '2026-05-13', close: 1080 },
      { date: '2026-05-14', close: 1090 },
    ]);

    // history handler intentionally throws if hit — to assert no call made
    let historyCalled = false;
    const fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/prices/history')) {
        historyCalled = true;
        return new Response('{"rows":[]}', { status: 200 });
      }
      return new Response(JSON.stringify(pricesPayload()), { status: 200 });
    }) as unknown as typeof fetch;

    await syncPrices(fetch, ['KRX:A']);

    expect(historyCalled).toBe(false);
    expect(priceHistoryRepo.getMaxDate('KRX:A')).toBe('2026-05-15');
    const last = priceHistoryRepo.listSince('KRX:A', '2026-05-15');
    expect(last).toEqual([{ date: '2026-05-15', close: todayClose }]);
  });

  it('already in sync (local_max == latest business day) → no-op', async () => {
    setLocalCatalog('1.0.0', [asset('KRX:A')]);
    priceHistoryRepo.append('KRX:A', [{ date: '2026-05-15', close: 1100 }]);

    let historyCalled = false;
    const fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/prices/history')) {
        historyCalled = true;
      }
      return new Response(JSON.stringify(pricesPayload()), { status: 200 });
    }) as unknown as typeof fetch;

    await syncPrices(fetch, ['KRX:A']);

    expect(historyCalled).toBe(false);
    expect(priceHistoryRepo.listSince('KRX:A', '2026-01-01')).toHaveLength(1);
  });

  it('2+ business-day gap → skip per requirement (no history call, no append)', async () => {
    setLocalCatalog('1.0.0', [asset('KRX:A')]);
    priceHistoryRepo.append('KRX:A', [{ date: '2026-05-13', close: 1080 }]);
    // gap is now 2 business days (13 → 14, 14 → 15)

    let historyCalled = false;
    const fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/prices/history')) {
        historyCalled = true;
      }
      return new Response(JSON.stringify(pricesPayload()), { status: 200 });
    }) as unknown as typeof fetch;

    await syncPrices(fetch, ['KRX:A']);

    expect(historyCalled).toBe(false);
    expect(priceHistoryRepo.getMaxDate('KRX:A')).toBe('2026-05-13'); // untouched
  });

  it('symbol not in bulk payload → skipped (no append)', async () => {
    setLocalCatalog('1.0.0', [asset('KRX:UNKNOWN')]);
    priceHistoryRepo.append('KRX:UNKNOWN', [{ date: '2026-05-14', close: 500 }]);

    const fetch = multiFetch({ prices: pricesPayload() });
    await syncPrices(fetch, ['KRX:UNKNOWN']);

    expect(priceHistoryRepo.getMaxDate('KRX:UNKNOWN')).toBe('2026-05-14');
  });
});
