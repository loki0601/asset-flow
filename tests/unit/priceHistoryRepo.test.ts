import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  _resetDbForTests,
  initDb,
  MemoryDbPersister,
  setPersister,
} from '@/lib/db';
import { priceHistoryRepo } from '@/lib/priceHistoryRepo';

const WASM_PATH = path.resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm');
fs.readFileSync(WASM_PATH);

beforeEach(async () => {
  _resetDbForTests();
  setPersister(new MemoryDbPersister());
  await initDb({ locateFile: () => `file://${WASM_PATH}` });
});

describe('priceHistoryRepo', () => {
  it('returns null for getMaxDate when symbol has no history', () => {
    expect(priceHistoryRepo.getMaxDate('KRX:005930')).toBeNull();
  });

  it('append + getMaxDate returns the latest date for that symbol only', () => {
    priceHistoryRepo.append('KRX:005930', [
      { date: '2026-05-14', close: 100 },
      { date: '2026-05-15', close: 105 },
    ]);
    priceHistoryRepo.append('KRX:000660', [{ date: '2026-05-15', close: 200 }]);

    expect(priceHistoryRepo.getMaxDate('KRX:005930')).toBe('2026-05-15');
    expect(priceHistoryRepo.getMaxDate('KRX:000660')).toBe('2026-05-15');
    expect(priceHistoryRepo.getMaxDate('NASDAQ:AAPL')).toBeNull();
  });

  it('append is idempotent — same (symbol,date) overwrites close', () => {
    priceHistoryRepo.append('KRX:A', [{ date: '2026-05-15', close: 100 }]);
    priceHistoryRepo.append('KRX:A', [{ date: '2026-05-15', close: 110 }]);

    const rows = priceHistoryRepo.listSince('KRX:A', '2026-01-01');
    expect(rows).toEqual([{ date: '2026-05-15', close: 110 }]);
  });

  it('listSince filters by from-date inclusive and orders ascending', () => {
    priceHistoryRepo.append('KRX:A', [
      { date: '2026-05-12', close: 100 },
      { date: '2026-05-13', close: 101 },
      { date: '2026-05-14', close: 102 },
      { date: '2026-05-15', close: 103 },
    ]);

    const rows = priceHistoryRepo.listSince('KRX:A', '2026-05-13');
    expect(rows.map((r) => r.date)).toEqual(['2026-05-13', '2026-05-14', '2026-05-15']);
    expect(rows[0].close).toBe(101);
  });

  it('deleteSymbol removes all rows for the symbol only', () => {
    priceHistoryRepo.append('KRX:A', [{ date: '2026-05-15', close: 100 }]);
    priceHistoryRepo.append('KRX:B', [{ date: '2026-05-15', close: 200 }]);

    priceHistoryRepo.deleteSymbol('KRX:A');

    expect(priceHistoryRepo.getMaxDate('KRX:A')).toBeNull();
    expect(priceHistoryRepo.getMaxDate('KRX:B')).toBe('2026-05-15');
  });
});
