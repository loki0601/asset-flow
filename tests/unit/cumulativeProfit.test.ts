import { describe, it, expect } from 'vitest';
import { applyCumulativeProfit, type CashflowEvent } from '@/lib/cumulativeProfit';
import type { PriceHistoryRow } from '@/lib/priceHistoryRepo';

const mv = (rows: [string, number][]): PriceHistoryRow[] =>
  rows.map(([date, close]) => ({ date, close }));

describe('applyCumulativeProfit', () => {
  it('with no cashflows equals market value (rounded)', () => {
    expect(applyCumulativeProfit(mv([['d1', 100.4], ['d2', 200.6]]), [])).toEqual([
      { date: 'd1', close: 100 },
      { date: 'd2', close: 201 },
    ]);
  });

  it('subtracts net invested: profit = value − cost', () => {
    const cf: CashflowEvent[] = [{ date: 'd1', krw: 1000 }]; // bought for 1000
    const out = applyCumulativeProfit(mv([['d1', 1000], ['d2', 1500]]), cf);
    expect(out).toEqual([
      { date: 'd1', close: 0 }, // at cost
      { date: 'd2', close: 500 }, // +500 unrealised
    ]);
  });

  it('retains realised gain after selling everything (rotation does not drop the curve)', () => {
    // Buy 1000 at d1, position worth 1500 at d2, sell all at d3 for 1500
    // (proceeds reduce net-invested), holdings now empty → market value 0.
    const cf: CashflowEvent[] = [
      { date: 'd1', krw: 1000 }, // buy
      { date: 'd3', krw: -1500 }, // sell proceeds
    ];
    const out = applyCumulativeProfit(mv([['d1', 1000], ['d2', 1500], ['d3', 0]]), cf);
    expect(out.map((r) => r.close)).toEqual([0, 500, 500]); // realised +500 stays
  });

  it('applies a cashflow on the exact date (inclusive)', () => {
    const out = applyCumulativeProfit(mv([['d1', 500]]), [{ date: 'd1', krw: 500 }]);
    expect(out[0].close).toBe(0);
  });

  it('ignores cashflows dated after every market-value point', () => {
    const out = applyCumulativeProfit(mv([['d1', 100]]), [{ date: 'd9', krw: 50 }]);
    expect(out[0].close).toBe(100);
  });
});
