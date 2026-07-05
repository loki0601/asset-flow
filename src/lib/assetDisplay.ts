import type { MarketAsset } from '@/lib/schema';

/**
 * Display name for a market asset. Prefer the Korean alias (`nameKo`) when
 * the server has one for the symbol — Korean users instantly recognise
 * "애플" but might pause on "Apple Inc.". Falls back to the canonical
 * English name otherwise.
 */
export function assetDisplayName(asset: Pick<MarketAsset, 'name' | 'nameKo'>): string {
  return asset.nameKo && asset.nameKo.trim().length > 0 ? asset.nameKo : asset.name;
}

/**
 * Minimal stand-in for a symbol missing from the catalog (delisted ticker
 * with surviving transactions, symbol renamed server-side, …). Infers the
 * currency from the exchange prefix — falling back to KRW for a NASDAQ/NYSE
 * symbol rendered a $415.65 sale as ₩416. Crypto stays KRW (KRW-quoted).
 */
export function fallbackAsset(
  symbol: string,
): Pick<MarketAsset, 'symbol' | 'category' | 'name' | 'nameKo' | 'currency'> {
  const isUs = symbol.startsWith('NASDAQ:') || symbol.startsWith('NYSE:');
  return {
    symbol,
    category: isUs ? '미국증권' : '국내증권',
    name: symbol,
    currency: isUs ? 'USD' : 'KRW',
  };
}
