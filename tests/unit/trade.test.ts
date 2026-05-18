import { describe, it, expect } from 'vitest';
import { applyBuy, applySell } from '@/lib/trade';
import type { Holding } from '@/lib/schema';

const baseHolding: Holding = {
  id: 'h1',
  userId: 'u1',
  accountId: 'a1',
  symbol: 'KRX:005930',
  quantity: 10,
  avgPrice: 70_000,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
};

describe('applyBuy', () => {
  it('weights avgPrice when adding to an existing position', () => {
    const next = applyBuy(baseHolding, { quantity: 5, price: 80_000 });
    expect(next.quantity).toBe(15);
    // (10*70000 + 5*80000) / 15 = 1100000 / 15 ≈ 73333.33
    expect(next.avgPrice).toBeCloseTo(73_333.33, 1);
  });

  it('keeps avgPrice when buying zero (no-op safe)', () => {
    const next = applyBuy(baseHolding, { quantity: 0, price: 90_000 });
    expect(next).toEqual(baseHolding);
  });
});

describe('applySell', () => {
  it('decreases quantity but keeps avgPrice', () => {
    const next = applySell(baseHolding, { quantity: 3 });
    expect(next?.quantity).toBe(7);
    expect(next?.avgPrice).toBe(70_000);
  });

  it('returns null when selling the entire position', () => {
    const next = applySell(baseHolding, { quantity: 10 });
    expect(next).toBeNull();
  });

  it('clamps to zero (returns null) when selling more than held', () => {
    const next = applySell(baseHolding, { quantity: 20 });
    expect(next).toBeNull();
  });
});
