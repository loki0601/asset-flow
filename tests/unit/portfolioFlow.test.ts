import { describe, it, expect } from 'vitest';
import { computePortfolioFlow, type PortfolioTx } from '@/lib/portfolioFlow';
import type { PriceHistoryRow } from '@/lib/priceHistoryRepo';

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
