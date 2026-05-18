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
