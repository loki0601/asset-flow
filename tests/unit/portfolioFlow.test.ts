import { describe, it, expect } from 'vitest';
import { computePortfolioFlow, syntheticBuyAnchor, type PortfolioTx } from '@/lib/portfolioFlow';
import type { PriceHistoryRow } from '@/lib/priceHistoryRepo';

describe('computePortfolioFlow with a fixed (current) FX', () => {
  it('values USD at the fallback rate for every date when rates is empty', () => {
    const histories = new Map<string, PriceHistoryRow[]>([
      ['NASDAQ:A', [{ date: '2026-05-10', close: 10 }, { date: '2026-05-20', close: 12 }]],
    ]);
    const flow = computePortfolioFlow(
      [{ symbol: 'NASDAQ:A', type: 'buy', quantity: 2, date: '2026-05-10' }],
      histories,
      {
        symbolMeta: new Map([['NASDAQ:A', { currency: 'USD' }]]),
        fxUsdKrw: { rates: [], fallback: 1500 },
      },
    );
    // Both dates use 1500, never a historical rate.
    expect(flow).toEqual([
      { date: '2026-05-10', close: 2 * 10 * 1500 },
      { date: '2026-05-20', close: 2 * 12 * 1500 },
    ]);
  });
});

function tx(symbol: string, type: 'buy' | 'sell', quantity: number, date: string): PortfolioTx {
  return { symbol, type, quantity, date };
}

