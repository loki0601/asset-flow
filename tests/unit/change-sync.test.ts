import { describe, expect, it, vi } from 'vitest';
import { flushChangeOutbox, pullChangeFeed, queueLocalChange, rebaseHoldingFromTransaction, seedChangeFeed } from '@/lib/changeSync';
import { MemoryStore, readJSON, setStorage, userKey, writeJSON } from '@/lib/storage';
import { beforeEach } from 'vitest';
import { adoptServerSession } from '@/lib/auth';
import { appendSyncChange, createServerUser, listSyncChanges, openServerDb, setServerDbForTests } from '@/server/db';
import type { Holding, Transaction } from '@/lib/schema';

const holding: Holding = {
  id: 'holding-1', userId: 'loki0601', accountId: 'account-1', symbol: 'AAPL',
  quantity: 10, avgPrice: 100, createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z',
};

const trade = (type: 'buy' | 'sell', quantity: number, price = 0): Transaction => ({
  id: `${type}-1`, userId: 'loki0601', accountId: 'account-1', symbol: 'AAPL', type,
  quantity, price, amount: quantity * price, occurredAt: '2026-09-29T00:01:00.000Z',
});

beforeEach(() => {
  setStorage(new MemoryStore());
  setServerDbForTests(openServerDb(':memory:'));
  vi.unstubAllGlobals();
});

describe('holding conflict rebase', () => {
  it('reapplies a locally accepted buy on top of the newer remote holding', () => {
    const rebased = rebaseHoldingFromTransaction(holding, trade('buy', 2, 120));

    expect(rebased).toMatchObject({ id: 'holding-1', quantity: 12, avgPrice: 103.33333333333333 });
  });

  it('turns a whole-position sell into a delete after fetching the remote holding', () => {
    expect(rebaseHoldingFromTransaction(holding, trade('sell', 10))).toBeNull();
  });
});

describe('change-feed migration', () => {
  it('queues each existing local ledger row once before the first delta upload', () => {
    writeJSON(userKey('loki0601', 'holdings'), [holding]);

    seedChangeFeed('loki0601');
    seedChangeFeed('loki0601');

    const state = readJSON<{ outbox: Array<{ collection: string; entityId: string }> }>(userKey('loki0601', 'change-sync'), { outbox: [] });
    expect(state.outbox).toEqual([expect.objectContaining({ collection: 'holdings', entityId: 'holding-1' })]);
  });
});

