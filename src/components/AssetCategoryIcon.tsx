'use client';

import { useEffect, useRef, useState } from 'react';
import { Bitcoin, Building2, Coins, PieChart } from 'lucide-react';
import { assetBrandIcon } from '@/lib/assetBrandIcon';
import { cachedHasLogo } from '@/lib/brandIconCache';
import { assetIconKind } from '@/lib/assetIconKind';
import { assetMonogram } from '@/lib/assetMonogram';
import type { MarketAsset } from '@/lib/schema';

/**
 * Three-layer holding tile (in priority order):
 *
 *   1. Brand SVG glyph — single-path silhouette from the cached
 *      manifest. Rendered with `currentColor`, so the theme's
 *      `text-brand-ink` paints it.
 *   2. Masked CDN logo — for symbols where the SVG manifest has nothing
 *      but a company domain is derivable. The PNG's alpha channel masks
 *      a `text-brand-ink`-coloured div, so multicolour brand assets
 *      come out monochrome in the active theme.
 *   3. Monogram + category badge — last-resort fallback when neither
 *      layer can supply a glyph.
 */
export function AssetCategoryIcon({
  asset,
  color,
  size = 40,
  className = '',
}: {
  asset: Pick<MarketAsset, 'symbol' | 'category' | 'name' | 'nameKo'>;
  color: string;
  size?: number;
  className?: string;
}) {
  const brand = assetBrandIcon(asset);
  if (brand) {
    const glyphPx = Math.round(size * 0.55);
    const fill = brand.hex ? `#${brand.hex}` : 'currentColor';
    return (
      <div
        className={`shrink-0 rounded-2xl bg-brand-surface text-brand-ink flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <svg
          width={glyphPx}
          height={glyphPx}
          viewBox={brand.viewBox}
          fill={fill}
          focusable="false"
        >
          <path d={brand.path} />
        </svg>
      </div>
    );
  }

  if (cachedHasLogo(asset.symbol)) {
    return <MaskedLogoTile asset={asset} size={size} className={className} />;
  }

  return <CategoryFallback asset={asset} color={color} size={size} className={className} />;
}

function MaskedLogoTile({
  asset,
  size,
  className,
}: {
  asset: Pick<MarketAsset, 'symbol' | 'category' | 'name' | 'nameKo'>;
  size: number;
  className: string;
}) {
  // Always render the monogram as the persistent base layer. The favicon
  // fades in on top once it loads — if it 404s or stays in-flight, the
  // monogram is what the user sees, never an empty themed box.
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const url = `/api/icons/logo/${encodeURIComponent(asset.symbol)}`;
  const imgPx = Math.round(size * 0.62);
  const mark = assetMonogram(asset);
  const fontPx = fontSizeFor(mark, size);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [asset.symbol]);

  return (
    <div
      className={`relative shrink-0 rounded-2xl bg-brand-surface text-brand-ink flex items-center justify-center overflow-hidden ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span
        className="font-black tracking-tight tabular-nums select-none"
        style={{
          fontSize: fontPx,
          lineHeight: 1,
          opacity: loaded ? 0 : 1,
          transition: 'opacity 150ms ease-out',
        }}
      >
        {mark}
      </span>
      {!failed && (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          width={imgPx}
          height={imgPx}
          style={{
            position: 'absolute',
            objectFit: 'contain',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 180ms ease-out',
          }}
        />
      )}
    </div>
  );
}

function CategoryFallback({
  asset,
  color,
  size,
  className,
}: {
  asset: Pick<MarketAsset, 'symbol' | 'category' | 'name' | 'nameKo'>;
  color: string;
  size: number;
  className: string;
}) {
  const kind = assetIconKind(asset);
  const Glyph = GLYPH_FOR_KIND[kind];
  const mark = assetMonogram(asset);
  const fontPx = fontSizeFor(mark, size);
  const badgePx = Math.round(size * 0.42);
  const badgeGlyphPx = Math.round(badgePx * 0.62);

  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <div
        className="w-full h-full rounded-2xl flex items-center justify-center bg-brand-surface text-brand-ink font-black tracking-tight tabular-nums"
        style={{ fontSize: fontPx, lineHeight: 1 }}
        aria-hidden
      >
        {mark}
      </div>
      <div
        className="absolute rounded-full flex items-center justify-center text-white"
        style={{
          width: badgePx,
          height: badgePx,
          right: -2,
          bottom: -2,
          backgroundColor: color,
          boxShadow: '0 0 0 1.5px #FFFFFF, 0 1px 2px rgba(0,0,0,0.15)',
        }}
        aria-hidden
      >
        <Glyph size={badgeGlyphPx} strokeWidth={2.4} />
      </div>
    </div>
  );
}

const GLYPH_FOR_KIND = {
  stock: Building2,
  etf: PieChart,
  crypto: Bitcoin,
  gold: Coins,
} as const;

function fontSizeFor(mark: string, boxSize: number): number {
  const base =
    mark.length <= 1
      ? 0.5
      : mark.length === 2
        ? 0.44
        : mark.length === 3
          ? 0.36
          : 0.3;
  return Math.round(boxSize * base);
}
