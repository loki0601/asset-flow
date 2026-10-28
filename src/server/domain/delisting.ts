import type { MarketAsset } from '@/lib/schema';

/** Listed KRX share/ETF codes; excludes curated extras such as KRX:GOLD. */
const KRX_LISTING_CODE = /^KRX:[0-9A-Z]{6}$/;

/** Below this many KRX prices the daily fetch is treated as partial. */
const MIN_FULL_KRX_SNAPSHOT = 1000;

/**
 * The daily KRX price fetch covers every listed share, so a catalog entry
 * absent from it has been delisted or merged since the catalog was built.
 */
export function markDelistedKrx(assets: MarketAsset[], pricedSymbols: Set<string>): MarketAsset[] {
  let pricedKrx = 0;
  for (const s of pricedSymbols) if (KRX_LISTING_CODE.test(s)) pricedKrx++;
  if (pricedKrx < MIN_FULL_KRX_SNAPSHOT) return assets;
  return assets.map((a) =>
    KRX_LISTING_CODE.test(a.symbol) && !pricedSymbols.has(a.symbol) ? { ...a, deprecated: true } : a,
  );
}
