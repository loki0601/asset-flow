import type { HoldingView } from '@/hooks/useHoldingsView';

/**
 * Collapse multiple HoldingViews that share a `symbol` into a single
 * synthetic row. Used by the "모아보기" preference on dashboard + portfolio
 * lists so users see one Apple card instead of three (KB · 삼성 · 한화).
 *
 * Quantity sums; avgPrice is volume-weighted; totalValue / costBasis /
 * dailyChange sum; gainPct re-derived. Keeps the first view's holding ID +
 * accountId so React keys stay stable across renders.
 *
 * Rows built from 2+ views carry `constituents` — the original per-account
 * views — so the detail modal can offer per-account buy/sell instead of
 * silently trading against the first account (the old behavior).
 */
export function aggregateBySymbol(views: HoldingView[]): HoldingView[] {
  const map = new Map<string, HoldingView>();
  for (const v of views) {
    const existing = map.get(v.holding.symbol);
    if (!existing) {
      map.set(v.holding.symbol, v);
      continue;
    }
    const totalQty = existing.holding.quantity + v.holding.quantity;
    const blendedAvg =
      totalQty > 0
        ? (existing.holding.quantity * existing.holding.avgPrice +
            v.holding.quantity * v.holding.avgPrice) /
          totalQty
        : 0;
    const totalValue = existing.totalValue + v.totalValue;
    const costBasis = existing.costBasis + v.costBasis;
    const gain = totalValue - costBasis;
    const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0;
    map.set(v.holding.symbol, {
      ...existing,
      holding: {
        ...existing.holding,
        quantity: totalQty,
        avgPrice: blendedAvg,
      },
      totalValue,
      dailyChange: existing.dailyChange + v.dailyChange,
      costBasis,
      gain,
      gainPct,
      // First merge: seed with the two originals. Later merges extend.
      // `existing` may itself be an untouched single view (no constituents).
      constituents: [...(existing.constituents ?? [existing]), v],
    });
  }
  return Array.from(map.values());
}
