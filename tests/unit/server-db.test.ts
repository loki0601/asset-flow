/**
 * Tests for the server-side SQLite DB (better-sqlite3). Schema bootstrap +
 * trackedSymbolsRepo + priceHistoryRepo (server).
 *
 * Uses an in-memory DB so tests don't touch the on-disk server.db.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  openServerDb,
  setServerDbForTests,
  trackedSymbolsRepo,
  serverPriceHistoryRepo,
  shouldBackfill,
} from '@/server/db';

beforeEach(() => {
  const db = openServerDb(':memory:');
  setServerDbForTests(db);
});

describe('schema bootstrap', () => {
  it('creates tracked_symbols, price_history, kr_business_days tables', () => {
    const db = openServerDb(':memory:');
    setServerDbForTests(db);
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const names = rows.map((r) => r.name);
    expect(names).toContain('tracked_symbols');
    expect(names).toContain('price_history');
    expect(names).toContain('kr_business_days');
  });
});

describe('trackedSymbolsRepo', () => {
  it('inserts with status=pending and read returns it', () => {
    trackedSymbolsRepo.upsert('KRX:005930');
    const row = trackedSymbolsRepo.get('KRX:005930');
    expect(row).toMatchObject({ symbol: 'KRX:005930', status: 'pending' });
  });

  it('upsert is idempotent — second call does not reset status', () => {
    trackedSymbolsRepo.upsert('KRX:A');
    trackedSymbolsRepo.setStatus('KRX:A', 'ready');
    trackedSymbolsRepo.upsert('KRX:A'); // should not flip back to pending
    expect(trackedSymbolsRepo.get('KRX:A')?.status).toBe('ready');
  });

  it('setStatus and setLastCloseDate update the row', () => {
    trackedSymbolsRepo.upsert('KRX:A');
    trackedSymbolsRepo.setStatus('KRX:A', 'ready');
    trackedSymbolsRepo.setLastCloseDate('KRX:A', '2026-05-15');
    const row = trackedSymbolsRepo.get('KRX:A');
    expect(row?.status).toBe('ready');
    expect(row?.last_close_date).toBe('2026-05-15');
  });

  it('listReady returns only ready symbols', () => {
    trackedSymbolsRepo.upsert('KRX:A');
    trackedSymbolsRepo.upsert('KRX:B');
    trackedSymbolsRepo.upsert('KRX:C');
    trackedSymbolsRepo.setStatus('KRX:B', 'ready');
    trackedSymbolsRepo.setStatus('KRX:C', 'failed');

    expect(trackedSymbolsRepo.listReady()).toEqual(['KRX:B']);
  });
});

describe('shouldBackfill (decision used by /api/prices/history/track)', () => {
  it('returns true when the symbol has never been seen', () => {
    expect(shouldBackfill(undefined)).toBe(true);
  });

  it('returns false while the previous backfill is still in flight', () => {
    trackedSymbolsRepo.upsert('NASDAQ:PLTR');
    expect(shouldBackfill(trackedSymbolsRepo.get('NASDAQ:PLTR'))).toBe(false);
  });

  it('returns false for a healthy ready row (source recorded)', () => {
    trackedSymbolsRepo.upsert('NASDAQ:PLTR');
    trackedSymbolsRepo.setStatus('NASDAQ:PLTR', 'ready');
    trackedSymbolsRepo.setSource('NASDAQ:PLTR', 'fdr');
    expect(shouldBackfill(trackedSymbolsRepo.get('NASDAQ:PLTR'))).toBe(false);
  });

  it('returns true on failed', () => {
    trackedSymbolsRepo.upsert('NASDAQ:PLTR');
    trackedSymbolsRepo.setStatus('NASDAQ:PLTR', 'failed');
    expect(shouldBackfill(trackedSymbolsRepo.get('NASDAQ:PLTR'))).toBe(true);
  });

  // Regression: the bug that left PLTR/AMZN/UBER stuck on 6 days of history.
  // backfill-symbol.py either never ran or got SIGKILLed before its UPDATE,
  // yet somehow status flipped to 'ready' with source still NULL. Without
  // self-heal, the existing.status !== 'failed' branch silently skips the
  // re-spawn forever — the symbol is "ready" but anemic.
  it('regression: returns true when status=ready but source is missing', () => {
    trackedSymbolsRepo.upsert('NASDAQ:PLTR');
    trackedSymbolsRepo.setStatus('NASDAQ:PLTR', 'ready');
    // source intentionally never set — mirrors the production data
    expect(trackedSymbolsRepo.get('NASDAQ:PLTR')?.source).toBeNull();
    expect(shouldBackfill(trackedSymbolsRepo.get('NASDAQ:PLTR'))).toBe(true);
  });
});

describe('serverPriceHistoryRepo', () => {
  beforeEach(() => {
    trackedSymbolsRepo.upsert('KRX:A');
  });

  it('insertMany + listSince roundtrips ordered ascending', () => {
    serverPriceHistoryRepo.insertMany('KRX:A', [
      { date: '2026-05-14', close: 100 },
      { date: '2026-05-13', close: 99 },
      { date: '2026-05-15', close: 101 },
    ]);

    const rows = serverPriceHistoryRepo.listSince('KRX:A', '2026-01-01');
    expect(rows).toEqual([
      { date: '2026-05-13', close: 99 },
      { date: '2026-05-14', close: 100 },
      { date: '2026-05-15', close: 101 },
    ]);
  });

  it('insertMany ignores duplicates on (symbol,date) PK', () => {
    serverPriceHistoryRepo.insertMany('KRX:A', [{ date: '2026-05-15', close: 100 }]);
    serverPriceHistoryRepo.insertMany('KRX:A', [{ date: '2026-05-15', close: 999 }]);
    const rows = serverPriceHistoryRepo.listSince('KRX:A', '2026-01-01');
    expect(rows).toEqual([{ date: '2026-05-15', close: 100 }]); // first write wins (INSERT OR IGNORE)
  });

  it('getMaxDate returns latest known date or null', () => {
    expect(serverPriceHistoryRepo.getMaxDate('KRX:A')).toBeNull();
    serverPriceHistoryRepo.insertMany('KRX:A', [
      { date: '2026-05-13', close: 99 },
      { date: '2026-05-15', close: 101 },
    ]);
    expect(serverPriceHistoryRepo.getMaxDate('KRX:A')).toBe('2026-05-15');
  });
});
