import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  _resetDbForTests,
  initDb,
  MemoryDbPersister,
  setPersister,
} from '@/lib/db';
import { fxHistoryRepo, type FxHistoryRow } from '@/lib/fxHistoryRepo';
import { syncFxHistory } from '@/lib/fx';

const WASM_PATH = path.resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm');
fs.readFileSync(WASM_PATH);

function fakeFetch(handler: (url: string) => { rows: FxHistoryRow[] } | null): {
  fn: typeof fetch;
  calls: string[];
} {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const body = handler(url);
    if (body === null) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify({ pair: 'USDKRW', rows: body.rows }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

beforeEach(async () => {
  _resetDbForTests();
  setPersister(new MemoryDbPersister());
  await initDb({ locateFile: () => `file://${WASM_PATH}` });
});

describe('syncFxHistory', () => {
  it('empty local: fetches from default epoch and appends every row', async () => {
    const { fn, calls } = fakeFetch(() => ({
      rows: [
        { date: '2026-05-19', rate: 1507.85 },
        { date: '2026-05-20', rate: 1499.77 },
      ],
    }));
    await syncFxHistory(fn, 'USDKRW');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('pair=USDKRW');
    expect(calls[0]).toContain('from=2000-01-01');
    expect(fxHistoryRepo.getMaxDate('USDKRW')).toBe('2026-05-20');
    expect(fxHistoryRepo.listAll('USDKRW')).toHaveLength(2);
  });

  it('gap backfill: uses next calendar day after localMax as `from`', async () => {
    fxHistoryRepo.append('USDKRW', [
      { date: '2026-05-12', rate: 1485 },
      { date: '2026-05-13', rate: 1489.83 },
    ]);
    const { fn, calls } = fakeFetch(() => ({
      rows: [
        { date: '2026-05-14', rate: 1493.33 },
        { date: '2026-05-15', rate: 1495.10 },
      ],
    }));
    await syncFxHistory(fn, 'USDKRW');
    expect(calls[0]).toContain('from=2026-05-14');
    expect(fxHistoryRepo.getMaxDate('USDKRW')).toBe('2026-05-15');
    expect(fxHistoryRepo.listAll('USDKRW')).toHaveLength(4);
  });

  // Regression test for the bug that left the FX rate card stale: the old
  // sync block bailed out as soon as localCount > 100, so once the cache
  // had been seeded once, the user's settings page never saw a new daily
  // rate ever again.
  it('regression: still syncs when local has >100 rows but localMax is stale', async () => {
    const seeded: FxHistoryRow[] = [];
    for (let i = 0; i < 150; i++) {
      const d = new Date(Date.UTC(2025, 0, 1));
      d.setUTCDate(d.getUTCDate() + i);
      seeded.push({ date: d.toISOString().slice(0, 10), rate: 1400 + i });
    }
    fxHistoryRepo.append('USDKRW', seeded);
    const localMaxBefore = fxHistoryRepo.getMaxDate('USDKRW');
    expect(localMaxBefore).toBe('2025-05-30');

    const { fn, calls } = fakeFetch(() => ({
      rows: [{ date: '2026-05-23', rate: 1520.53 }],
    }));
    await syncFxHistory(fn, 'USDKRW');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('from=2025-05-31');
    expect(fxHistoryRepo.getMaxDate('USDKRW')).toBe('2026-05-23');
  });

  it('server returns empty rows: no error, local unchanged', async () => {
    fxHistoryRepo.append('USDKRW', [{ date: '2026-05-23', rate: 1520 }]);
    const { fn } = fakeFetch(() => ({ rows: [] }));
    await syncFxHistory(fn, 'USDKRW');
    expect(fxHistoryRepo.getMaxDate('USDKRW')).toBe('2026-05-23');
    expect(fxHistoryRepo.listAll('USDKRW')).toHaveLength(1);
  });

  it('non-OK response: swallows error, local unchanged', async () => {
    fxHistoryRepo.append('USDKRW', [{ date: '2026-05-23', rate: 1520 }]);
    const fn = (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    await expect(syncFxHistory(fn, 'USDKRW')).resolves.toBeUndefined();
    expect(fxHistoryRepo.listAll('USDKRW')).toHaveLength(1);
  });
});
