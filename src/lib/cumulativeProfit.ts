/**
 * Cumulative total P&L for the 자산 흐름 chart's 누적수익 mode.
 *
 *   cumulative(D) = marketValue(D) − netInvested(D)
 *
 * where netInvested(D) is the running sum of cashflows up to D (buys add,
 * sells subtract). Unlike unrealised 평가손익, this RETAINS realised gains, so
 * selling a winner and rotating into a new position doesn't make the curve
 * drop — it answers "how much have I made in total since I started".
 */

import type { PriceHistoryRow } from '@/lib/priceHistoryRepo';

export interface CashflowEvent {
  /** YYYY-MM-DD */
  date: string;
  /** Signed KRW net-invested delta: buys positive (cash in), sells negative. */
  krw: number;
}

export function applyCumulativeProfit(
  marketValue: PriceHistoryRow[],
  cashflows: CashflowEvent[],
): PriceHistoryRow[] {
  const sorted = [...cashflows].sort((a, b) => a.date.localeCompare(b.date));
  let idx = 0;
  let netInvested = 0;
  const out: PriceHistoryRow[] = [];
  for (const point of marketValue) {
    while (idx < sorted.length && sorted[idx].date <= point.date) {
      netInvested += sorted[idx].krw;
      idx++;
    }
    out.push({ date: point.date, close: Math.round(point.close - netInvested) });
  }
  return out;
}
