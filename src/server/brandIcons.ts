/**
 * Server-side brand-icon manifest builder.
 *
 * Joins the three catalog files (KR/US/crypto) against simple-icons +
 * a small manual override table, producing a `{symbol: {path, viewBox,
 * slug}}` map. The client downloads this once on cold start (see
 * brandIconCache.ts) and reads from sql.js KV afterwards, so the
 * picker / holdings list can render brand glyphs for every symbol
 * without bundling thousands of SVG paths into the JS chunk.
 *
 * Cached in module scope — the catalog only changes on a deploy, so a
 * single build is reused across requests.
 */

import * as simpleIcons from 'simple-icons';
import krxCatalog from '@/server/data/krx.json';
import usCatalog from '@/server/data/us.json';
import cryptoCatalog from '@/server/data/crypto.json';
import { tickerDomain } from '@/server/tickerDomain';

interface SimpleIconEntry {
  title: string;
  slug: string;
  path: string;
  hex: string;
}

interface CatalogEntry {
  symbol: string;
  name: string;
}

export interface ManifestIcon {
  path: string;
  viewBox: string;
  slug: string;
  /** Brand colour from simple-icons (no leading "#"). Used by the client
   *  so glyphs render in their native brand colour instead of the theme's
   *  ink colour — matches the look of the favicon-sourced logos. */
  hex: string;
}

export interface BrandIconManifest {
  /** Stable across builds — content hash of the icons map. Client uses
   *  this to decide whether to redownload. */
  version: string;
  icons: Record<string, ManifestIcon>;
  /** Symbols that mapped to a brand glyph. Useful for diagnostics
   *  ("how many catalog entries got covered?"). */
  count: number;
  /** Symbols that don't have a monochrome SVG but DO have a derivable
   *  company domain, so the client can fall back to the masked-logo
   *  rendering path (`/api/icons/logo/[symbol]`). The client treats
   *  this as a hint — actual availability depends on whether the
   *  upstream logo CDN has the domain. */
  logoSymbols: string[];
}

const VIEW_BOX = '0 0 24 24';

let cached: BrandIconManifest | null = null;

export function brandIconManifest(): BrandIconManifest {
  if (cached) return cached;
  cached = buildManifest();
  return cached;
}

function buildManifest(): BrandIconManifest {
  const si: Record<string, SimpleIconEntry> = simpleIcons as unknown as Record<
    string,
    SimpleIconEntry
  >;
  // Index by normalised title AND slug so the matcher can hit either
  // path. Some catalog names use the company short form ("Apple") while
  // others spell out the legal entity ("Apple Inc.") — the normaliser
  // strips suffixes and whitespace to make those collide.
  const byKey = new Map<string, SimpleIconEntry>();
  for (const key of Object.keys(si)) {
    const entry = si[key];
    if (!entry?.path || !entry.title) continue;
    const tNorm = normalise(entry.title);
    const sNorm = normalise(entry.slug);
    if (tNorm && !byKey.has(tNorm)) byKey.set(tNorm, entry);
    if (sNorm && !byKey.has(sNorm)) byKey.set(sNorm, entry);
  }

  const icons: Record<string, ManifestIcon> = {};
  for (const symbol of Object.keys(MANUAL_MAP)) {
    const slug = MANUAL_MAP[symbol];
    const entry = lookupBySlug(si, slug);
    if (entry) icons[symbol] = makeIcon(entry);
  }
  // Custom inline SVGs (Microsoft / Amazon — both pulled their brand
  // from simple-icons for licensing). Plus a hand-drawn gold ingot to
  // unify KRX:GOLD with the rest of the brand-icon family.
  for (const symbol of Object.keys(INLINE_ICONS)) {
    icons[symbol] = INLINE_ICONS[symbol];
  }

  const logoSymbols: string[] = [];
  for (const entry of allCatalogEntries()) {
    if (!icons[entry.symbol]) {
      const matched = matchCatalogEntry(entry, byKey);
      if (matched) icons[entry.symbol] = makeIcon(matched);
    }
    if (!icons[entry.symbol]) {
      // No SVG glyph available — but if we can derive a company domain,
      // the client can route this symbol through the masked-logo path.
      if (tickerDomain(entry)) logoSymbols.push(entry.symbol);
    }
  }

  // Per-symbol hex overrides. simple-icons records canonical brand
  // colours that are correct but visually flat against the app's
  // cream-sage surface — Apple's #000 is the most obvious case
  // (reads as "no colour" next to Google's blue / Broadcom's red).
  // Substitute brand-adjacent colours that have actual chroma.
  for (const symbol of Object.keys(HEX_OVERRIDES)) {
    const current = icons[symbol];
    if (current) icons[symbol] = { ...current, hex: HEX_OVERRIDES[symbol] };
  }

  return {
    version: hashIcons(icons) + '-' + logoSymbols.length.toString(16),
    icons,
    count: Object.keys(icons).length,
    logoSymbols,
  };
}

