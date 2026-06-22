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
