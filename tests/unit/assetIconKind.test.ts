import { describe, it, expect } from 'vitest';
import { assetIconKind } from '@/lib/assetIconKind';
import type { MarketAsset } from '@/lib/schema';

function mk(partial: Partial<MarketAsset>): MarketAsset {
  return {
    symbol: 'X:X',
    name: 'X',
    category: '국내증권',
    currency: 'KRW',
    currentPrice: 0,
    dailyChange: 0,
    dailyChangePct: 0,
    updatedAt: '',
    ...partial,
  };
}

describe('assetIconKind', () => {
  it('crypto category → crypto', () => {
    expect(assetIconKind(mk({ symbol: 'CRYPTO:BTC', category: '가상자산' }))).toBe('crypto');
    expect(assetIconKind(mk({ symbol: 'CRYPTO:ETH', category: '가상자산' }))).toBe('crypto');
  });

  it('gold category → gold', () => {
    expect(assetIconKind(mk({ symbol: 'KRX:GOLD', category: '금', name: '금현물' }))).toBe('gold');
  });

  it('regular Korean equity → stock', () => {
    expect(
      assetIconKind(mk({ symbol: 'KRX:005930', category: '국내증권', name: 'Samsung Electronics', nameKo: '삼성전자' })),
    ).toBe('stock');
  });

  it('regular US equity → stock', () => {
    expect(assetIconKind(mk({ symbol: 'NASDAQ:AAPL', category: '미국증권', name: 'Apple Inc.' }))).toBe('stock');
    expect(assetIconKind(mk({ symbol: 'NYSE:DELL', category: '미국증권', name: 'Dell Technologies' }))).toBe('stock');
  });

  describe('ETF detection', () => {
    it('KR ETF — KODEX prefix → etf', () => {
      expect(
        assetIconKind(mk({ symbol: 'KRX:069500', category: '국내증권', name: 'KODEX 200', nameKo: 'KODEX 200' })),
      ).toBe('etf');
    });

    it('KR ETF — TIGER prefix → etf', () => {
      expect(
        assetIconKind(mk({ symbol: 'KRX:453870', category: '국내증권', name: 'TIGER 인도니프티50', nameKo: 'TIGER 인도니프티50' })),
      ).toBe('etf');
    });

    it('KR ETF — KOSEF / SOL / ACE / HANARO / RISE / KBSTAR prefixes → etf', () => {
      const prefixes = ['KOSEF', 'SOL', 'ACE', 'HANARO', 'RISE', 'KBSTAR', 'ARIRANG', 'PLUS'];
      for (const p of prefixes) {
        expect(
          assetIconKind(mk({ symbol: 'KRX:000000', category: '국내증권', name: `${p} 200`, nameKo: `${p} 200` })),
        ).toBe('etf');
      }
    });

    it('US ETF — known symbols → etf', () => {
      const syms = ['ARKX', 'ARKK', 'QQQ', 'SPY', 'VOO', 'VTI', 'VWO', 'IWM', 'GLD', 'SLV', 'TLT'];
      for (const s of syms) {
        expect(assetIconKind(mk({ symbol: `NASDAQ:${s}`, category: '미국증권', name: s }))).toBe('etf');
      }
    });

    it('US name "Apple Inc." is not an ETF', () => {
      expect(assetIconKind(mk({ symbol: 'NASDAQ:AAPL', category: '미국증권', name: 'Apple Inc.' }))).toBe('stock');
    });

    it('KR name with ETF-like prefix in the middle (not leading) is not an ETF', () => {
      expect(
        assetIconKind(mk({ symbol: 'KRX:005930', category: '국내증권', name: '내꺼 KODEX 펀드', nameKo: '내꺼 KODEX 펀드' })),
      ).toBe('stock');
    });
  });
});
