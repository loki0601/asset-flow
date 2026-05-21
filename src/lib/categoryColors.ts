/**
 * Per-category accent colour for holding cards and the allocation donut.
 *
 * The palette flips with the active theme so 국내증권 reads as the brand
 * sage in light and as a warm ochre in dark — matches the vocalog-style
 * dark tone the user wants for accent surfaces.
 *
 * Caller passes the live theme value (read from a hook) instead of
 * reaching for document.documentElement here so the function stays pure
 * and testable.
 */
import type { AssetCategory } from '@/lib/schema';

const LIGHT: Record<string, string> = {
  국내증권: '#2D4F35',
  미국증권: '#4A7256',
  가상자산: '#8BA18E',
  금: '#B8C8BC',
};

const DARK: Record<string, string> = {
  // Vocalog wet-wood family.  `--brand` is now #8C7A6B (the exact vocalog
  // dark wet-wood value); each category sits in roughly the same band
  // but shifts hue slightly so the donut still differentiates.
  국내증권: '#8C7A6B', // wet-wood (matches brand accent)
  미국증권: '#A08C7C', // mid wet-wood
  가상자산: '#766A60', // darker, cooler wet-wood
  금: '#B59E80',       // warmer wood with slight gold lean
};

export function categoryColor(category: string, theme: 'light' | 'dark'): string {
  return (theme === 'dark' ? DARK : LIGHT)[category] ?? (theme === 'dark' ? '#A88A6F' : '#2D4F35');
}

export function categoryColors(theme: 'light' | 'dark'): Record<AssetCategory, string> {
  return (theme === 'dark' ? DARK : LIGHT) as Record<AssetCategory, string>;
}
