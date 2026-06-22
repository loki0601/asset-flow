/**
 * Live (current-price) valuation of a set of holdings — the single source of
 * truth for "what are these worth right now" and "what's the unrealised P&L".
 *
 * This mirrors the per-holding math in useHoldingsView (the dashboard header's
 * 평가 손익) exactly, so anything that needs the header's totals — e.g. the
 * 자산 흐름 chart anchoring its latest point — stays in lockstep instead of
 * re-deriving from a different price source (daily-close history) and drifting.
 */

export interface ValuedHolding {
  symbol: string;
  quantity: number;
  avgPrice: number;
}

export interface HoldingsValue {
  /** Σ qty × currentPrice (KRW). */
  assets: number;
  /** Σ qty × avgPrice (KRW). */
  cost: number;
  /** assets − cost = unrealised P&L (KRW). */
  profit: number;
}

export function liveHoldingsValue(
  holdings: ValuedHolding[],
  getAsset: (symbol: string) => { currency: 'KRW' | 'USD'; currentPrice: number } | undefined,
  fxUsdKrw: number,
): HoldingsValue {
  let assets = 0;
  let cost = 0;
  for (const h of holdings) {
    const asset = getAsset(h.symbol);
    if (!asset) continue;
    const fx = asset.currency === 'USD' ? fxUsdKrw : 1;
    // Fall back to avgPrice when there's no live price, matching useHoldingsView.
    const price = (asset.currentPrice || h.avgPrice) * fx;
    const unitCost = h.avgPrice * fx;
    assets += h.quantity * price;
    cost += h.quantity * unitCost;
  }
  return { assets, cost, profit: assets - cost };
}