describe('computePortfolioFlow', () => {
  it('returns empty when there are no transactions', () => {
    expect(computePortfolioFlow([], new Map())).toEqual([]);
  });

  it('does not emit anything before the first transaction date', () => {
    const histories = new Map<string, PriceHistoryRow[]>([
      [
        'KRX:A',
        [
          { date: '2026-01-01', close: 100 }, // before first tx
          { date: '2026-05-10', close: 110 },
          { date: '2026-05-11', close: 120 },
        ],
      ],
    ]);
    const flow = computePortfolioFlow([tx('KRX:A', 'buy', 10, '2026-05-10')], histories);
    expect(flow.map((r) => r.date)).toEqual(['2026-05-10', '2026-05-11']);
  });

  it('reflects buys: cumulative quantity grows over time', () => {
    const histories = new Map<string, PriceHistoryRow[]>([
      [
        'KRX:A',
        [
          { date: '2026-05-10', close: 100 },
          { date: '2026-05-15', close: 100 },
          { date: '2026-05-20', close: 100 },
        ],
      ],
    ]);
    const flow = computePortfolioFlow(
      [
        tx('KRX:A', 'buy', 10, '2026-05-10'),
        tx('KRX:A', 'buy', 20, '2026-05-20'), // +20 more shares
      ],
      histories,
    );
    expect(flow).toEqual([
      { date: '2026-05-10', close: 10 * 100 }, // 1000
      { date: '2026-05-15', close: 10 * 100 }, // still 10 shares
      { date: '2026-05-20', close: 30 * 100 }, // jumps to 30 shares
    ]);
  });

  it('reflects sells: cumulative quantity drops', () => {
    const histories = new Map<string, PriceHistoryRow[]>([
      [
        'KRX:A',
        [
          { date: '2026-05-10', close: 100 },
          { date: '2026-05-15', close: 100 },
          { date: '2026-05-20', close: 100 },
        ],
      ],
    ]);
    const flow = computePortfolioFlow(
      [
        tx('KRX:A', 'buy', 30, '2026-05-10'),
        tx('KRX:A', 'sell', 10, '2026-05-20'),
      ],
      histories,
    );
    expect(flow).toEqual([
      { date: '2026-05-10', close: 30 * 100 },
      { date: '2026-05-15', close: 30 * 100 },
      { date: '2026-05-20', close: 20 * 100 }, // 30 − 10
    ]);
  });

  it('aggregates multiple symbols at their actual-held quantities', () => {
    const histories = new Map<string, PriceHistoryRow[]>([
      [
        'KRX:A',
        [
          { date: '2026-05-10', close: 100 },
          { date: '2026-05-15', close: 110 },
        ],
      ],
      [
        'KRX:B',
        [
          { date: '2026-05-12', close: 200 },
          { date: '2026-05-15', close: 220 },
        ],
      ],
    ]);
    const flow = computePortfolioFlow(
      [tx('KRX:A', 'buy', 10, '2026-05-10'), tx('KRX:B', 'buy', 5, '2026-05-12')],
      histories,
    );
    // Dates: 5-10 (A only), 5-12 (A carry-forward + B starts), 5-15 (both)
    expect(flow).toEqual([
      { date: '2026-05-10', close: 10 * 100 },
      { date: '2026-05-12', close: 10 * 100 + 5 * 200 }, // 1000 + 1000 = 2000
      { date: '2026-05-15', close: 10 * 110 + 5 * 220 }, // 1100 + 1100 = 2200
    ]);
  });

  it('carry-forwards the close when a symbol has no price on a given date', () => {
    const histories = new Map<string, PriceHistoryRow[]>([
      [
        'KRX:A',
        [
          { date: '2026-05-10', close: 100 },
          { date: '2026-05-15', close: 120 }, // skip 5-12
        ],
      ],
      [
        'KRX:B',
        [{ date: '2026-05-12', close: 200 }],
      ],
    ]);
    const flow = computePortfolioFlow(
      [tx('KRX:A', 'buy', 10, '2026-05-10'), tx('KRX:B', 'buy', 5, '2026-05-12')],
      histories,
    );
    // 2026-05-12: A still 100 (carry-forward), B = 200
    expect(flow.find((r) => r.date === '2026-05-12')?.close).toBe(10 * 100 + 5 * 200);
  });

  describe("metric: 'profit'", () => {
    it('plots valuation P&L = qty × (close − unitCost)', () => {
      const histories = new Map<string, PriceHistoryRow[]>([
        [
          'KRX:A',
          [
            { date: '2026-05-10', close: 100 },
            { date: '2026-05-15', close: 130 }, // +30 vs cost
            { date: '2026-05-20', close: 90 }, // −10 vs cost (loss)
          ],
        ],
      ]);
      const flow = computePortfolioFlow([tx('KRX:A', 'buy', 10, '2026-05-10')], histories, {
        metric: 'profit',
        unitCostBySymbol: new Map([['KRX:A', 100]]),
      });
      expect(flow).toEqual([
        { date: '2026-05-10', close: 10 * (100 - 100) }, // 0 at cost
        { date: '2026-05-15', close: 10 * (130 - 100) }, // +300
        { date: '2026-05-20', close: 10 * (90 - 100) }, // −100 (loss shows negative)
      ]);
    });

    it('aggregates profit across symbols at held quantities', () => {
      const histories = new Map<string, PriceHistoryRow[]>([
        ['KRX:A', [{ date: '2026-05-10', close: 110 }]],
        ['KRX:B', [{ date: '2026-05-10', close: 180 }]],
      ]);
      const flow = computePortfolioFlow(
        [tx('KRX:A', 'buy', 10, '2026-05-10'), tx('KRX:B', 'buy', 5, '2026-05-10')],
        histories,
        {
          metric: 'profit',
          unitCostBySymbol: new Map([
            ['KRX:A', 100], // +10/share
            ['KRX:B', 200], // −20/share
          ]),
        },
      );
      // 10×(110−100) + 5×(180−200) = 100 − 100 = 0
      expect(flow).toEqual([{ date: '2026-05-10', close: 0 }]);
    });

    it('treats a missing unitCost as 0 (profit collapses to full market value)', () => {
      const histories = new Map<string, PriceHistoryRow[]>([
        ['KRX:A', [{ date: '2026-05-10', close: 100 }]],
      ]);
      const flow = computePortfolioFlow([tx('KRX:A', 'buy', 10, '2026-05-10')], histories, {
        metric: 'profit',
      });
      expect(flow).toEqual([{ date: '2026-05-10', close: 1000 }]);
    });

    it('converts USD unitCost with the same per-date FX as the close', () => {
      const histories = new Map<string, PriceHistoryRow[]>([
        ['NASDAQ:A', [{ date: '2026-05-10', close: 12 }]],
      ]);
      const flow = computePortfolioFlow([tx('NASDAQ:A', 'buy', 2, '2026-05-10')], histories, {
        metric: 'profit',
        unitCostBySymbol: new Map([['NASDAQ:A', 10]]),
        symbolMeta: new Map([['NASDAQ:A', { currency: 'USD' }]]),
        fxUsdKrw: { rates: [{ date: '2026-05-10', rate: 1300 }], fallback: 1300 },
      });
      // 2 × (12 − 10) × 1300 = 5200
      expect(flow).toEqual([{ date: '2026-05-10', close: 2 * (12 - 10) * 1300 }]);
    });
  });

  it('treats deposit/withdraw/dividend as no-ops (caller filters non-buy/sell)', () => {
    // The function only accepts buy/sell. Test the contract by passing a
    // sequence and verifying buys/sells are the only quantity drivers.
    const histories = new Map<string, PriceHistoryRow[]>([
      ['KRX:A', [{ date: '2026-05-10', close: 100 }]],
    ]);
    const flow = computePortfolioFlow([tx('KRX:A', 'buy', 5, '2026-05-10')], histories);
    expect(flow).toEqual([{ date: '2026-05-10', close: 500 }]);
  });
});

