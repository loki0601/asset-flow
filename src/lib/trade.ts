import type { Holding } from '@/lib/schema';

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
