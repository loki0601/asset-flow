import { describe, expect, it, vi } from 'vitest';
import { pullChangeFeed, queueLocalChange, rebaseHoldingFromTransaction, seedChangeFeed } from '@/lib/changeSync';
import { MemoryStore, readJSON, setStorage, userKey, writeJSON } from '@/lib/storage';
import { beforeEach } from 'vitest';
import { adoptServerSession } from '@/lib/auth';
import type { Holding, Transaction } from '@/lib/schema';

const holding: Holding = {
  id: 'holding-1', userId: 'loki0601', accountId: 'account-1', symbol: 'AAPL',
  quantity: 10, avgPrice: 100, createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z',
};

const trade = (type: 'buy' | 'sell', quantity: number, price = 0): Transaction => ({
  id: `${type}-1`, userId: 'loki0601', accountId: 'account-1', symbol: 'AAPL', type,
  quantity, price, amount: quantity * price, occurredAt: '2026-09-29T00:01:00.000Z',
});

beforeEach(() => setStorage(new MemoryStore()));

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
});
