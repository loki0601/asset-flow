import { describe, it, expect } from 'vitest';
import { computeAttainment, yearsUntilRetirement, aggregateProfiles } from '@/lib/retirement';
import type { RetirementProfile } from '@/lib/schema';

describe('computeAttainment', () => {
  it('returns expected/target as percent, rounded to integer', () => {
    expect(computeAttainment(3_120_000, 4_500_000)).toBe(69);
    expect(computeAttainment(2_150_000, 3_500_000)).toBe(61);
  });

  it('returns 0 when target is 0 (avoid divide-by-zero)', () => {
    expect(computeAttainment(1000, 0)).toBe(0);
  });

  it('clamps to 100 when expected exceeds target', () => {
    expect(computeAttainment(6_000_000, 4_500_000)).toBe(100);
  });

  it('clamps to 0 when expected is negative', () => {
    expect(computeAttainment(-100, 1000)).toBe(0);
  });
});

describe('yearsUntilRetirement', () => {
  it('returns targetAge - currentAge', () => {
    expect(yearsUntilRetirement(38, 62)).toBe(24);
  });

  it('returns 0 if already past target', () => {
    expect(yearsUntilRetirement(70, 60)).toBe(0);
  });

  it('returns 0 when ages are equal', () => {
    expect(yearsUntilRetirement(60, 60)).toBe(0);
  });
});

describe('aggregateProfiles', () => {
  const me: RetirementProfile = {
    name: '나', targetAge: 62, currentAge: 38,
    targetMonthly: 4_500_000, expectedMonthly: 3_120_000,
    pensions: [],
  };
  const spouse: RetirementProfile = {
    name: '배우자', targetAge: 60, currentAge: 36,
    targetMonthly: 3_500_000, expectedMonthly: 2_150_000,
    pensions: [],
  };

  it('sums targetMonthly across profiles', () => {
    const all = aggregateProfiles([me, spouse]);
    expect(all.targetMonthly).toBe(8_000_000);
  });

  it('sums expectedMonthly across profiles', () => {
    const all = aggregateProfiles([me, spouse]);
    expect(all.expectedMonthly).toBe(5_270_000);
  });

  it('concatenates pensions from all profiles', () => {
    const meP: RetirementProfile = { ...me, pensions: [{ type: 'A', category: 'public', title: 'a', monthlyAmount: 1, payPeriod: '', startYear: '' }] };
    const spP: RetirementProfile = { ...spouse, pensions: [{ type: 'B', category: 'public', title: 'b', monthlyAmount: 2, payPeriod: '', startYear: '' }] };
    const all = aggregateProfiles([meP, spP]);
    expect(all.pensions).toHaveLength(2);
  });

  it('names the aggregate "전체"', () => {
    expect(aggregateProfiles([me, spouse]).name).toBe('전체');
  });
});