function makeIcon(entry: SimpleIconEntry): ManifestIcon {
  return { path: entry.path, viewBox: VIEW_BOX, slug: entry.slug, hex: entry.hex };
}

function matchCatalogEntry(
  entry: CatalogEntry,
  byKey: Map<string, SimpleIconEntry>,
): SimpleIconEntry | null {
  // Try the symbol's ticker first (NASDAQ:AAPL → "AAPL" → match siApple).
  // Require ≥3 chars to avoid 1-letter tickers like F (Ford) glomming
  // onto unrelated 1-char brands like "F#" — those should fall through
  // to the manual map.
  const colonIdx = entry.symbol.indexOf(':');
  if (colonIdx >= 0) {
    const code = entry.symbol.slice(colonIdx + 1);
    if (code.length >= 3) {
      const tickerHit = byKey.get(normalise(code));
      if (tickerHit) return tickerHit;
    }
  }
  // Then by company name. Strip common legal suffixes ("Inc.", "Class A",
  // "Co., Ltd.") so "Apple Inc." matches simple-icons "Apple".
  const cleanedName = stripLegalSuffix(entry.name);
  const nameHit = byKey.get(normalise(cleanedName));
  if (nameHit) return nameHit;
  // Last try: the leading word of the name. Helps with hits like
  // "Tesla, Inc." or "NVIDIA Corporation".
  const leading = cleanedName.split(/\s+/)[0] ?? '';
  if (leading) {
    const leadingHit = byKey.get(normalise(leading));
    if (leadingHit) return leadingHit;
  }
  return null;
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function stripLegalSuffix(name: string): string {
  // Word-boundary anchor (\s) before each suffix keeps "Cisco" intact —
  // an earlier pass matched the "co" at the end via `Co\.?`. Also strips
  // trailing parentheticals like "Walt Disney Company (The)".
  let out = name.replace(/\s*\([^)]+\)\s*$/, '').trim();
  out = out
    .replace(
      /[,]?\s+(Class [A-Z]( Common Stock)?( New)?|Common Stock|Inc\.?|Corp\.?|Corporation|Co\.?|Co\., Ltd\.?|Ltd\.?|Limited|Plc|LLC|N\.V\.|S\.A\.|S\.p\.A\.|AG|SE|ADR|American Depositary Shares?( - .+)?|Ordinary Shares?( - .+)?|New York Registry Shares?|S&P 500)$/gi,
      '',
    )
    .trim();
  return out;
}

function lookupBySlug(
  si: Record<string, SimpleIconEntry>,
  slug: string,
): SimpleIconEntry | null {
  // simple-icons exports siCamelCase keys; convert "apple" → "siApple".
  const key = 'si' + slug.charAt(0).toUpperCase() + slug.slice(1);
  return si[key] ?? null;
}

