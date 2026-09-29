import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/sync/changes/route';
import { adoptServerSession, type ServerSession } from '@/lib/auth';
import { flushChangeOutbox, pullChangeFeed, queueLocalChange } from '@/lib/changeSync';
import type { Holding, Transaction } from '@/lib/schema';
import { MemoryStore, readJSON, setStorage, userKey, writeJSON } from '@/lib/storage';
import { createServerUser, createSession, openServerDb, setServerDbForTests } from '@/server/db';

beforeEach(() => {
  setServerDbForTests(openServerDb(':memory:'));
  vi.unstubAllGlobals();
});

describe('Android and web cross-device change synchronization', () => {
  it('preserves both simultaneous trades and retries the stale holding through the authenticated cursor API', async () => {
    const user = createServerUser('e2e-user', 'correct horse battery staple');
    const session: ServerSession = { token: createSession(user.id), user };
    const android = new MemoryStore();
    const web = new MemoryStore();
    const activate = (store: MemoryStore) => {
      setStorage(store);
      adoptServerSession(session);
    };
    vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
      const request = new Request(`http://assetflow.test${input}`, {
        method: init?.method ?? 'GET', headers: init?.headers,
        body: init?.body as BodyInit | null | undefined,
      });
      return request.method === 'POST' ? POST(request) : GET(request);
    }));

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

    // Android initially owns the baseline. The web client then pulls exactly
    // that state and both clients make an offline trade from the same version.
    activate(android);
    writeJSON(userKey(user.id, 'holdings'), [original]);
    queueLocalChange(user.id, 'holdings', original.id, 'upsert', original);
    await flushChangeOutbox(user.id);
    await pullChangeFeed(user.id);

    activate(web);
    await pullChangeFeed(user.id);

    activate(android);
    const bought = { ...original, quantity: 12, avgPrice: 103.33333333333333, updatedAt: androidBuy.occurredAt };
    writeJSON(userKey(user.id, 'holdings'), [bought]);
    writeJSON(userKey(user.id, 'transactions'), [androidBuy]);
    queueLocalChange(user.id, 'holdings', bought.id, 'upsert', bought);
    queueLocalChange(user.id, 'transactions', androidBuy.id, 'upsert', androidBuy);
    await flushChangeOutbox(user.id);

    activate(web);
    const sold = { ...original, quantity: 7, updatedAt: webSell.occurredAt };
    writeJSON(userKey(user.id, 'holdings'), [sold]);
    writeJSON(userKey(user.id, 'transactions'), [webSell]);
    queueLocalChange(user.id, 'holdings', sold.id, 'upsert', sold);
    queueLocalChange(user.id, 'transactions', webSell.id, 'upsert', webSell);
    await flushChangeOutbox(user.id);
    await flushChangeOutbox(user.id);

    const response = await GET(new Request('http://assetflow.test/api/sync/changes?cursor=0', {
      headers: { Authorization: `Bearer ${session.token}` },
    }));
    const body = await response.json() as { changes: Array<{ collection: string; payload: Holding | Transaction | null }> };
    const transactions = body.changes.filter((change) => change.collection === 'transactions');
    const finalHolding = body.changes.filter((change) => change.collection === 'holdings').at(-1)?.payload as Holding;
    const webOutbox = readJSON<{ outbox: unknown[] }>(userKey(user.id, 'change-sync'), { outbox: [] }).outbox;

    expect(response.status).toBe(200);
    expect(transactions).toHaveLength(2);
    expect(finalHolding).toMatchObject({ quantity: 9, avgPrice: 103.33333333333333 });
    expect(webOutbox).toEqual([]);
  });
});
