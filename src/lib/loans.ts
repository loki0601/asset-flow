export function formatKRW(value: number): string {
  // KRW has no sub-won unit in everyday use; even gold (₩/g) is shown
  // as integer. Round to remove the fractional part the data source may
  // include.
  return new Intl.NumberFormat('ko-KR').format(Math.round(value));
}

export function totalOutstanding(borrowed: number, repaid: number): number {
  return Math.max(0, borrowed - repaid);
}

export function repaymentProgress(borrowed: number, repaid: number): number {
  if (borrowed <= 0) return 0;
  const pct = (repaid / borrowed) * 100;
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return pct;
}

export function loanProgressRatio(totalAmount: number, remainingAmount: number): number {
  if (totalAmount <= 0) return 0;
  const repaid = totalAmount - remainingAmount;
  return repaymentProgress(totalAmount, repaid);
}

import type { LoanMethod } from '@/lib/schema';

/**
 * Estimated monthly payment by repayment method:
 *
 *   원리금균등상환 (amortized, level payment)
 *     M = P · r · (1+r)^n / ((1+r)^n − 1)
 *
 *   원금균등상환 (equal principal)
 *     first-month installment = P / n + P · r  (interest portion shrinks
 *     each month; we report the first month — that's the user-visible
 *     "예상 납부액" on a fresh contract).
 *
 *   만기일시상환 (interest-only until maturity)
 *     M = P · r
 *
 * r = annualRatePct / 100 / 12, n = totalMonths. Returns 0 when principal
 * or months are non-positive. Handles 0% rate without divide-by-zero.
 */
export function monthlyLoanPayment(
  method: LoanMethod,
  principal: number,
  annualRatePct: number,
  totalMonths: number,
): number {
  if (principal <= 0 || totalMonths <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (method === '만기일시상환') return principal * r;
  if (r === 0) return principal / totalMonths;
  if (method === '원리금균등상환') {
    const pow = Math.pow(1 + r, totalMonths);
    return (principal * r * pow) / (pow - 1);
  }
  // 원금균등상환 — first month payment
  return principal / totalMonths + principal * r;
}

/**
 * Remaining principal after `monthsPaid` regularly-scheduled payments. Lets
 * the loan form derive 남은 금액 from totalAmount + startDate + 만기(년) +
 * 상환방식 + 금리 — same numbers we already collect.
 *
 *   원리금균등상환: B_k = P · (1+r)^k − M · ((1+r)^k − 1)/r
 *   원금균등상환:  B_k = P · (n − k)/n
 *   만기일시상환: B_k = P  (until k == n)
 *
 * Edge cases:
 *   - monthsPaid ≤ 0 → full principal
 *   - monthsPaid ≥ totalMonths → 0
 *   - r == 0 → linear principal-only decay
 */
export function remainingLoanBalance(
  method: LoanMethod,
  principal: number,
  annualRatePct: number,
  totalMonths: number,
  monthsPaid: number,
): number {
  if (principal <= 0 || totalMonths <= 0) return 0;
  if (monthsPaid <= 0) return principal;
  if (monthsPaid >= totalMonths) return 0;
  const r = annualRatePct / 100 / 12;
  if (method === '만기일시상환') return principal;
  if (r === 0) return (principal * (totalMonths - monthsPaid)) / totalMonths;
  if (method === '원리금균등상환') {
    const M = monthlyLoanPayment(method, principal, annualRatePct, totalMonths);
    const pow = Math.pow(1 + r, monthsPaid);
    const balance = principal * pow - M * ((pow - 1) / r);
    return Math.max(0, balance);
  }
  // 원금균등상환
  return (principal * (totalMonths - monthsPaid)) / totalMonths;
}

import type { Loan } from '@/lib/schema';

/**
 * Live current-balance for a stored loan — derived from its contract terms
 * + the months elapsed since startDate. Replaces the static
 * `loan.remainingAmount` snapshot at display time so 원리금균등/원금균등
 * loans naturally tick down month by month as time passes. Stays at the
 * principal for 만기일시상환 until maturity.
 *
 * Returns 0 if the loan is past maturity or the contract terms are unset.
 */
export function currentLoanBalance(loan: Loan, now: Date = new Date()): number {
  if (!loan.startDate || !loan.maturityDate) return loan.remainingAmount;
  const start = new Date(loan.startDate + 'T00:00:00Z');
  const maturity = new Date(loan.maturityDate + 'T00:00:00Z');
  if (Number.isNaN(start.getTime()) || Number.isNaN(maturity.getTime())) {
    return loan.remainingAmount;
  }
  // Total months derived from start → maturity (rounded).
  const totalMonths = Math.max(
    1,
    Math.round(
      (maturity.getUTCFullYear() - start.getUTCFullYear()) * 12 +
        (maturity.getUTCMonth() - start.getUTCMonth()),
    ),
  );
  // Months elapsed: whole months between start and `now`, clamped.
  const monthsPaid = Math.max(
    0,
    Math.round(
      (now.getUTCFullYear() - start.getUTCFullYear()) * 12 +
        (now.getUTCMonth() - start.getUTCMonth()) -
        (now.getUTCDate() < start.getUTCDate() ? 1 : 0),
    ),
  );
  return remainingLoanBalance(
    loan.method,
    loan.totalAmount,
    loan.rate,
    totalMonths,
    monthsPaid,
  );
}