function hashIcons(icons: Record<string, ManifestIcon>): string {
  // FNV-1a 32-bit hash — fast, dependency-free, good enough for "did
  // this change since last build".  Hex string, 8 chars. Must include
  // every persisted field (slug + hex) so a colour-only change still
  // bumps the version and forces clients to refetch instead of reading
  // their stale KV cache.
  let h = 0x811c9dc5;
  for (const symbol of Object.keys(icons).sort()) {
    const icon = icons[symbol];
    const s = `${symbol}\0${icon.slug}\0${icon.hex ?? ''}\n`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) | 0;
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function allCatalogEntries(): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const src of [krxCatalog, usCatalog, cryptoCatalog]) {
    const assets = (src as { assets?: CatalogEntry[] }).assets;
    if (Array.isArray(assets)) out.push(...assets);
  }
  return out;
}

let catalogIndex: Map<string, CatalogEntry> | null = null;

/** O(1) lookup of a catalog entry by symbol. Used by the logo proxy
 *  endpoint, which needs the company name to derive a domain. */
export function catalogEntryFor(symbol: string): CatalogEntry | null {
  if (!catalogIndex) {
    catalogIndex = new Map();
    for (const e of allCatalogEntries()) catalogIndex.set(e.symbol, e);
  }
  return catalogIndex.get(symbol) ?? null;
}

// Manual symbol → simple-icons slug overrides for cases where the
// auto-matcher would miss (KR chaebols whose catalog name is Korean,
// crypto whose ticker doesn't slugify to the right brand, ADRs).
const MANUAL_MAP: Record<string, string> = {
  'KRX:005930': 'samsung',
  'KRX:005380': 'hyundai',
  'KRX:000270': 'kia',
  'KRX:051910': 'lg',
  'KRX:035420': 'naver',
  'KRX:035720': 'kakao',
  'KRX:000660': 'skhynix', // not in simple-icons, will silently miss
  'CRYPTO:BTC': 'bitcoin',
  'CRYPTO:ETH': 'ethereum',
  'CRYPTO:SOL': 'solana',
  'CRYPTO:DOGE': 'dogecoin',
  'CRYPTO:XRP': 'xrp',
  'CRYPTO:LTC': 'litecoin',
  'CRYPTO:BCH': 'bitcoincash',
  'CRYPTO:ADA': 'cardano',
  'CRYPTO:DOT': 'polkadot',
  'CRYPTO:TRX': 'tron',
  'NASDAQ:AVGO': 'broadcom',
  'NASDAQ:AAPL': 'apple',
  'NASDAQ:GOOGL': 'google',
  'NASDAQ:GOOG': 'google',
  'NASDAQ:META': 'meta',
  'NASDAQ:NVDA': 'nvidia',
  'NASDAQ:TSLA': 'tesla',
  'NASDAQ:UBER': 'uber',
  'NASDAQ:PLTR': 'palantir',
  'NASDAQ:ABT': 'abbott',
  'NYSE:DELL': 'dell',
  'NYSE:F': 'ford', // 1-char ticker — would be skipped by the length guard
};

// Custom inline icons. Microsoft and Amazon previously lived here as
// hand-drawn monochrome marks (simple-icons pulled their brands for
// licensing); they're now routed through the favicon CDN instead so
// the proper multi-colour brand logos render — the Microsoft 4-colour
// grid, Amazon orange smile, etc. Only KRX:GOLD remains inline because
// it's an in-house symbol with no real company website.
// Per-symbol hex overrides applied after the SVG path is resolved.
// Apple is the canonical case: simple-icons keeps the brand at #000 to
// match marketing materials, but a pure-black silhouette reads as "no
// colour" on the app's cream-sage surface. The aluminium-silver below
// is the same family Apple uses on iPhone / MacBook product photos.
const HEX_OVERRIDES: Record<string, string> = {
  'NASDAQ:AAPL': 'A2AAAD',
};

const INLINE_ICONS: Record<string, ManifestIcon> = {
  'KRX:GOLD': {
    path: 'M4 7 L20 7 L21 9 L22 16 L2 16 L3 9 Z',
    viewBox: VIEW_BOX,
    slug: 'gold-ingot',
    hex: 'C5A572',
  },
};
