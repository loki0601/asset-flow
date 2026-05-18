export function computeAttainment(expected: number, target: number): number {
  if (target <= 0) return 0;
  const pct = (expected / target) * 100;
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return Math.round(pct);
}

export function yearsUntilRetirement(currentAge: number, targetAge: number): number {
  return Math.max(0, targetAge - currentAge);
}

import type { RetirementProfile } from '@/lib/schema';

export function aggregateProfiles(profiles: RetirementProfile[]): RetirementProfile {
  const targetMonthly = profiles.reduce((s, p) => s + p.targetMonthly, 0);
  const expectedMonthly = profiles.reduce((s, p) => s + p.expectedMonthly, 0);
  return {
    name: '전체',
    targetAge: 0,
    currentAge: 0,
    targetMonthly,
    expectedMonthly,
    pensions: profiles.flatMap((p) => p.pensions),
  };
}
