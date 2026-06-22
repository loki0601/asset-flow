import { describe, it, expect } from 'vitest';
import { assetMonogram } from '@/lib/assetMonogram';
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

describe('assetMonogram', () => {
  describe('Korean equities (KRX:*)', () => {
    it('uses the first Hangul char of the Korean name', () => {
      expect(assetMonogram(mk({ symbol: 'KRX:005930', name: 'Samsung Electronics', nameKo: '삼성전자' }))).toBe('삼');
    });

    it('falls back to the English name prefix when nameKo missing on a KRX symbol', () => {
      expect(assetMonogram(mk({ symbol: 'KRX:005930', name: 'Samsung Electronics' }))).toBe('Sams');
    });

    it('ETF naming — leading alphanumeric token first', () => {
      expect(assetMonogram(mk({ symbol: 'KRX:069500', name: 'KODEX 200', nameKo: 'KODEX 200' }))).toBe('KODE');
    });

    it('TIGER fund — uses name not ticker code', () => {
      expect(assetMonogram(mk({ symbol: 'KRX:453870', name: 'TIGER 인도니프티50', nameKo: 'TIGER 인도니프티50' }))).toBe('TIGE');
    });
  });

  describe('US equities (NASDAQ:*, NYSE:*)', () => {
    it('returns the ticker (after the colon) capped at 4 chars', () => {
      expect(assetMonogram(mk({ symbol: 'NASDAQ:AAPL', name: 'Apple Inc.', nameKo: '애플' }))).toBe('AAPL');
      expect(assetMonogram(mk({ symbol: 'NASDAQ:GOOGL', name: 'Alphabet Inc.', nameKo: '알파벳' }))).toBe('GOOG');
      expect(assetMonogram(mk({ symbol: 'NYSE:DELL', name: 'Dell Technologies', nameKo: '델' }))).toBe('DELL');
    });

    it('keeps short tickers intact (no padding)', () => {
      expect(assetMonogram(mk({ symbol: 'NYSE:F', name: 'Ford Motor', nameKo: '포드' }))).toBe('F');
    });
  });

  describe('Crypto (CRYPTO:*)', () => {
    it('returns the bare ticker for known coins', () => {
      expect(assetMonogram(mk({ symbol: 'CRYPTO:BTC', name: 'Bitcoin', nameKo: '비트코인' }))).toBe('BTC');
      expect(assetMonogram(mk({ symbol: 'CRYPTO:ETH', name: 'Ethereum', nameKo: '이더리움' }))).toBe('ETH');
    });

    it('caps long crypto tickers at 4 chars', () => {
      expect(assetMonogram(mk({ symbol: 'CRYPTO:USDC', name: 'USD Coin' }))).toBe('USDC');
      expect(assetMonogram(mk({ symbol: 'CRYPTO:DOGE', name: 'Dogecoin' }))).toBe('DOGE');
    });
  });

  describe('KRX:GOLD — manual symbol', () => {
    it('returns 金 for KRX gold', () => {
      expect(assetMonogram(mk({ symbol: 'KRX:GOLD', name: '금현물', nameKo: '금현물' }))).toBe('金');
    });
  });

  describe('edge cases', () => {
    it('uses ticker prefix when nothing else is available', () => {
      expect(assetMonogram(mk({ symbol: 'UNKNOWN:FOO', name: '', nameKo: '' }))).toBe('FOO');
    });

    it('strips whitespace from name before slicing', () => {
      expect(assetMonogram(mk({ symbol: 'KRX:005930', name: 'X', nameKo: '   삼성전자   ' }))).toBe('삼');
    });

    it('never returns an empty string — falls back to ?', () => {
      expect(assetMonogram(mk({ symbol: ':', name: '', nameKo: '' }))).toBe('?');
    });
  });
});
