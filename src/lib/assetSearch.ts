import type { AssetCategory, MarketAsset } from '@/lib/schema';
import { isAllInitials, matchesInitials } from '@/lib/hangulInitials';

/**
 * Max rows the asset picker renders. The catalog holds ~13,400 symbols;
 * rendering every match as a DOM row (each with a logo <img>) froze the
 * modal on device. Nobody scrolls past ~100 rows — they refine the query.
 * Held symbols are hoisted first so the cap never hides a position.
 */
export const PICKER_RESULT_LIMIT = 100;

/**
 * Pure search/scoring for the asset picker (extracted from AssetPickerModal
 * so it's unit-testable and capped).
 *
 * Score: 0=exact symbol/name, 1=symbol prefix, 2=symbol contains, 3=name
 * prefix, 4=name contains, 5=initial-jamo match. Anything else drops out.
 * Held items always outrank unheld ones — a held position is more
 * interesting than an unrelated match at the same relevance band.
 */
export function searchAssets(
  assets: readonly MarketAsset[],
  query: string,
  category: AssetCategory | '전체',
  heldSymbols: ReadonlySet<string>,
  limit: number = PICKER_RESULT_LIMIT,
): MarketAsset[] {
  const q = query.trim().toLowerCase();
  const base = assets.filter((a) => {
    if (a.deprecated) return false; // 단종 종목은 신규 매수 목록에서 숨김
    if (category !== '전체' && a.category !== category) return false;
    return true;
  });

  if (!q) {
    // No query: held first, then the rest in catalog order, capped.
    const held: MarketAsset[] = [];
    const rest: MarketAsset[] = [];
    for (const a of base) {
      (heldSymbols.has(a.symbol) ? held : rest).push(a);
    }
    return [...held, ...rest].slice(0, limit);
  }

  // If the user typed only Hangul initial jamo (e.g. "ㅅㅅ"), match against
  // the initials-projection of name/nameKo. Falls through to substring
  // search for any other query shape.
  const initialsOnly = isAllInitials(query.trim());

  type Scored = { a: MarketAsset; score: number };
  const scored: Scored[] = [];
  for (const a of base) {
    const sym = a.symbol.split(':').pop()?.toLowerCase() ?? '';
    // Match against both English and Korean names so "애플" and "Apple"
    // both surface the same ticker. Lowercase normalisation works for
    // hangul too — toLowerCase is a no-op for non-cased scripts.
    const name = a.name.toLowerCase();
    const nameKo = (a.nameKo ?? '').toLowerCase();
    let score = -1;
    if (sym === q || name === q || nameKo === q) score = 0;
    else if (sym.startsWith(q)) score = 1;
    else if (sym.includes(q)) score = 2;
    else if (name.startsWith(q) || nameKo.startsWith(q)) score = 3;
    else if (name.includes(q) || nameKo.includes(q)) score = 4;
    else if (
      initialsOnly &&
      (matchesInitials(a.name, query.trim()) ||
        matchesInitials(a.nameKo ?? '', query.trim()))
    ) {
      score = 5;
    }
    if (score >= 0) scored.push({ a, score });
  }
  scored.sort((x, y) => {
    const xh = heldSymbols.has(x.a.symbol) ? 0 : 1;
    const yh = heldSymbols.has(y.a.symbol) ? 0 : 1;
    if (xh !== yh) return xh - yh;
    return x.score - y.score || x.a.name.localeCompare(y.a.name);
  });
  return scored.slice(0, limit).map((s) => s.a);
}
