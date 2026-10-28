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

const isValidAge = (age: number) => Number.isFinite(age) && age >= 1 && age <= 120;

export function validateRetirementAges(input: {
  currentAge: number;
  targetAge: number;
  pensions: Array<{ label: string; enabled: boolean; startAge: number }>;
}): string | null {
  if (!isValidAge(input.currentAge)) return '현재 나이는 1~120세 사이로 입력하세요.';
  if (!isValidAge(input.targetAge)) return '은퇴 목표 나이는 1~120세 사이로 입력하세요.';
  const bad = input.pensions.find((p) => p.enabled && !isValidAge(p.startAge));
  return bad ? `${bad.label} 수령 시작 나이는 1~120세 사이로 입력하세요.` : null;
}
