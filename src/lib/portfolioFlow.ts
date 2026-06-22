/**
 * Daily total-portfolio value, reconstructed from the user's transaction
 * history. For each date D the function computes:
 *
 *   total(D) = Σ_symbol  qty_held(symbol, D) × close(symbol, D)
 *
 * where qty_held tracks cumulative buys minus sells with occurredAt ≤ D.
 * Closes carry-forward when a date has no row (e.g. holidays where one
 * source lists the day and another doesn't).
 *
 * Emits one point per date in the union of (history dates ∪ tx dates) that
 * is on or after the first transaction date. Earlier dates are omitted —
 * the user wasn't yet invested then.
 */

import type { PriceHistoryRow } from '@/lib/priceHistoryRepo';

export interface PortfolioTx {
  symbol: string;
  type: 'buy' | 'sell';
  quantity: number;
  /** YYYY-MM-DD (caller normalises occurredAt → date). */
  date: string;
}

/** Per-symbol metadata letting the aggregator apply per-date FX conversion
 *  for USD-denominated assets. KRW assets pass `currency:'KRW'` so the
 *  multiplier collapses to 1. */
export interface SymbolMeta {
  currency: 'KRW' | 'USD';
}

/** Sorted ascending list of (date, rate) for the USD/KRW pair, used to
 *  pick the rate that was in effect on each historical chart date. */
export interface FxLookup {
  /** Ascending dates. Lookup walks a cursor; values reused for dates
   *  between two known rates (covers weekends/holidays). */
  rates: { date: string; rate: number }[];
  /** Fallback when no row predates the queried date. */
  fallback: number;
}

/**
 * Calendar-day lookback included before the first transaction. Without this,
 * a buy whose occurredAt is "today" (the TradeForm default) produces only
 * one date in the union — chart can't render with a single point. The
 * lookback adds a flat 0 baseline so the spike-up at the buy date is
 * always visible.
 */
const LOOKBACK_DAYS = 30;

function subtractDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function computePortfolioFlow(
  txs: PortfolioTx[],
  histories: Map<string, PriceHistoryRow[]>,
  options?: {
    /** Per-symbol currency. Symbols missing from the map default to KRW. */
    symbolMeta?: Map<string, SymbolMeta>;
    /** USDKRW history. When provided, USD-denominated symbols are converted
     *  to KRW using the rate active on each plotted date. */
    fxUsdKrw?: FxLookup;
    /** What each plotted point measures. 'assets' (default) = market value
     *  Σ qty×close. 'profit' = valuation P&L Σ qty×(close − unitCost), so the
     *  curve tracks unrealised gain/loss and can go negative. */
    metric?: 'assets' | 'profit';
    /** Per-symbol unit cost (native currency, same scale as close) used when
     *  metric==='profit'. Symbols missing from the map are treated as cost 0. */
    unitCostBySymbol?: Map<string, number>;
  },
): PriceHistoryRow[] {
  if (txs.length === 0) return [];

  const sortedTxs = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  const firstTxDate = sortedTxs[0].date;
  const lookbackCutoff = subtractDays(firstTxDate, LOOKBACK_DAYS);

  // Union of dates from histories ∪ tx dates, filtered to ≥ lookbackCutoff
  // so a brand-new buy still has surrounding context to plot against.
  const dateSet = new Set<string>();
  for (const rows of histories.values()) {
    for (const r of rows) if (r.date >= lookbackCutoff) dateSet.add(r.date);
  }
  for (const t of sortedTxs) dateSet.add(t.date);
  const dates = Array.from(dateSet).sort();
  if (dates.length === 0) return [];

  // Per-symbol price cursor + last-known close (forward fill).
  type Cursor = { rows: PriceHistoryRow[]; idx: number; lastClose: number };
  const cursors = new Map<string, Cursor>();
  for (const [symbol, rows] of histories) {
    cursors.set(symbol, { rows, idx: -1, lastClose: 0 });
  }

  // FX cursor — like price cursor, advances monotonically through dates.
  const fxLookup = options?.fxUsdKrw;
  const fxCursor = { idx: -1, lastRate: fxLookup?.fallback ?? 1 };

  // Running per-symbol quantity from applied transactions.
  const qty = new Map<string, number>();
  let txIdx = 0;

  const out: PriceHistoryRow[] = [];
  for (const d of dates) {
    while (txIdx < sortedTxs.length && sortedTxs[txIdx].date <= d) {
      const t = sortedTxs[txIdx++];
      const cur = qty.get(t.symbol) ?? 0;
      qty.set(t.symbol, cur + (t.type === 'buy' ? t.quantity : -t.quantity));
    }

    for (const c of cursors.values()) {
      while (c.idx + 1 < c.rows.length && c.rows[c.idx + 1].date <= d) {
        c.idx++;
        c.lastClose = c.rows[c.idx].close;
      }
    }

    if (fxLookup) {
      while (
        fxCursor.idx + 1 < fxLookup.rates.length &&
        fxLookup.rates[fxCursor.idx + 1].date <= d
      ) {
        fxCursor.idx++;
        fxCursor.lastRate = fxLookup.rates[fxCursor.idx].rate;
      }
    }

    let total = 0;
    for (const [symbol, q] of qty) {
      if (q <= 0) continue;
      const close = cursors.get(symbol)?.lastClose ?? 0;
      if (close <= 0) continue;
      const meta = options?.symbolMeta?.get(symbol);
      const isUsd = meta?.currency === 'USD';
      const fx = isUsd ? fxCursor.lastRate : 1;
      const unit =
        options?.metric === 'profit'
          ? close - (options.unitCostBySymbol?.get(symbol) ?? 0)
          : close;
      total += q * unit * fx;
    }
    out.push({ date: d, close: total });
  }
  return out;
}
