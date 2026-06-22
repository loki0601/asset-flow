import { describe, it, expect } from 'vitest';
import { applyBuy, applySell, formatPriceInput, preferredAccountId } from '@/lib/trade';
import type { Account, Holding } from '@/lib/schema';

const baseHolding: Holding = {
  id: 'h1',
  userId: 'u1',
  accountId: 'a1',
  symbol: 'KRX:005930',
  quantity: 10,
  avgPrice: 70_000,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
};

describe('applyBuy', () => {
  it('weights avgPrice when adding to an existing position', () => {
    const next = applyBuy(baseHolding, { quantity: 5, price: 80_000 });
    expect(next.quantity).toBe(15);
    // (10*70000 + 5*80000) / 15 = 1100000 / 15 ≈ 73333.33
    expect(next.avgPrice).toBeCloseTo(73_333.33, 1);
  });

  it('keeps avgPrice when buying zero (no-op safe)', () => {
    const next = applyBuy(baseHolding, { quantity: 0, price: 90_000 });
    expect(next).toEqual(baseHolding);
  });
});

describe('applySell', () => {
  it('decreases quantity but keeps avgPrice', () => {
    const next = applySell(baseHolding, { quantity: 3 });
    expect(next?.quantity).toBe(7);
    expect(next?.avgPrice).toBe(70_000);
  });

  it('returns null when selling the entire position', () => {
    const next = applySell(baseHolding, { quantity: 10 });
    expect(next).toBeNull();
  });

  it('clamps to zero (returns null) when selling more than held', () => {
    const next = applySell(baseHolding, { quantity: 20 });
    expect(next).toBeNull();
  });
});

function acc(id: string): Account {
  return {
    id,
    userId: 'u1',
    memberId: 'm1',
    institution: 'KB증권',
    name: id,
    createdAt: '2026-05-01T00:00:00.000Z',
  };
}

describe('preferredAccountId', () => {
  it('returns null when there are no candidate accounts', () => {
    expect(preferredAccountId([], [], 'NASDAQ:PLTR')).toBeNull();
  });

  it('falls back to the first candidate when no account holds the symbol', () => {
    expect(preferredAccountId([acc('A'), acc('B')], [], 'NASDAQ:PLTR')).toBe('A');
  });

  // Regression: opening the sell dialog for PLTR was defaulting to KB
  // 국내주식 (the first account in the dropdown) even though the user
  // actually holds PLTR in the KB 미국주식 account. The fix is to prefer
  // an account that already holds the symbol.
  it('prefers the held account over the first candidate', () => {
    const candidates = [acc('KR_ACC'), acc('US_ACC')];
    const holdings: Holding[] = [
      { ...baseHolding, id: 'h2', accountId: 'US_ACC', symbol: 'NASDAQ:PLTR' },
    ];
    expect(preferredAccountId(candidates, holdings, 'NASDAQ:PLTR')).toBe('US_ACC');
  });

  it('with multiple held accounts, picks the first in candidate order', () => {
    const candidates = [acc('A'), acc('B'), acc('C')];
    const holdings: Holding[] = [
      { ...baseHolding, id: 'h2', accountId: 'B', symbol: 'NASDAQ:PLTR' },
      { ...baseHolding, id: 'h3', accountId: 'C', symbol: 'NASDAQ:PLTR' },
    ];
    expect(preferredAccountId(candidates, holdings, 'NASDAQ:PLTR')).toBe('B');
  });

  it('ignores holdings for other symbols', () => {
    const candidates = [acc('A'), acc('B')];
    const holdings: Holding[] = [
      { ...baseHolding, id: 'h2', accountId: 'B', symbol: 'NASDAQ:AAPL' },
    ];
    expect(preferredAccountId(candidates, holdings, 'NASDAQ:PLTR')).toBe('A');
  });
});

describe('formatPriceInput', () => {
  it('formats integer input with Korean thousand separators', () => {
    expect(formatPriceInput('1234567')).toBe('1,234,567');
  });

  it('returns empty string for empty input', () => {
    expect(formatPriceInput('')).toBe('');
  });

  it('strips non-numeric, non-dot characters', () => {
    expect(formatPriceInput('abc')).toBe('');
    expect(formatPriceInput('12a3')).toBe('123');
  });

  // The original bug — US ticker prices like PLTR @ $138.55 couldn't be
  // entered because the old formatter stripped every non-digit including
  // the decimal point.
  it('keeps a single decimal point (US-stock fractional price)', () => {
    expect(formatPriceInput('138.5')).toBe('138.5');
    expect(formatPriceInput('138.55')).toBe('138.55');
    expect(formatPriceInput('1234.56')).toBe('1,234.56');
  });

  it('preserves a trailing dot while the user is mid-type', () => {
    expect(formatPriceInput('138.')).toBe('138.');
  });

  it('collapses extra dots to a single decimal', () => {
    expect(formatPriceInput('1.2.3')).toBe('1.23');
  });

  it('leading-dot input is treated as 0.x', () => {
    expect(formatPriceInput('.5')).toBe('0.5');
  });
});
