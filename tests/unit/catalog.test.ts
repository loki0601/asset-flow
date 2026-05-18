import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { _resetDbForTests, initDb, kvGet, kvSet, MemoryDbPersister, setPersister, SqliteKvStore } from '@/lib/db';
import { setStorage } from '@/lib/storage';
import {
  applyMigration,
  getLocalAsset,
  getLocalCatalogVersion,
  listLocalAssets,
  setLocalCatalog,
} from '@/lib/catalog';
import { holdingsRepo, transactionsRepo } from '@/lib/repos';
import type { CatalogMigration, Holding, MarketAsset, Transaction } from '@/lib/schema';

const WASM_PATH = path.resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm');
fs.readFileSync(WASM_PATH); // assert presence

const sampleAsset = (symbol: string, name = symbol): MarketAsset => ({
  symbol,
  name,
  category: '국내주식',
  currency: 'KRW',
  currentPrice: 1000,
  dailyChange: 0,
  dailyChangePct: 0,
  updatedAt: '',
});

const sampleHolding = (symbol: string, qty = 10, avg = 1000): Holding => ({
  id: `h-${symbol}`,
  userId: 'u1',
  accountId: 'a1',
  symbol,
  quantity: qty,
  avgPrice: avg,
  createdAt: '',
  updatedAt: '',
});

beforeEach(async () => {
  _resetDbForTests();
  setPersister(new MemoryDbPersister());
  await initDb({ locateFile: () => `file://${WASM_PATH}` });
  setStorage(new SqliteKvStore());
});

describe('setLocalCatalog / listLocalAssets / getLocalCatalogVersion', () => {
  it('persists assets and version', () => {
    setLocalCatalog('1.2.3', [sampleAsset('KRX:A'), sampleAsset('KRX:B')]);
    expect(getLocalCatalogVersion()).toBe('1.2.3');
    const assets = listLocalAssets();
    expect(assets).toHaveLength(2);
    expect(assets.map((a) => a.symbol)).toEqual(['KRX:A', 'KRX:B']);
  });

  it('returns empty list and 0.0.0 version when nothing stored', () => {
    expect(listLocalAssets()).toEqual([]);
    expect(getLocalCatalogVersion()).toBe('0.0.0');
  });

  it('reflects asset name changes on the same symbol after re-sync (symbol-keyed)', () => {
    setLocalCatalog('1.0.0', [sampleAsset('KRX:005930', '삼성전자')]);
    expect(getLocalAsset('KRX:005930')?.name).toBe('삼성전자');

    // Server changes the display name for the same symbol — no migration needed.
    setLocalCatalog('1.0.1', [sampleAsset('KRX:005930', '삼성전자(개명)')]);
    expect(getLocalAsset('KRX:005930')?.name).toBe('삼성전자(개명)');
  });
});

describe('applyMigration: rename_symbol', () => {
  it('renames holdings.symbol for every user', () => {
    kvSet('assetflow:users', JSON.stringify([{ id: 'u1' }, { id: 'u2' }]));
    holdingsRepo.add('u1', sampleHolding('OLD'));
    holdingsRepo.add('u1', sampleHolding('KEEP'));
    holdingsRepo.add('u2', sampleHolding('OLD'));

    applyMigration({
      version: '1.0.1',
      appliedAt: '',
      op: { kind: 'rename_symbol', from: 'OLD', to: 'NEW' },
    });

    expect(holdingsRepo.list('u1').map((h) => h.symbol).sort()).toEqual(['KEEP', 'NEW']);
    expect(holdingsRepo.list('u2').map((h) => h.symbol)).toEqual(['NEW']);
  });

  it('renames transactions.symbol too', () => {
    kvSet('assetflow:users', JSON.stringify([{ id: 'u1' }]));
    const tx: Transaction = {
      id: 't1',
      userId: 'u1',
      accountId: 'a1',
      symbol: 'OLD',
      type: 'buy',
      quantity: 1,
      price: 100,
      amount: 100,
      occurredAt: '',
    };
    transactionsRepo.add('u1', tx);

    applyMigration({
      version: '1.0.1',
      appliedAt: '',
      op: { kind: 'rename_symbol', from: 'OLD', to: 'NEW' },
    });

    expect(transactionsRepo.list('u1')[0].symbol).toBe('NEW');
  });
});

describe('applyMigration: split', () => {
  it('multiplies quantity and divides avgPrice by ratio', () => {
    kvSet('assetflow:users', JSON.stringify([{ id: 'u1' }]));
    holdingsRepo.add('u1', sampleHolding('KRX:A', 10, 1000));

    applyMigration({
      version: '1.0.1',
      appliedAt: '',
      op: { kind: 'split', symbol: 'KRX:A', ratio: 4 },
    });

    const h = holdingsRepo.list('u1')[0];
    expect(h.quantity).toBe(40);
    expect(h.avgPrice).toBe(250);
  });

  it('leaves other symbols alone', () => {
    kvSet('assetflow:users', JSON.stringify([{ id: 'u1' }]));
    holdingsRepo.add('u1', sampleHolding('KRX:A', 10, 1000));
    holdingsRepo.add('u1', sampleHolding('KRX:B', 5, 2000));

    applyMigration({
      version: '1.0.1',
      appliedAt: '',
      op: { kind: 'split', symbol: 'KRX:A', ratio: 2 },
    });

    const a = holdingsRepo.list('u1').find((h) => h.symbol === 'KRX:A')!;
    const b = holdingsRepo.list('u1').find((h) => h.symbol === 'KRX:B')!;
    expect(a.quantity).toBe(20);
    expect(b.quantity).toBe(5);
  });
});

describe('applyMigration: noop / deprecate', () => {
  it('is a no-op on user data (deprecate is reflected via the catalog flag)', () => {
    kvSet('assetflow:users', JSON.stringify([{ id: 'u1' }]));
    holdingsRepo.add('u1', sampleHolding('KRX:A', 10, 1000));

    applyMigration({ version: '1', appliedAt: '', op: { kind: 'deprecate', symbol: 'KRX:A' } });
    applyMigration({ version: '2', appliedAt: '', op: { kind: 'noop' } });

    const h = holdingsRepo.list('u1')[0];
    expect(h.quantity).toBe(10);
    expect(h.avgPrice).toBe(1000);
  });
});

describe('applyMigration: idempotency', () => {
  it('running the same rename twice does not corrupt data', () => {
    kvSet('assetflow:users', JSON.stringify([{ id: 'u1' }]));
    holdingsRepo.add('u1', sampleHolding('OLD'));

    const m: CatalogMigration = {
      version: '1',
      appliedAt: '',
      op: { kind: 'rename_symbol', from: 'OLD', to: 'NEW' },
    };
    applyMigration(m);
    applyMigration(m); // second pass should be a no-op (no OLD left)

    expect(holdingsRepo.list('u1').map((h) => h.symbol)).toEqual(['NEW']);
  });
});
