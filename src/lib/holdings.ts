export function profitLossAmount(
  currentPrice: number,
  avgPrice: number,
  quantity: number,
): number {
  return (currentPrice - avgPrice) * quantity;
}

export function profitLossPercent(currentPrice: number, avgPrice: number): number {
  if (avgPrice <= 0) return 0;
  return ((currentPrice - avgPrice) / avgPrice) * 100;
}

export function valuationAmount(currentPrice: number, quantity: number): number {
  return currentPrice * quantity;
}

export type TradeValidationResult =
  | { ok: true }
  | { ok: false; reason: 'price-required' | 'quantity-required' | 'account-required' };

export interface TradeInput {
  price: number;
  quantity: number;
  accountId: number | string | null;
}

export function validateTradeInput(input: TradeInput): TradeValidationResult {
  if (input.accountId == null) {
    return { ok: false, reason: 'account-required' };
  }
  if (!Number.isFinite(input.price) || input.price <= 0) {
    return { ok: false, reason: 'price-required' };
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false, reason: 'quantity-required' };
  }
  return { ok: true };
}

/**
 * Collapse multiple Holding rows sharing the same (accountId, symbol) into
 * one — quantity summed, avgPrice volume-weighted, keeping the id/createdAt
 * of the earliest-created row. The app assumes (accountId, symbol) is
 * unique everywhere (TradeForm's `existing` lookup uses `.find()`), so
 * duplicate rows silently orphan one another: a later buy only updates the
 * first match, leaving its sibling stuck forever and double-counted in the
 * "계좌별 보유" breakdown. Used both by the boot migration and (defensively)
 * anywhere holdings are read.
 */
export function mergeDuplicateHoldings<
  T extends { accountId: string; symbol: string; quantity: number; avgPrice: number; createdAt: string },
>(holdings: T[]): T[] {
  const groups = new Map<string, T[]>();
  const order: string[] = [];
  for (const h of holdings) {
    const key = `${h.accountId}:${h.symbol}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(h);
  }

  return order.map((key) => {
    const rows = groups.get(key)!;
    if (rows.length === 1) return rows[0];
    const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
    const avgPrice =
      totalQty > 0 ? rows.reduce((s, r) => s + r.quantity * r.avgPrice, 0) / totalQty : 0;
    const earliest = rows.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b));
    return { ...earliest, quantity: totalQty, avgPrice };
  });
}
