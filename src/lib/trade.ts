import type { Account, Holding } from '@/lib/schema';

export function applyBuy(
  holding: Holding,
  trade: { quantity: number; price: number },
): Holding {
  if (trade.quantity <= 0) return holding;
  const oldQty = holding.quantity;
  const oldAvg = holding.avgPrice;
  const newQty = oldQty + trade.quantity;
  const newAvg = (oldQty * oldAvg + trade.quantity * trade.price) / newQty;
  return {
    ...holding,
    quantity: newQty,
    avgPrice: newAvg,
    updatedAt: new Date().toISOString(),
  };
}

export function applySell(
  holding: Holding,
  trade: { quantity: number },
): Holding | null {
  if (trade.quantity >= holding.quantity) return null;
  return {
    ...holding,
    quantity: holding.quantity - trade.quantity,
    updatedAt: new Date().toISOString(),
  };
}

export function validateSellQuantity(
  holding: Pick<Holding, 'quantity'> | null,
  quantity: number,
): 'no-holding' | 'exceeds-holding' | null {
  if (!holding) return 'no-holding';
  if (quantity > holding.quantity) return 'exceeds-holding';
  return null;
}

export type ReverseTradeResult =
  | { ok: true; quantity: number; avgPrice: number }
  | { ok: false; reason: 'insufficient-quantity' };

/** Position after undoing a recorded trade. quantity 0 means no position remains. */
export function reverseTrade(
  holding: Pick<Holding, 'quantity' | 'avgPrice'> | null,
  tx: { type: 'buy' | 'sell'; quantity: number; price: number; avgCostAtSale?: number },
): ReverseTradeResult {
  const heldQty = holding?.quantity ?? 0;
  const heldAvg = holding?.avgPrice ?? 0;
  if (tx.type === 'buy') {
    if (heldQty < tx.quantity) return { ok: false, reason: 'insufficient-quantity' };
    const quantity = heldQty - tx.quantity;
    if (quantity === 0) return { ok: true, quantity: 0, avgPrice: 0 };
    const avgPrice = (heldQty * heldAvg - tx.quantity * tx.price) / quantity;
    return { ok: true, quantity, avgPrice: avgPrice > 0 ? avgPrice : heldAvg };
  }
  const restoredCost = tx.avgCostAtSale ?? tx.price;
  const quantity = heldQty + tx.quantity;
  return { ok: true, quantity, avgPrice: (heldQty * heldAvg + tx.quantity * restoredCost) / quantity };
}

/**
 * Pick the account that should be selected by default when the buy/sell
 * dialog opens. Prefers an account already holding this symbol — that's
 * almost always where the user intends to trade. With multiple held
 * accounts the first one in `candidates` wins (matches the on-screen
 * dropdown order). Falls back to the first candidate if no account holds
 * the symbol yet (first buy on a fresh ticker).
 */
export function preferredAccountId(
  candidates: Account[],
  holdings: Holding[],
  symbol: string,
): string | null {
  if (candidates.length === 0) return null;
  const heldAccountIds = new Set(
    holdings.filter((h) => h.symbol === symbol).map((h) => h.accountId),
  );
  const preferred = candidates.find((a) => heldAccountIds.has(a.id));
  return preferred?.id ?? candidates[0].id;
}

/**
 * Sanitise a free-form price input so it can hold decimals (required for
 * US tickers like PLTR @ $138.55) while still rendering with thousand
 * separators. Keeps the first decimal point, drops everything after.
 * KRX inputs that never use a decimal still format as integers.
 */
export function formatPriceInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  if (!cleaned) return '';
  const firstDot = cleaned.indexOf('.');
  const intPart = firstDot < 0 ? cleaned : cleaned.slice(0, firstDot);
  const decPart =
    firstDot < 0 ? '' : '.' + cleaned.slice(firstDot + 1).replace(/\./g, '');
  if (!intPart && !decPart) return '';
  const intFormatted = intPart ? Number(intPart).toLocaleString('ko-KR') : '0';
  return intFormatted + decPart;
}
