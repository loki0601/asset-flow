import { describe, it, expect } from 'vitest';
import {
  groupTradesByDate,
  realizedPnl,
  filterTradesByPeriod,
  filterTradesByRange,
} from '@/lib/transactionHistory';
import type { Transaction, TransactionType } from '@/lib/schema';

let seq = 0;
function txn(
  type: TransactionType,
  occurredAt: string,
  extra: Partial<Transaction> = {},
): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    userId: 'u1',
    accountId: 'a1',
    symbol: 'KRX:005930',
    type,
    quantity: 1,
    price: 100,
    amount: 100,
    occurredAt,
    ...extra,
  };
}

describe('groupTradesByDate', () => {
  it('returns empty for no transactions', () => {
    expect(groupTradesByDate([])).toEqual([]);
  });

  it('excludes non-trade types (deposit/withdraw/dividend)', () => {
    const groups = groupTradesByDate([
      txn('deposit', '2026-06-10T01:00:00Z'),
      txn('withdraw', '2026-06-10T02:00:00Z'),
      txn('dividend', '2026-06-10T03:00:00Z'),
      txn('buy', '2026-06-10T04:00:00Z'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(1);
    expect(groups[0].items[0].type).toBe('buy');
  });

  it('groups by calendar date, newest date first', () => {
    const groups = groupTradesByDate([
      txn('buy', '2026-06-08T04:00:00Z'),
      txn('sell', '2026-06-10T04:00:00Z'),
      txn('buy', '2026-06-09T04:00:00Z'),
    ]);
    expect(groups.map((g) => g.date)).toEqual(['2026-06-10', '2026-06-09', '2026-06-08']);
  });

  it('orders trades newest-first within a date', () => {
    const groups = groupTradesByDate([
      txn('buy', '2026-06-10T01:00:00Z', { id: 'morning' }),
      txn('sell', '2026-06-10T22:00:00Z', { id: 'evening' }),
      txn('buy', '2026-06-10T12:00:00Z', { id: 'noon' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((t) => t.id)).toEqual(['evening', 'noon', 'morning']);
  });

  it('breaks identical-timestamp ties by insertion order — latest entered first', () => {
    // Date-only entries are stored at midnight, so same-day trades share an
    // occurredAt. The most-recently-added trade should surface on top.
    const groups = groupTradesByDate([
      txn('buy', '2026-06-10T00:00:00Z', { id: 'first' }),
      txn('buy', '2026-06-10T00:00:00Z', { id: 'second' }),
      txn('sell', '2026-06-10T00:00:00Z', { id: 'third' }),
    ]);
    expect(groups[0].items.map((t) => t.id)).toEqual(['third', 'second', 'first']);
  });
});

describe('realizedPnl', () => {
  it('returns null for a buy', () => {
    expect(realizedPnl(txn('buy', '2026-06-10T00:00:00Z'))).toBeNull();
  });

  it('returns null for a sell with no recorded cost basis (legacy)', () => {
    expect(realizedPnl(txn('sell', '2026-06-10T00:00:00Z'))).toBeNull();
  });

  it('computes profit amount and percent from sell price vs cost', () => {
    const sell = txn('sell', '2026-06-10T00:00:00Z', {
      price: 120,
      quantity: 10,
      avgCostAtSale: 100,
    });
    const pnl = realizedPnl(sell);
    expect(pnl?.amount).toBe(200);
    expect(pnl?.pct).toBeCloseTo(20, 6);
  });

  it('reports a loss as a negative amount and percent', () => {
    const sell = txn('sell', '2026-06-10T00:00:00Z', {
      price: 90,
      quantity: 5,
      avgCostAtSale: 100,
    });
    const pnl = realizedPnl(sell);
    expect(pnl?.amount).toBe(-50);
    expect(pnl?.pct).toBeCloseTo(-10, 6);
  });

  it('returns null when the recorded cost basis is zero (avoids divide-by-zero)', () => {
    const sell = txn('sell', '2026-06-10T00:00:00Z', {
      price: 90,
      quantity: 5,
      avgCostAtSale: 0,
    });
    expect(realizedPnl(sell)).toBeNull();
  });
});

describe('filterTradesByPeriod', () => {
  const now = new Date('2026-06-10T12:00:00Z');
  const all = [
    txn('buy', '2026-06-09T00:00:00Z', { id: 'recent' }),
    txn('buy', '2026-05-10T00:00:00Z', { id: 'exactly-1m' }),
    txn('sell', '2026-05-09T00:00:00Z', { id: 'just-over-1m' }),
    txn('buy', '2025-06-15T00:00:00Z', { id: 'within-1y' }),
    txn('buy', '2024-01-01T00:00:00Z', { id: 'old' }),
  ];

  it("'all' returns everything unchanged", () => {
    expect(filterTradesByPeriod(all, 'all', now)).toEqual(all);
  });

  it("'1m' keeps trades on or after the cutoff, drops older", () => {
    const ids = filterTradesByPeriod(all, '1m', now).map((t) => t.id);
    expect(ids).toContain('recent');
    expect(ids).toContain('exactly-1m'); // boundary is inclusive
    expect(ids).not.toContain('just-over-1m');
    expect(ids).not.toContain('old');
  });

  it("'1y' includes a trade ~12 months back but excludes a 2-year-old one", () => {
    const ids = filterTradesByPeriod(all, '1y', now).map((t) => t.id);
    expect(ids).toContain('within-1y');
    expect(ids).not.toContain('old');
  });
});

describe('filterTradesByRange', () => {
  const all = [
    txn('buy', '2026-05-01T00:00:00Z', { id: 'may1' }),
    txn('sell', '2026-05-15T09:00:00Z', { id: 'may15' }),
    txn('buy', '2026-05-31T23:00:00Z', { id: 'may31' }),
    txn('buy', '2026-06-01T00:00:00Z', { id: 'jun1' }),
    txn('buy', '2026-04-30T00:00:00Z', { id: 'apr30' }),
  ];

  it('keeps trades within [start, end] inclusive by calendar date', () => {
    const ids = filterTradesByRange(all, '2026-05-01', '2026-05-31').map((t) => t.id);
    expect(ids.sort()).toEqual(['may1', 'may15', 'may31']);
  });

  it('normalizes a reversed range (start after end)', () => {
    const ids = filterTradesByRange(all, '2026-05-31', '2026-05-01').map((t) => t.id);
    expect(ids.sort()).toEqual(['may1', 'may15', 'may31']);
  });

  it('a single-day range matches only that day', () => {
    const ids = filterTradesByRange(all, '2026-05-15', '2026-05-15').map((t) => t.id);
    expect(ids).toEqual(['may15']);
  });
});
