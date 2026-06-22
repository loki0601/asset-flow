export function formatKRW(value: number): string {
  // KRW has no sub-won unit in everyday use; even gold (₩/g) is shown
  // as integer. Round to remove the fractional part the data source may
  // include.
  return new Intl.NumberFormat('ko-KR').format(Math.round(value));
}

export type PriceCurrency = 'KRW' | 'USD';

/**
 * Render a price with its native currency marker. USD adds a `$` prefix
 * and keeps two decimal places (sub-dollar precision is real). KRW
 * stays as the integer won with thousand separators — no symbol because
 * the entire app is Korean-default and the ₩ is implicit context.
 */
export function formatPrice(value: number, currency: PriceCurrency): string {
  if (currency === 'USD') {
    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value);
    return `${sign}$${new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(abs)}`;
  }
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

import type { Loan, LoanStatus } from '@/lib/schema';

/**
 * Live current-balance for a stored loan — derived from its contract terms
 * + the months elapsed since startDate. Replaces the static
 * `loan.remainingAmount` snapshot at display time so 원리금균등/원금균등
 * loans naturally tick down month by month as time passes. Stays at the
 * principal for 만기일시상환 until maturity.
 *
 * Returns 0 if the loan is past maturity or the contract terms are unset.
 */
/** Contract length and elapsed whole months from startDate → now, or null when
 *  the loan's dates are missing/invalid. Shared by balance + payment recompute. */
function loanTermMonths(
  loan: Loan,
  now: Date,
): { totalMonths: number; monthsPaid: number } | null {
  if (!loan.startDate || !loan.maturityDate) return null;
  const start = new Date(loan.startDate + 'T00:00:00Z');
  const maturity = new Date(loan.maturityDate + 'T00:00:00Z');
  if (Number.isNaN(start.getTime()) || Number.isNaN(maturity.getTime())) return null;
  const totalMonths = Math.max(
    1,
    Math.round(
      (maturity.getUTCFullYear() - start.getUTCFullYear()) * 12 +
        (maturity.getUTCMonth() - start.getUTCMonth()),
    ),
  );
  const monthsPaid = Math.max(
    0,
    Math.round(
      (now.getUTCFullYear() - start.getUTCFullYear()) * 12 +
        (now.getUTCMonth() - start.getUTCMonth()) -
        (now.getUTCDate() < start.getUTCDate() ? 1 : 0),
    ),
  );
  return { totalMonths, monthsPaid };
}

export function currentLoanBalance(loan: Loan, now: Date = new Date()): number {
  const repaid = loan.repaid ?? 0;
  const term = loanTermMonths(loan, now);
  if (!term) return Math.max(0, loan.remainingAmount - repaid);
  const scheduleBalance = remainingLoanBalance(
    loan.method,
    loan.totalAmount,
    loan.rate,
    term.totalMonths,
    term.monthsPaid,
  );
  return Math.max(0, scheduleBalance - repaid);
}

/**
 * Live monthly payment for the loan as it stands NOW — recalculated on the
 * current balance over the months remaining to maturity. For 만기일시상환 that's
 * interest-only (balance × monthly rate), so it drops as principal is repaid;
 * for amortising loans, recasting the current balance over the remaining term
 * yields the same level payment when untouched, but a lower one after a
 * prepayment. Display this instead of the stored `monthlyEst` snapshot so the
 * figure always tracks the real balance.
 */
export function currentMonthlyPayment(loan: Loan, now: Date = new Date()): number {
  const balance = currentLoanBalance(loan, now);
  if (balance <= 0) return 0;
  const term = loanTermMonths(loan, now);
  const remainingMonths = term ? Math.max(1, term.totalMonths - term.monthsPaid) : 1;
  return monthlyLoanPayment(loan.method, balance, loan.rate, remainingMonths);
}

/** Patch to persist after the user taps 상환 and enters an amount. The payment is
 *  clamped to what's currently owed; the loan flips to 완료 when cleared. The
 *  monthly figure isn't stored — it's derived live via currentMonthlyPayment. */
export function applyRepayment(
  loan: Loan,
  amount: number,
  now: Date = new Date(),
): { repaid: number; remainingAmount: number; status: LoanStatus } {
  const owed = currentLoanBalance(loan, now);
  const pay = Math.max(0, Math.min(amount, owed));
  const repaid = (loan.repaid ?? 0) + pay;
  const remainingAmount = Math.round(currentLoanBalance({ ...loan, repaid }, now));
  const status: LoanStatus =
    remainingAmount <= 0 ? '완료' : loan.status === '완료' ? '상환 중' : loan.status;
  return { repaid, remainingAmount, status };
}
