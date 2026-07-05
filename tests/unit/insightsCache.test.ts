import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  _resetDbForTests,
  initDb,
  kvSet,
  MemoryDbPersister,
  setPersister,
  SqliteKvStore,
} from '@/lib/db';
import { setStorage } from '@/lib/storage';
import {
  getCachedInsightsEvents,
  setCachedInsightsEvents,
} from '@/lib/insightsCache';

const WASM_PATH = path.resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm');
fs.readFileSync(WASM_PATH);

beforeEach(async () => {
  _resetDbForTests();
  setPersister(new MemoryDbPersister());
  await initDb({ locateFile: () => `file://${WASM_PATH}` });
  setStorage(new SqliteKvStore());
});

// Regression: the Insights tab was the one screen with NO local fallback —
// every mount fired /api/insights/events and showed a skeleton until the
// server answered (blank when offline). Events change once a day, so the
// last payload is cached locally and painted first, then revalidated.
describe('insights events local cache', () => {
  const sample = [
    {
      id: 'e1',
      kind: 'earnings',
      symbol: 'NASDAQ:AAPL',
      name: 'Apple',
      date: '2026-07-10',
      title: 'Q3 실적 발표',
      detail: null,
      impact: 'high',
      confidence: 'confirmed',
      source: null,
      tags: [],
    },
  ];

  it('returns null before anything is cached', () => {
    expect(getCachedInsightsEvents()).toBeNull();
  });

  it('round-trips the last payload', () => {
    setCachedInsightsEvents(sample);
    expect(getCachedInsightsEvents()).toEqual(sample);
  });

  it('overwrites with the newest payload', () => {
    setCachedInsightsEvents(sample);
    setCachedInsightsEvents([]);
    expect(getCachedInsightsEvents()).toEqual([]);
  });

  it('survives corrupt stored JSON by returning null', () => {
    // Simulate a partial write by storing garbage under the same key.
    kvSet('assetflow:insights:events', '{not json');
    expect(getCachedInsightsEvents()).toBeNull();
  });
});
