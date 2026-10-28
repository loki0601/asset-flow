import { describe, expect, it } from 'vitest';
import { markDelistedKrx } from '@/server/domain/delisting';
import type { MarketAsset } from '@/lib/schema';

const asset = (symbol: string): MarketAsset => ({
  symbol, name: symbol, category: '국내증권', currency: 'KRW',
  currentPrice: 0, dailyChange: 0, dailyChangePct: 0, updatedAt: '',
});

const pricedKrx = (n: number) => new Set(Array.from({ length: n }, (_, i) => `KRX:${String(i).padStart(6, '0')}`));

describe('markDelistedKrx', () => {
  it('marks KRX assets missing from a full daily price snapshot as deprecated', () => {
    const priced = pricedKrx(1000);
    const out = markDelistedKrx([asset('KRX:000001'), asset('KRX:012510')], priced);
    expect(out.map((a) => a.deprecated ?? false)).toEqual([false, true]);
  });

  it('never marks US or crypto assets, whose prices are only fetched for a subset', () => {
    const out = markDelistedKrx([asset('NASDAQ:MMM'), asset('CRYPTO:XYZ')], pricedKrx(1000));
    expect(out.every((a) => !a.deprecated)).toBe(true);
  });

  it('leaves everything alone when the KRX price fetch looks incomplete', () => {
    const out = markDelistedKrx([asset('KRX:012510')], pricedKrx(10));
    expect(out[0].deprecated).toBeUndefined();
  });

  it('keeps manually curated KRX extras such as gold', () => {
    const out = markDelistedKrx([asset('KRX:GOLD')], pricedKrx(1000));
    expect(out[0].deprecated).toBeUndefined();
  });
});
