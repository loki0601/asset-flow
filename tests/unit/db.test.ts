import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  initDb,
  setPersister,
  MemoryDbPersister,
  kvGet,
  kvSet,
  kvRemove,
  _resetDbForTests,
  SqliteKvStore,
  migrateLegacyLocalStorage,
  migrateDuplicateHoldings,
} from '@/lib/db';

const WASM_PATH = path.resolve(
  __dirname,
  '../../node_modules/sql.js/dist/sql-wasm.wasm',
);
const wasmBinary = fs.readFileSync(WASM_PATH);

async function freshDb() {
  _resetDbForTests();
  setPersister(new MemoryDbPersister());
  await initDb({ locateFile: () => '' });
}

// sql.js init takes a different setup when running in node: we need to feed
// the wasm binary explicitly via the `wasmBinary` option. Override the
// initSqlJs call by re-mocking — easier to just point locateFile at our path.
// In tests we feed wasm via the locateFile that returns a `file://` URL.

beforeEach(async () => {
  _resetDbForTests();
  setPersister(new MemoryDbPersister());
  await initDb({ locateFile: () => `file://${WASM_PATH}` });
  // sanity: clear kv table
  kvRemove('__noop__');
});

describe('kv get/set/remove', () => {
  it('returns null for missing keys', () => {
    expect(kvGet('missing')).toBeNull();
  });

  it('persists value via set + get', () => {
    kvSet('foo', 'bar');
    expect(kvGet('foo')).toBe('bar');
  });

  it('overwrites on conflict', () => {
    kvSet('foo', 'one');
    kvSet('foo', 'two');
    expect(kvGet('foo')).toBe('two');
  });

  it('removes via kvRemove', () => {
    kvSet('foo', 'bar');
    kvRemove('foo');
    expect(kvGet('foo')).toBeNull();
  });
});

describe('SqliteKvStore', () => {
  it('implements KeyValueStore over the kv table', () => {
    const store = new SqliteKvStore();
    store.setItem('hello', 'world');
    expect(store.getItem('hello')).toBe('world');
    store.removeItem('hello');
    expect(store.getItem('hello')).toBeNull();
  });
});

describe('persister + reopening preserves data', () => {
  it('round-trips the DB blob', async () => {
    const persister = new MemoryDbPersister();
    setPersister(persister);
    _resetDbForTests();
    await initDb({ locateFile: () => `file://${WASM_PATH}` });
    kvSet('persisted', 'yes');

    // Reopen against the same persister
    _resetDbForTests();
    setPersister(persister);
    await initDb({ locateFile: () => `file://${WASM_PATH}` });
    expect(kvGet('persisted')).toBe('yes');
  });
});

describe('migrateLegacyLocalStorage', () => {
  it('imports assetflow:* keys from localStorage into kv and clears them', () => {
    // Always install our own deterministic localStorage stub for this test.
    const data = new Map<string, string>();
    const fake = {
      get length() {
        return data.size;
      },
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      key: (i: number) => Array.from(data.keys())[i] ?? null,
      clear: () => data.clear(),
    };
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: fake,
    });

    fake.setItem('assetflow:session', '{"currentUserId":"u"}');
    fake.setItem('assetflow:user:u:accounts', '[]');
    fake.setItem('unrelated', 'leaveMeAlone');

    migrateLegacyLocalStorage();

    expect(kvGet('assetflow:session')).toBe('{"currentUserId":"u"}');
    expect(kvGet('assetflow:user:u:accounts')).toBe('[]');
    expect(fake.getItem('assetflow:session')).toBeNull();
    expect(fake.getItem('unrelated')).toBe('leaveMeAlone');
  });
});

describe('migrateDuplicateHoldings', () => {
  // Regression: a seed/import bug wrote one Holding row per purchase lot
  // instead of one accumulated row per (accountId, symbol). Real-world
  // case found in production: 이영록 · 삼성증권 IRP held KRX:133690 as two
  // separate rows (qty 13 @ 191015 and qty 12 @ 163015) instead of one
  // (qty 25, blended avgPrice) — surfaced as the same account appearing
  // twice in the 계좌별 보유 breakdown.
  it('merges duplicate (accountId, symbol) rows for every user', () => {
    const holdings = [
      {
        id: 'h1',
        userId: 'u1',
        accountId: 'account-lee-samsung-irp',
        symbol: 'KRX:133690',
        quantity: 13,
        avgPrice: 191015,
        createdAt: '2025-05-13T00:00:00.000Z',
        updatedAt: '2025-05-13T00:00:00.000Z',
      },
      {
        id: 'h2',
        userId: 'u1',
        accountId: 'account-lee-samsung-irp',
        symbol: 'KRX:133690',
        quantity: 12,
        avgPrice: 163015,
        createdAt: '2025-03-13T00:00:00.000Z',
        updatedAt: '2025-03-13T00:00:00.000Z',
      },
      {
        id: 'h3',
        userId: 'u1',
        accountId: 'account-lee-kb-domestic',
        symbol: 'KRX:005930',
        quantity: 252,
        avgPrice: 147443.86,
        createdAt: '2025-01-31T00:00:00.000Z',
        updatedAt: '2025-01-31T00:00:00.000Z',
      },
    ];
    kvSet('assetflow:user:u1:holdings', JSON.stringify(holdings));

    migrateDuplicateHoldings();

    const stored = JSON.parse(kvGet('assetflow:user:u1:holdings')!);
    expect(stored).toHaveLength(2);
    const irp = stored.find((h: { accountId: string }) => h.accountId === 'account-lee-samsung-irp');
    expect(irp.quantity).toBe(25);
    expect(irp.avgPrice).toBeCloseTo((13 * 191015 + 12 * 163015) / 25);
    expect(irp.id).toBe('h2'); // earliest createdAt wins
    const kb = stored.find((h: { accountId: string }) => h.accountId === 'account-lee-kb-domestic');
    expect(kb.quantity).toBe(252); // untouched
  });

  it('is a no-op when no user has duplicates', () => {
    const holdings = [
      {
        id: 'h1',
        userId: 'u1',
        accountId: 'a1',
        symbol: 'X',
        quantity: 10,
        avgPrice: 100,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ];
    kvSet('assetflow:user:u1:holdings', JSON.stringify(holdings));

    migrateDuplicateHoldings();

    expect(JSON.parse(kvGet('assetflow:user:u1:holdings')!)).toEqual(holdings);
  });

  it('does nothing when no users have any holdings key', () => {
    expect(() => migrateDuplicateHoldings()).not.toThrow();
  });
});