describe('change-feed pull', () => {
  it('does not overwrite an unsent local edit while it learns the remote version', async () => {
    adoptServerSession({ token: 'token', user: { id: 'loki0601', username: 'loki0601', createdAt: '2026-09-29T00:00:00.000Z' } });
    const local = { ...holding, quantity: 7 };
    writeJSON(userKey('loki0601', 'holdings'), [local]);
    queueLocalChange('loki0601', 'holdings', local.id, 'upsert', local);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      cursor: 1,
      changes: [{ cursor: 1, collection: 'holdings', entityId: local.id, kind: 'upsert', version: 1, payload: holding }],
    }), { status: 200 })));

    await pullChangeFeed('loki0601');

    expect(readJSON<Holding[]>(userKey('loki0601', 'holdings'), [])).toEqual([local]);
    expect(readJSON<{ versions: Record<string, number> }>(userKey('loki0601', 'change-sync'), { versions: {} }).versions).toMatchObject({ 'holdings:holding-1': 1 });
    vi.unstubAllGlobals();
  });

  it('keeps both device transactions and retries only the stale holding through the real outbox flow', async () => {
    const user = createServerUser('loki0601', 'correct horse battery staple');
    adoptServerSession({ token: 'token', user: { id: user.id, username: 'loki0601', createdAt: user.createdAt } });
    const original = { ...holding, userId: user.id };
    const androidBuy = trade('buy', 2, 120);
    const webSell = trade('sell', 3, 130);
    androidBuy.userId = user.id;
    webSell.userId = user.id;
    const baseline = appendSyncChange(user.id, { collection: 'holdings', entityId: original.id, kind: 'upsert', baseVersion: 0, payload: original, clientUpdatedAt: original.updatedAt });
    appendSyncChange(user.id, { collection: 'transactions', entityId: androidBuy.id, kind: 'upsert', baseVersion: 0, payload: androidBuy, clientUpdatedAt: androidBuy.occurredAt });
    appendSyncChange(user.id, { collection: 'holdings', entityId: original.id, kind: 'upsert', baseVersion: baseline.version, payload: rebaseHoldingFromTransaction(original, androidBuy)!, clientUpdatedAt: androidBuy.occurredAt });
    writeJSON(userKey(user.id, 'holdings'), [rebaseHoldingFromTransaction(original, webSell)!]);
    writeJSON(userKey(user.id, 'transactions'), [webSell]);
    writeJSON(userKey(user.id, 'change-sync'), { cursor: baseline.cursor, versions: { 'holdings:holding-1': baseline.version }, outbox: [], seeded: true });
    queueLocalChange(user.id, 'holdings', original.id, 'upsert', rebaseHoldingFromTransaction(original, webSell)!);
    queueLocalChange(user.id, 'transactions', webSell.id, 'upsert', webSell);
    vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
      if (input === '/api/sync/changes' && init?.method === 'POST') {
        const { changes } = JSON.parse(String(init.body)) as { changes: Parameters<typeof appendSyncChange>[1][] };
        return new Response(JSON.stringify({ results: changes.map((change) => appendSyncChange(user.id, change)) }), { status: 200 });
      }
      const cursor = Number(new URL(input, 'http://localhost').searchParams.get('cursor') ?? '0');
      const changes = listSyncChanges(user.id, cursor);
      return new Response(JSON.stringify({ changes, cursor: changes.at(-1)?.cursor ?? cursor }), { status: 200 });
    }));

    await flushChangeOutbox(user.id);
    await flushChangeOutbox(user.id);

    const serverChanges = listSyncChanges(user.id, 0);
    const latestHolding = serverChanges.filter((change) => change.collection === 'holdings').at(-1)?.payload as Holding;
    expect(serverChanges.filter((change) => change.collection === 'transactions')).toHaveLength(2);
    expect(latestHolding).toMatchObject({ quantity: 9, avgPrice: 103.33333333333333 });
    expect(readJSON<{ outbox: unknown[] }>(userKey(user.id, 'change-sync'), { outbox: [] }).outbox).toEqual([]);
  });

  it('flushes an outbox bigger than the server\'s 100-changes-per-request cap in multiple batches', async () => {
    // A real first-time sync for an existing heavy account (loki0601 has
    // months of accounts/holdings/transactions/loans) queues every local row
    // at once via seedChangeFeed. The server route hard-rejects any single
    // request over 100 changes with a 400, and flushChangeOutbox used to
    // send the whole outbox in one POST — so any account with >100 local
    // rows failed sync on every single login attempt, forever, with the
    // exact error the user saw ("변경분 동기화에 실패했습니다").
    const user = createServerUser('loki0601', 'correct horse battery staple');
    adoptServerSession({ token: 'token', user: { id: user.id, username: 'loki0601', createdAt: user.createdAt } });
    for (let i = 0; i < 130; i++) {
      queueLocalChange(user.id, 'transactions', `tx-${i}`, 'upsert', trade('buy', 1, 100));
    }
    let maxBatchSize = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
      if (input === '/api/sync/changes' && init?.method === 'POST') {
        const { changes } = JSON.parse(String(init.body)) as { changes: Parameters<typeof appendSyncChange>[1][] };
        maxBatchSize = Math.max(maxBatchSize, changes.length);
        if (changes.length > 100) {
          return new Response(JSON.stringify({ error: '1~100개의 변경분이 필요합니다.' }), { status: 400 });
        }
        return new Response(JSON.stringify({ results: changes.map((change) => appendSyncChange(user.id, change)) }), { status: 200 });
      }
      const cursor = Number(new URL(input, 'http://localhost').searchParams.get('cursor') ?? '0');
      const changes = listSyncChanges(user.id, cursor);
      return new Response(JSON.stringify({ changes, cursor: changes.at(-1)?.cursor ?? cursor }), { status: 200 });
    }));

    await flushChangeOutbox(user.id);

    expect(maxBatchSize).toBeLessThanOrEqual(100);
    expect(readJSON<{ outbox: unknown[] }>(userKey(user.id, 'change-sync'), { outbox: [] }).outbox).toEqual([]);
    expect(listSyncChanges(user.id, 0)).toHaveLength(130);
  });
});
