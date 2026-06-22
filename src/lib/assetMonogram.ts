import type { MarketAsset } from '@/lib/schema';

/**
 * Short visual identifier rendered as the primary mark inside
 * AssetCategoryIcon (the corner badge carries the category). Goal: the
 * user can tell two holdings apart at a glance, even when both share the
 * same category accent (e.g. two NASDAQ tickers in the dashboard list).
 *
 * Rules:
 *   - KRX:GOLD                 → 金 (Hangul "금" reads as just another
 *                                stock; the Chinese radical reads
 *                                instantly as the metal)
 *   - CRYPTO:*  / NASDAQ:* /
 *     NYSE:*                   → ticker after the colon, capped at 4
 *                                chars (AAPL stays "AAPL", GOOGL → "GOOG")
 *   - KRX:* with Hangul name   → first Hangul char of the name
 *     (e.g. "삼성전자" → "삼")
 *   - KRX:* with ASCII name    → first 4 ASCII chars of the leading word
 *     (e.g. "KODEX 200" → "KODE", "TIGER 인도니프티50" → "TIGE")
 *   - Anything else            → ticker prefix capped at 4, or "?"
 */
export function assetMonogram(
  asset: Pick<MarketAsset, 'symbol' | 'name' | 'nameKo'>,
): string {
  if (asset.symbol === 'KRX:GOLD') return '金';

  const [prefix = '', code = ''] = asset.symbol.split(':');
  if (prefix === 'CRYPTO' || prefix === 'NASDAQ' || prefix === 'NYSE') {
    return code.slice(0, 4) || '?';
  }

  const name = (asset.nameKo ?? '').trim() || (asset.name ?? '').trim();
  if (name.length > 0) {
    if (HANGUL_HEAD.test(name)) return name[0];
    const head = name.split(/\s+/)[0] ?? name;
    return head.slice(0, 4);
  }

  return code.slice(0, 4) || '?';
}

const HANGUL_HEAD = /^[ㄱ-ㆎ가-힣]/;
