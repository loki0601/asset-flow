import type { MarketAsset } from '@/lib/schema';

export type AssetIconKind = 'stock' | 'etf' | 'crypto' | 'gold';

/**
 * Classify an asset into a visual icon family. Used by AssetCategoryIcon to
 * pick between Building2 / PieChart / Bitcoin / Coins — gives the holdings
 * list a stronger glanceable hierarchy than a single TrendingUp glyph.
 *
 * ETF detection is heuristic by name prefix (KR) and by ticker (US): there's
 * no clean machine-readable "is this an ETF" flag in the catalog, but every
 * KR ETF is sold under a brand prefix (KODEX/TIGER/etc.) and the US ETFs
 * we hold are a small known set.
 */
export function assetIconKind(
  asset: Pick<MarketAsset, 'symbol' | 'category' | 'name' | 'nameKo'>,
): AssetIconKind {
  if (asset.category === '가상자산') return 'crypto';
  if (asset.category === '금') return 'gold';
  if (isEtf(asset)) return 'etf';
  return 'stock';
}

const KR_ETF_PREFIXES = new Set([
  'KODEX',
  'TIGER',
  'KOSEF',
  'SOL',
  'ACE',
  'HANARO',
  'RISE',
  'KBSTAR',
  'ARIRANG',
  'PLUS',
  'TIMEFOLIO',
  'KOACT',
]);

const US_ETF_SYMBOLS = new Set([
  'ARKX', 'ARKK', 'ARKG', 'ARKW', 'ARKQ', 'ARKF',
  'QQQ', 'QQQM',
  'SPY', 'VOO', 'IVV',
  'VTI', 'VT', 'VEA', 'VWO', 'VGK', 'VPL',
  'IWM', 'IWB', 'IWN', 'IWF',
  'EFA', 'EEM',
  'AGG', 'BND', 'TLT', 'IEF', 'SHY', 'HYG', 'LQD',
  'GLD', 'SLV', 'IAU',
  'XLK', 'XLF', 'XLE', 'XLI', 'XLV', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE', 'XLC',
  'SMH', 'SOXX',
]);

function isEtf(asset: Pick<MarketAsset, 'symbol' | 'name' | 'nameKo'>): boolean {
  const colonIdx = asset.symbol.indexOf(':');
  if (colonIdx < 0) return false;
  const prefix = asset.symbol.slice(0, colonIdx);
  const code = asset.symbol.slice(colonIdx + 1);

  if (prefix === 'NASDAQ' || prefix === 'NYSE') {
    return US_ETF_SYMBOLS.has(code.toUpperCase());
  }
  if (prefix === 'KRX') {
    const name = (asset.nameKo ?? '').trim() || (asset.name ?? '').trim();
    const head = name.split(/\s+/)[0]?.toUpperCase() ?? '';
    return KR_ETF_PREFIXES.has(head);
  }
  return false;
}
