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
