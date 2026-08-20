import { describe, it, expect } from 'vitest';
import { computeAttainment, yearsUntilRetirement } from '@/lib/retirement';

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
