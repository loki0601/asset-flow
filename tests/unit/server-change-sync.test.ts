import { beforeEach, describe, expect, it } from 'vitest';
import {
  appendSyncChange,
  createServerUser,
  listSyncChanges,
  openServerDb,
  setServerDbForTests,
} from '@/server/db';
import { rebaseHoldingFromTransaction } from '@/lib/changeSync';
import type { Holding, Transaction } from '@/lib/schema';

beforeEach(() => setServerDbForTests(openServerDb(':memory:')));

describe('change-feed CAS', () => {
  it('accepts independent transaction inserts and returns only changes after a cursor', () => {
    const user = createServerUser('loki0601', 'correct horse battery staple');
    const buy = appendSyncChange(user.id, {
      collection: 'transactions', entityId: 'buy-1', kind: 'upsert', baseVersion: 0,
      payload: { id: 'buy-1', type: 'buy' }, clientUpdatedAt: '2026-09-29T00:00:00.000Z',
    });
    const sell = appendSyncChange(user.id, {
      collection: 'transactions', entityId: 'sell-1', kind: 'upsert', baseVersion: 0,
      payload: { id: 'sell-1', type: 'sell' }, clientUpdatedAt: '2026-09-29T00:01:00.000Z',
    });

    expect(buy.ok).toBe(true);
    expect(sell.ok).toBe(true);
    expect(listSyncChanges(user.id, buy.cursor)).toHaveLength(1);
  });

  it('rejects a stale update to the same entity instead of losing data', () => {
    const user = createServerUser('loki0601', 'correct horse battery staple');
    const created = appendSyncChange(user.id, {
      collection: 'holdings', entityId: 'holding-1', kind: 'upsert', baseVersion: 0,
      payload: { id: 'holding-1', quantity: 10 }, clientUpdatedAt: '2026-09-29T00:00:00.000Z',
    });
    const stale = appendSyncChange(user.id, {
      collection: 'holdings', entityId: 'holding-1', kind: 'upsert', baseVersion: 0,
      payload: { id: 'holding-1', quantity: 8 }, clientUpdatedAt: '2026-09-29T00:01:00.000Z',
    });

    expect(created.ok).toBe(true);
    expect(stale).toMatchObject({ ok: false, currentVersion: 1 });
  });

  it('acknowledges a retry of an already-applied mutation without adding a second ledger event', () => {
    const user = createServerUser('loki0601', 'correct horse battery staple');
    const change = {
      collection: 'transactions', entityId: 'buy-1', kind: 'upsert' as const, baseVersion: 0,
      payload: { id: 'buy-1', type: 'buy' }, clientUpdatedAt: '2026-09-29T00:00:00.000Z',
    };

    const initial = appendSyncChange(user.id, change);
    const retried = appendSyncChange(user.id, change);

    expect(retried).toEqual(initial);
    expect(listSyncChanges(user.id, 0)).toHaveLength(1);
  });

  it('preserves simultaneous Android buy and web sell by rebasing the stale holding after both ledger rows land', () => {
    const user = createServerUser('loki0601', 'correct horse battery staple');
    const original: Holding = {
      id: 'holding-1', userId: user.id, accountId: 'account-1', symbol: 'AAPL', quantity: 10, avgPrice: 100,
      createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z',
    };
    const androidBuy: Transaction = {
      id: 'android-buy', userId: user.id, accountId: 'account-1', symbol: 'AAPL', type: 'buy', quantity: 2, price: 120,
      amount: 240, occurredAt: '2026-09-29T00:01:00.000Z',
    };
    const webSell: Transaction = {
      id: 'web-sell', userId: user.id, accountId: 'account-1', symbol: 'AAPL', type: 'sell', quantity: 3, price: 130,
      amount: 390, occurredAt: '2026-09-29T00:02:00.000Z',
    };
    const baseline = appendSyncChange(user.id, { collection: 'holdings', entityId: original.id, kind: 'upsert', baseVersion: 0, payload: original, clientUpdatedAt: original.updatedAt });
    const androidLedger = appendSyncChange(user.id, { collection: 'transactions', entityId: androidBuy.id, kind: 'upsert', baseVersion: 0, payload: androidBuy, clientUpdatedAt: androidBuy.occurredAt });
    const androidHolding = appendSyncChange(user.id, { collection: 'holdings', entityId: original.id, kind: 'upsert', baseVersion: baseline.version, payload: rebaseHoldingFromTransaction(original, androidBuy)!, clientUpdatedAt: androidBuy.occurredAt });
    const webLedger = appendSyncChange(user.id, { collection: 'transactions', entityId: webSell.id, kind: 'upsert', baseVersion: 0, payload: webSell, clientUpdatedAt: webSell.occurredAt });
    const staleWebHolding = appendSyncChange(user.id, { collection: 'holdings', entityId: original.id, kind: 'upsert', baseVersion: baseline.version, payload: rebaseHoldingFromTransaction(original, webSell)!, clientUpdatedAt: webSell.occurredAt });

    expect([androidLedger, androidHolding, webLedger]).toEqual(expect.arrayContaining([expect.objectContaining({ ok: true })]));
    expect(staleWebHolding).toEqual({ ok: false, currentVersion: 2 });

    const remoteHolding = rebaseHoldingFromTransaction(rebaseHoldingFromTransaction(original, androidBuy)!, webSell)!;
    const retry = appendSyncChange(user.id, { collection: 'holdings', entityId: original.id, kind: 'upsert', baseVersion: staleWebHolding.currentVersion, payload: remoteHolding, clientUpdatedAt: webSell.occurredAt });

    expect(retry).toMatchObject({ ok: true, version: 3 });
    expect(listSyncChanges(user.id, 0).filter((change) => change.collection === 'transactions')).toHaveLength(2);
    expect(remoteHolding).toMatchObject({ quantity: 9, avgPrice: 103.33333333333333 });
  });
});