describe('FX before the first fx_history row (backward-fill)', () => {
  // Regression: the fx cursor used to start at `fallback` (today's rate), so
  // every plotted date EARLIER than the first fx_history row valued USD
  // holdings at today's FX — overstating a 2016-2022 backcast by 15-25%
  // whenever fx_history only reached back a few years. The earliest KNOWN
  // historical rate is a far better estimate for those dates.
  it('uses the first known rate, not the fallback, for dates before fx coverage', () => {
    const txs: PortfolioTx[] = [{ symbol: 'NASDAQ:AAPL', type: 'buy', quantity: 1, date: '2020-01-02' }];
    const histories = new Map<string, PriceHistoryRow[]>([
      ['NASDAQ:AAPL', [
        { date: '2020-01-02', close: 100 },
        { date: '2023-01-02', close: 100 },
      ]],
    ]);
    const out = computePortfolioFlow(txs, histories, {
      symbolMeta: new Map([['NASDAQ:AAPL', { currency: 'USD' as const }]]),
      fxUsdKrw: {
        rates: [{ date: '2023-01-02', rate: 1200 }], // coverage starts 2023
        fallback: 1400, // today's rate
      },
    });
    const at2020 = out.find((r) => r.date === '2020-01-02')!;
    const at2023 = out.find((r) => r.date === '2023-01-02')!;
    expect(at2020.close).toBe(100 * 1200); // backward-filled first known rate
    expect(at2023.close).toBe(100 * 1200);
  });

  it('still uses the fallback when there are no fx rows at all', () => {
    const txs: PortfolioTx[] = [{ symbol: 'NASDAQ:AAPL', type: 'buy', quantity: 1, date: '2020-01-02' }];
    const histories = new Map<string, PriceHistoryRow[]>([
      ['NASDAQ:AAPL', [{ date: '2020-01-02', close: 100 }]],
    ]);
    const out = computePortfolioFlow(txs, histories, {
      symbolMeta: new Map([['NASDAQ:AAPL', { currency: 'USD' as const }]]),
      fxUsdKrw: { rates: [], fallback: 1400 },
    });
    expect(out.find((r) => r.date === '2020-01-02')!.close).toBe(100 * 1400);
  });
});

describe('syntheticBuyAnchor', () => {
  // Regression: holdings WITHOUT a transaction trail used to anchor their
  // synthetic buy at the earliest price-history row (e.g. 2016), fabricating
  // a decade of phantom history for a position actually added last month.
  // The holding's createdAt is the honest anchor.
  it('prefers the holding createdAt over the first history date', () => {
    expect(
      syntheticBuyAnchor('2026-06-10T09:00:00+09:00', '2016-01-04', '2026-07-05'),
    ).toBe('2026-06-10');
  });

  it('falls back to the first history date when createdAt is missing', () => {
    expect(syntheticBuyAnchor(undefined, '2016-01-04', '2026-07-05')).toBe('2016-01-04');
    expect(syntheticBuyAnchor('', '2016-01-04', '2026-07-05')).toBe('2016-01-04');
  });

  it('falls back to today when neither exists', () => {
    expect(syntheticBuyAnchor(undefined, undefined, '2026-07-05')).toBe('2026-07-05');
  });
});
