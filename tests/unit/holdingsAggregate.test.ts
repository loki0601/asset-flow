import { describe, it, expect } from 'vitest';
import { aggregateBySymbol } from '@/lib/holdingsAggregate';
import type { HoldingView } from '@/hooks/useHoldingsView';
import type { MarketAsset } from '@/lib/schema';

const asset: MarketAsset = {
  symbol: 'NASDAQ:AAPL',
  name: 'Apple Inc.',
  category: '미국증권',
  currency: 'USD',
  currentPrice: 200,
  dailyChange: 2,
  dailyChangePct: 1,
  updatedAt: '',
};

function view(accountId: string, quantity: number, avgPrice: number): HoldingView {
  const totalValue = quantity * 200 * 1400;
  const costBasis = quantity * avgPrice * 1400;
  return {
    holding: {
      id: `h-${accountId}`,
      userId: 'u1',
      accountId,
      symbol: asset.symbol,
      quantity,
      avgPrice,
      createdAt: '',
      updatedAt: '',
    },
    asset,
    totalValue,
    dailyChange: quantity * 2 * 1400,
    dailyChangePct: 1,
    costBasis,
    gain: totalValue - costBasis,
    gainPct: costBasis > 0 ? ((totalValue - costBasis) / costBasis) * 100 : 0,
    category: asset.category,
  };
}

describe('aggregateBySymbol', () => {
  it('sums quantity and volume-weights avgPrice', () => {
    const [agg] = aggregateBySymbol([view('a1', 10, 100), view('a2', 30, 200)]);
    expect(agg.holding.quantity).toBe(40);
    expect(agg.holding.avgPrice).toBeCloseTo((10 * 100 + 30 * 200) / 40);
  });

  it('keeps the per-account constituents on the aggregated row', () => {
    // Regression: the aggregate kept only the FIRST view's holding/accountId,
    // so tapping 매수/매도 on a merged card silently traded against the first
    // account. Constituents let the detail modal offer a per-account choice.
    const v1 = view('a1', 10, 100);
    const v2 = view('a2', 30, 200);
    const [agg] = aggregateBySymbol([v1, v2]);
    expect(agg.constituents).toHaveLength(2);
    expect(agg.constituents?.map((c) => c.holding.accountId)).toEqual(['a1', 'a2']);
    // Constituents keep their own per-account quantities untouched.
    expect(agg.constituents?.[0].holding.quantity).toBe(10);
    expect(agg.constituents?.[1].holding.quantity).toBe(30);
  });

  it('leaves single-account symbols without constituents', () => {
    const [agg] = aggregateBySymbol([view('a1', 10, 100)]);
    expect(agg.constituents).toBeUndefined();
  });
});
