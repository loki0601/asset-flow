import { describe, it, expect } from 'vitest';
import {
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
