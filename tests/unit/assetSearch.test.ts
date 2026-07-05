import { describe, it, expect } from 'vitest';
import { searchAssets, PICKER_RESULT_LIMIT } from '@/lib/assetSearch';
import type { MarketAsset } from '@/lib/schema';

// Regression: the asset picker rendered EVERY match — with an empty query
// that was the entire ~13,400-symbol catalog as DOM rows, which froze the
// modal on device. searchAssets caps the result list; held symbols always
// survive the cap.

const asset = (symbol: string, name: string, over: Partial<MarketAsset> = {}): MarketAsset => ({
  symbol,
  name,
  category: '국내증권',
  currency: 'KRW',
  currentPrice: 100,
  dailyChange: 0,
  dailyChangePct: 0,
  updatedAt: '',
  ...over,
});

describe('searchAssets', () => {
  const none = new Set<string>();

  it('excludes deprecated assets', () => {
    const out = searchAssets(
      [asset('KRX:1', 'A'), asset('KRX:2', 'B', { deprecated: true })],
      '',
      '전체',
      none,
    );
    expect(out.map((a) => a.symbol)).toEqual(['KRX:1']);
  });

  it('filters by category', () => {
    const out = searchAssets(
      [asset('KRX:1', 'A'), asset('NASDAQ:X', 'X', { category: '미국증권' })],
      '',
      '미국증권',
      none,
    );
    expect(out.map((a) => a.symbol)).toEqual(['NASDAQ:X']);
  });

  it('hoists held symbols to the top with no query', () => {
    const out = searchAssets(
      [asset('KRX:1', 'A'), asset('KRX:2', 'B'), asset('KRX:3', 'C')],
      '',
      '전체',
      new Set(['KRX:3']),
    );
    expect(out[0].symbol).toBe('KRX:3');
  });

  it('ranks symbol matches above name matches', () => {
    const out = searchAssets(
      [asset('NASDAQ:AAPL', 'Apple Inc.'), asset('NASDAQ:APLE', 'Apple Hospitality')],
      'aapl',
      '전체',
      none,
    );
    expect(out[0].symbol).toBe('NASDAQ:AAPL');
  });

  it('matches Korean aliases', () => {
    const out = searchAssets(
      [asset('NASDAQ:AAPL', 'Apple Inc.', { nameKo: '애플' })],
      '애플',
      '전체',
      none,
    );
    expect(out).toHaveLength(1);
  });

  it('matches Hangul initials', () => {
    const out = searchAssets([asset('KRX:005930', '삼성전자')], 'ㅅㅅ', '전체', none);
    expect(out).toHaveLength(1);
  });

  it('caps the result list at the limit', () => {
    const many = Array.from({ length: PICKER_RESULT_LIMIT + 500 }, (_, i) =>
      asset(`KRX:${i}`, `종목${i}`),
    );
    expect(searchAssets(many, '', '전체', none)).toHaveLength(PICKER_RESULT_LIMIT);
  });

  it('held symbols always survive the cap', () => {
    const many = Array.from({ length: PICKER_RESULT_LIMIT + 500 }, (_, i) =>
      asset(`KRX:${i}`, `종목${i}`),
    );
    const heldSym = `KRX:${PICKER_RESULT_LIMIT + 300}`; // would be cut without hoisting
    const out = searchAssets(many, '', '전체', new Set([heldSym]));
    expect(out[0].symbol).toBe(heldSym);
    expect(out).toHaveLength(PICKER_RESULT_LIMIT);
  });
});
