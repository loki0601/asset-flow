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
