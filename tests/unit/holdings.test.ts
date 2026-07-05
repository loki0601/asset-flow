import { describe, it, expect } from 'vitest';
import {
  mergeDuplicateHoldings,
  profitLossAmount,
  profitLossPercent,
  valuationAmount,
  validateTradeInput,
} from '@/lib/holdings';

describe('profitLossAmount', () => {
  it('returns (currentPrice - avgPrice) * quantity', () => {
    expect(profitLossAmount(75_333, 72_500, 600)).toBe((75_333 - 72_500) * 600);
  });

  it('returns negative when loss', () => {
    expect(profitLossAmount(70_000, 72_500, 600)).toBe((70_000 - 72_500) * 600);
  });

  it('returns 0 when quantity is 0', () => {
    expect(profitLossAmount(100, 50, 0)).toBe(0);
  });
});

describe('profitLossPercent', () => {
  it('returns (current - avg) / avg * 100', () => {
    expect(profitLossPercent(110, 100)).toBeCloseTo(10, 4);
  });

  it('returns 0 when avg is 0 (no cost basis)', () => {
    expect(profitLossPercent(100, 0)).toBe(0);
  });

  it('handles loss as negative percent', () => {
    expect(profitLossPercent(90, 100)).toBeCloseTo(-10, 4);
  });
});

describe('valuationAmount', () => {
  it('returns currentPrice * quantity', () => {
    expect(valuationAmount(75_333, 600)).toBe(75_333 * 600);
  });

  it('returns 0 when either is 0', () => {
    expect(valuationAmount(0, 600)).toBe(0);
    expect(valuationAmount(100, 0)).toBe(0);
  });
});

describe('validateTradeInput', () => {
  it('accepts positive price and quantity with selected account', () => {
    expect(validateTradeInput({ price: 100, quantity: 5, accountId: 'acc1' })).toEqual({ ok: true });
  });

  it('rejects when no account selected', () => {
    expect(validateTradeInput({ price: 100, quantity: 5, accountId: null })).toEqual({
      ok: false,
      reason: 'account-required',
    });
  });

  it('rejects zero/negative/NaN price', () => {
    for (const p of [0, -1, NaN]) {
      expect(validateTradeInput({ price: p, quantity: 5, accountId: 'acc1' })).toEqual({
        ok: false,
        reason: 'price-required',
      });
    }
  });

  it('rejects zero/negative/NaN quantity', () => {
    for (const q of [0, -3, NaN]) {
      expect(validateTradeInput({ price: 100, quantity: q, accountId: 'acc1' })).toEqual({
        ok: false,
        reason: 'quantity-required',
      });
    }
  });
});

describe('mergeDuplicateHoldings', () => {
  // Regression: a data-seeding bug produced MULTIPLE Holding rows for the
  // same (accountId, symbol) pair — e.g. one row per purchase lot — instead
  // of one row with quantity/avgPrice accumulated via applyBuy(). The app
  // assumes (accountId, symbol) is unique (TradeForm's `existing` lookup
  // uses .find(), so a later real buy only updated the FIRST duplicate,
  // permanently orphaning its sibling). The aggregated "계좌별 보유" list
  // then showed the same account twice for one symbol.
  const h = (over: Partial<import('@/lib/schema').Holding>): import('@/lib/schema').Holding => ({
    id: over.id ?? 'h',
    userId: 'u1',
    accountId: 'a1',
    symbol: 'KRX:133690',
    quantity: 1,
    avgPrice: 100,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...over,
  });

  it('leaves holdings with no duplicates untouched', () => {
    const input = [h({ id: 'h1', accountId: 'a1', symbol: 'X' }), h({ id: 'h2', accountId: 'a2', symbol: 'X' })];
    expect(mergeDuplicateHoldings(input)).toEqual(input);
  });

  it('sums quantity and volume-weights avgPrice for a duplicate pair', () => {
    const input = [
      h({ id: 'h1', quantity: 13, avgPrice: 191015, createdAt: '2025-05-13T00:00:00.000Z' }),
      h({ id: 'h2', quantity: 12, avgPrice: 163015, createdAt: '2025-03-13T00:00:00.000Z' }),
    ];
    const out = mergeDuplicateHoldings(input);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(25);
    expect(out[0].avgPrice).toBeCloseTo((13 * 191015 + 12 * 163015) / 25);
  });

  it('keeps the earliest-created row\'s id/createdAt for the merged result', () => {
    const input = [
      h({ id: 'later', quantity: 1, avgPrice: 100, createdAt: '2025-05-13T00:00:00.000Z' }),
      h({ id: 'earliest', quantity: 1, avgPrice: 100, createdAt: '2025-03-13T00:00:00.000Z' }),
    ];
    const out = mergeDuplicateHoldings(input);
    expect(out[0].id).toBe('earliest');
    expect(out[0].createdAt).toBe('2025-03-13T00:00:00.000Z');
  });

  it('handles 3+ duplicate rows for the same (accountId, symbol)', () => {
    const input = [
      h({ id: 'h1', quantity: 10, avgPrice: 100 }),
      h({ id: 'h2', quantity: 20, avgPrice: 200 }),
      h({ id: 'h3', quantity: 30, avgPrice: 300 }),
    ];
    const out = mergeDuplicateHoldings(input);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(60);
    expect(out[0].avgPrice).toBeCloseTo((10 * 100 + 20 * 200 + 30 * 300) / 60);
  });

  it('merges independently per (accountId, symbol) group, leaving others alone', () => {
    const input = [
      h({ id: 'h1', accountId: 'a1', symbol: 'X', quantity: 1, avgPrice: 100 }),
      h({ id: 'h2', accountId: 'a1', symbol: 'X', quantity: 1, avgPrice: 200 }),
      h({ id: 'h3', accountId: 'a1', symbol: 'Y', quantity: 5, avgPrice: 50 }),
      h({ id: 'h4', accountId: 'a2', symbol: 'X', quantity: 7, avgPrice: 70 }),
    ];
    const out = mergeDuplicateHoldings(input);
    expect(out).toHaveLength(3);
    const bySymAcc = new Map(out.map((o) => [`${o.accountId}:${o.symbol}`, o]));
    expect(bySymAcc.get('a1:X')?.quantity).toBe(2);
    expect(bySymAcc.get('a1:Y')?.quantity).toBe(5);
    expect(bySymAcc.get('a2:X')?.quantity).toBe(7);
  });

  it('returns an empty array unchanged', () => {
    expect(mergeDuplicateHoldings([])).toEqual([]);
  });
});
