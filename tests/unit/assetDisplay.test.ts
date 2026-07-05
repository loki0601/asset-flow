import { describe, it, expect } from 'vitest';
import { assetDisplayName, fallbackAsset } from '@/lib/assetDisplay';

describe('assetDisplayName', () => {
  it('prefers the Korean alias when present', () => {
    expect(assetDisplayName({ name: 'Apple Inc.', nameKo: '애플' })).toBe('애플');
  });

  it('falls back to the canonical name', () => {
    expect(assetDisplayName({ name: 'Apple Inc.' })).toBe('Apple Inc.');
    expect(assetDisplayName({ name: 'Apple Inc.', nameKo: '  ' })).toBe('Apple Inc.');
  });
});

describe('fallbackAsset', () => {
  // Regression: a symbol missing from the catalog (delisted US stock with
  // remaining transactions) used to fall back to currency:'KRW', so a $415.65
  // sale rendered as ₩416. The exchange prefix tells us the currency.
  it('US-prefixed symbols fall back to USD', () => {
    expect(fallbackAsset('NASDAQ:GONE').currency).toBe('USD');
    expect(fallbackAsset('NYSE:GONE').currency).toBe('USD');
  });

  it('KRX symbols fall back to KRW', () => {
    expect(fallbackAsset('KRX:999999').currency).toBe('KRW');
  });

  it('crypto symbols fall back to KRW (KRW-quoted market)', () => {
    expect(fallbackAsset('CRYPTO:GONE').currency).toBe('KRW');
  });

  it('carries the symbol through as the display name', () => {
    const a = fallbackAsset('NASDAQ:GONE');
    expect(a.symbol).toBe('NASDAQ:GONE');
    expect(a.name).toBe('NASDAQ:GONE');
  });
});
