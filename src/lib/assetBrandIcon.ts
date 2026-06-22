import {
  siAbbott,
  siApple,
  siBitcoin,
  siBroadcom,
  siDell,
  siEthereum,
  siGoogle,
  siHyundai,
  siMeta,
  siNvidia,
  siPalantir,
  siSamsung,
  siTesla,
  siUber,
} from 'simple-icons';
import { cachedBrandIcon } from '@/lib/brandIconCache';
import type { MarketAsset } from '@/lib/schema';

export interface BrandIcon {
  /** The SVG `d` attribute — a single path covering the brand glyph. */
  path: string;
  /** SVG viewBox; simple-icons is uniformly 24×24, manual entries match. */
  viewBox: string;
  /** Identifier for debugging / tests. */
  slug: string;
  /** Brand-native hex colour, no leading "#". Renderer fills the SVG path
   *  with this so glyphs read as the real brand identity (Apple silver,
   *  Tesla red, etc.) and visually match the CDN favicon path. */
  hex?: string;
}

/**
 * Maps a symbol to its brand glyph (single-path SVG) when one is
 * available. The caller renders the path with the active theme colour
 * (text-brand-ink) — colours from simple-icons are intentionally ignored
 * so the icon set reads as one cohesive family inside the app instead of
 * a multi-coloured logo wall.
 *
 * Lookup order:
 *   1. Server-synced cache (sql.js KV) — covers ~630 catalog symbols,
 *      hydrated by syncBrandIconManifest() on boot. Empty until the
 *      first successful sync.
 *   2. Inline hardcoded fallback below — small list of always-available
 *      brands so the first cold boot still shows logos for major
 *      holdings before the manifest fetch lands.
 *
 * Symbols not in either layer get `null` and fall back to the monogram
 * + category badge.
 */
export function assetBrandIcon(asset: Pick<MarketAsset, 'symbol'>): BrandIcon | null {
  const cached = cachedBrandIcon(asset.symbol);
  if (cached) return cached;
  const entry = SYMBOL_MAP[asset.symbol];
  if (!entry) return null;
  if (typeof entry === 'function') return entry();
  return entry;
}

const SI_VIEWBOX = '0 0 24 24';

function fromSi(icon: { path: string; slug?: string; title: string; hex: string }): BrandIcon {
  return {
    path: icon.path,
    viewBox: SI_VIEWBOX,
    slug: icon.slug ?? icon.title,
    hex: icon.hex,
  };
}

// KRX:GOLD is an in-house symbol (KRX 금현물) with no company website
// to favicon — keep an inline ingot silhouette so it always renders.
const GOLD_INGOT: BrandIcon = {
  path: 'M4 7 L20 7 L21 9 L22 16 L2 16 L3 9 Z',
  viewBox: SI_VIEWBOX,
  slug: 'gold-ingot',
  hex: 'C5A572',
};

const SYMBOL_MAP: Record<string, BrandIcon | (() => BrandIcon)> = {
  // Apple's canonical brand hex is #000 — visually flat on the app's
  // cream-sage surface. Substitute aluminium silver (same family Apple
  // uses on product photography) so the silhouette reads as a colour.
  'NASDAQ:AAPL': () => ({ ...fromSi(siApple), hex: 'A2AAAD' }),
  'NASDAQ:NVDA': () => fromSi(siNvidia),
  'NASDAQ:META': () => fromSi(siMeta),
  'NASDAQ:TSLA': () => fromSi(siTesla),
  'NASDAQ:GOOGL': () => fromSi(siGoogle),
  'NASDAQ:UBER': () => fromSi(siUber),
  'NYSE:DELL': () => fromSi(siDell),
  'NASDAQ:AVGO': () => fromSi(siBroadcom),
  'NASDAQ:PLTR': () => fromSi(siPalantir),
  'NASDAQ:ABT': () => fromSi(siAbbott),
  'KRX:005930': () => fromSi(siSamsung),
  'KRX:005380': () => fromSi(siHyundai),
  'CRYPTO:BTC': () => fromSi(siBitcoin),
  'CRYPTO:ETH': () => fromSi(siEthereum),
  // Microsoft + Amazon route through the favicon CDN instead — the
  // multi-colour Windows grid / Amazon orange smile reads as the real
  // brand. Inline gray placeholders that lived here previously felt
  // washed out next to the SVG family.
  'KRX:GOLD': GOLD_INGOT,
};
