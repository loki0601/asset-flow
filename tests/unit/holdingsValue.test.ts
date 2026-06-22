import { describe, it, expect } from 'vitest';
import { liveHoldingsValue } from '@/lib/holdingsValue';

const asset = (currency: 'KRW' | 'USD', currentPrice: number) => ({ currency, currentPrice });

describe('liveHoldingsValue', () => {
  it('values a KRW holding at currentPrice and computes profit vs avgPrice', () => {
    const r = liveHoldingsValue(
      [{ symbol: 'KRX:A', quantity: 10, avgPrice: 100 }],
      () => asset('KRW', 130),
      1300,
    );
    expect(r.assets).toBe(1300); // 10 × 130
    expect(r.cost).toBe(1000); // 10 × 100
    expect(r.profit).toBe(300); // 10 × (130 − 100)
  });

  it('applies the FX rate to USD holdings on both value and cost', () => {
    const r = liveHoldingsValue(
      [{ symbol: 'NAS:A', quantity: 2, avgPrice: 10 }],
      () => asset('USD', 12),
      1300,
    );
    expect(r.assets).toBe(2 * 12 * 1300); // 31200
    expect(r.cost).toBe(2 * 10 * 1300); // 26000
    expect(r.profit).toBe(2 * (12 - 10) * 1300); // 5200
  });

  it('falls back to avgPrice when currentPrice is 0 (profit collapses to 0)', () => {
    const r = liveHoldingsValue(
      [{ symbol: 'KRX:A', quantity: 5, avgPrice: 200 }],
      () => asset('KRW', 0),
      1300,
    );
    expect(r.assets).toBe(1000); // 5 × 200 (avgPrice fallback)
    expect(r.profit).toBe(0);
  });

  it('skips symbols with no catalog asset', () => {
    const r = liveHoldingsValue(
      [
        { symbol: 'KRX:A', quantity: 10, avgPrice: 100 },
        { symbol: 'UNKNOWN', quantity: 5, avgPrice: 50 },
      ],
      (s) => (s === 'KRX:A' ? asset('KRW', 110) : undefined),
      1300,
    );
    expect(r.assets).toBe(1100); // only KRX:A
    expect(r.profit).toBe(100);
  });

  it('matches the dashboard header identity: profit === assets − cost', () => {
    const r = liveHoldingsValue(
      [
        { symbol: 'KRX:A', quantity: 10, avgPrice: 100 },
        { symbol: 'NAS:B', quantity: 3, avgPrice: 20 },
      ],
      (s) => (s === 'KRX:A' ? asset('KRW', 130) : asset('USD', 25)),
      1300,
    );
    expect(r.profit).toBeCloseTo(r.assets - r.cost, 6);
  });
});
