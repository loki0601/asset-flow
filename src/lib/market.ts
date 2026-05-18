/**
 * Thin client-side facade over the locally cached server catalog
 * (see lib/catalog.ts). Real per-symbol daily-close history is in
 * priceHistoryRepo (sql.js price_history table).
 */

import type { MarketAsset } from '@/lib/schema';
import { getLocalAsset, listLocalAssets } from '@/lib/catalog';

export function listMarketAssets(): MarketAsset[] {
  return listLocalAssets();
}

export function getMarketAsset(symbol: string): MarketAsset | undefined {
  return getLocalAsset(symbol);
}
