import { describe, it, expect } from 'vitest';
import { assetBrandIcon } from '@/lib/assetBrandIcon';

describe('assetBrandIcon', () => {
  it('returns a brand glyph for major mapped tickers', () => {
    const symbols = [
      'NASDAQ:AAPL',
      'NASDAQ:NVDA',
      'NASDAQ:META',
      'NASDAQ:TSLA',
      'NASDAQ:GOOGL',
      'NASDAQ:UBER',
      'NYSE:DELL',
      'NASDAQ:AVGO',
      'NASDAQ:PLTR',
      'NASDAQ:ABT',
      'KRX:005930',
      'KRX:005380',
      'CRYPTO:BTC',
      'CRYPTO:ETH',
      'KRX:GOLD',
    ];
    for (const symbol of symbols) {
      const got = assetBrandIcon({ symbol });
      expect(got, `${symbol} should map to a brand icon`).not.toBeNull();
      expect(got?.path.length, `${symbol} path should be non-empty`).toBeGreaterThan(0);
      expect(got?.viewBox).toBe('0 0 24 24');
    }
  });

  it('routes Microsoft + Amazon through the favicon CDN (no inline glyph)', () => {
    // Both lived in INLINE_ICONS as monochrome hand-drawn marks; we now
    // prefer the real multi-colour brand assets the favicon proxy can
    // serve, so they should return null here and rely on the
    // logoSymbols path inside AssetCategoryIcon.
    expect(assetBrandIcon({ symbol: 'NASDAQ:MSFT' })).toBeNull();
    expect(assetBrandIcon({ symbol: 'NASDAQ:AMZN' })).toBeNull();
  });

  it('returns null for ETFs and other unmapped symbols (fall through to monogram)', () => {
    expect(assetBrandIcon({ symbol: 'NASDAQ:ARKX' })).toBeNull();
    expect(assetBrandIcon({ symbol: 'KRX:000660' })).toBeNull(); // SK Hynix — not in simple-icons
    expect(assetBrandIcon({ symbol: 'KRX:069500' })).toBeNull(); // KODEX 200
    expect(assetBrandIcon({ symbol: 'KRX:453870' })).toBeNull(); // TIGER 인도니프티50
  });

  it('returns the gold ingot glyph for KRX:GOLD', () => {
    const g = assetBrandIcon({ symbol: 'KRX:GOLD' });
    expect(g).not.toBeNull();
    expect(g?.slug).toBe('gold-ingot');
  });

  it('returns null for completely unknown symbols (defensive)', () => {
    expect(assetBrandIcon({ symbol: 'NASDAQ:NEVERHEARDOF' })).toBeNull();
  });
});
