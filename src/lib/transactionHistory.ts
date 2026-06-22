/**
 * Buy/sell ledger grouping for the 거래 이력 page. Pure data shaping kept out
 * of the component so the sort/group rules are unit-testable.
 */

import type { Transaction } from '@/lib/schema';

export interface TradeDateGroup {
  /** YYYY-MM-DD (from occurredAt). */
  date: string;
  /** Trades on this date, newest first. */
  items: Transaction[];
}

/**
 * Filters to buy/sell only (deposit/withdraw/dividend are not trades), then
 * groups by calendar date — newest date first, and newest trade first within
 * each date.
 */
export function groupTradesByDate(txs: Transaction[]): TradeDateGroup[] {
  // Sort newest-first. Date-only entries are stored at midnight, so same-day
  // trades collapse to one timestamp — tie-break on insertion order so the
  // most-recently-added trade still surfaces on top.
  const trades = txs
    .filter((t) => t.type === 'buy' || t.type === 'sell')
    .map((tx, idx) => ({ tx, idx }))
    .sort((a, b) => {
      const cmp = b.tx.occurredAt.localeCompare(a.tx.occurredAt);
      return cmp !== 0 ? cmp : b.idx - a.idx;
    })
    .map((d) => d.tx);

  const groups: TradeDateGroup[] = [];
  let current: TradeDateGroup | null = null;
  for (const t of trades) {
    const date = t.occurredAt.slice(0, 10);
    if (!current || current.date !== date) {
      current = { date, items: [] };
      groups.push(current);
    }
    current.items.push(t);
  }
  return groups;
}

export type TradePeriod = 'all' | '1m' | '3m' | '6m' | '1y';

const PERIOD_MONTHS: Record<Exclude<TradePeriod, 'all'>, number> = {
  '1m': 1,
  '3m': 3,
  '6m': 6,
  '1y': 12,
};

/**
 * Keep only trades whose occurredAt is on or after (now − period). 'all'
 * passes everything through. `now` is injected so the boundary is testable.
 */
export function filterTradesByPeriod(
  txs: Transaction[],
  period: TradePeriod,
  now: Date,
): Transaction[] {
  if (period === 'all') return txs;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - PERIOD_MONTHS[period]);
  // Compare by calendar date so the cutoff day is fully included regardless
  // of the time-of-day component on `now`.
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  return txs.filter((t) => t.occurredAt.slice(0, 10) >= cutoffDate);
}

/**
 * Keep trades whose calendar date falls within [start, end] inclusive. A
 * reversed range (start after end) is normalized so the UI never has to guard
 * pick order. Dates are YYYY-MM-DD.
 */
export function filterTradesByRange(
  txs: Transaction[],
  start: string,
  end: string,
): Transaction[] {
  const lo = start <= end ? start : end;
  const hi = start <= end ? end : start;
  return txs.filter((t) => {
    const d = t.occurredAt.slice(0, 10);
    return d >= lo && d <= hi;
  });
}

export interface RealizedPnl {
  /** Realized gain (+) / loss (−) in the symbol's native currency. */
  amount: number;
  /** Same as a percent of cost basis. */
  pct: number;
}

/**
 * Realized profit/loss for a sell, derived from the cost basis snapshotted at
 * sale time. Returns null for buys and for legacy sells with no recorded
 * `avgCostAtSale` (the feature isn't retroactive).
 */
export function realizedPnl(tx: Transaction): RealizedPnl | null {
  if (tx.type !== 'sell') return null;
  const cost = tx.avgCostAtSale;
  const price = tx.price;
  const qty = tx.quantity;
  if (cost == null || cost <= 0 || price == null || qty == null) return null;
  return { amount: (price - cost) * qty, pct: (price / cost - 1) * 100 };
}
