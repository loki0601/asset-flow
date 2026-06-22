import { describe, it, expect } from 'vitest';
import {
  formatKRW,
  formatPrice,
  totalOutstanding,
  repaymentProgress,
  loanProgressRatio,
  monthlyLoanPayment,
  remainingLoanBalance,
  currentLoanBalance,
  currentMonthlyPayment,
  applyRepayment,
} from '@/lib/loans';
import type { Loan } from '@/lib/schema';

describe('formatKRW', () => {
  it('formats numbers with Korean locale thousands separators', () => {
    expect(formatKRW(1234567)).toBe('1,234,567');
  });

  it('handles zero', () => {
    expect(formatKRW(0)).toBe('0');
  });

  it('handles negative numbers', () => {
    expect(formatKRW(-5000)).toBe('-5,000');
  });
});

describe('totalOutstanding', () => {
  it('returns borrowed minus repaid', () => {
    expect(totalOutstanding(520_000_000, 124_800_000)).toBe(395_200_000);
  });

  it('returns zero when fully repaid', () => {
    expect(totalOutstanding(100, 100)).toBe(0);
  });

  it('never goes negative even if repaid exceeds borrowed', () => {
    expect(totalOutstanding(100, 150)).toBe(0);
  });
});

describe('repaymentProgress', () => {
  it('returns percent (0-100) of repaid over borrowed', () => {
    expect(repaymentProgress(100, 25)).toBe(25);
  });

  it('returns 0 when nothing borrowed (avoid divide-by-zero)', () => {
    expect(repaymentProgress(0, 0)).toBe(0);
  });

  it('clamps to 100', () => {
    expect(repaymentProgress(100, 150)).toBe(100);
  });

  it('clamps to 0 when repaid is negative', () => {
    expect(repaymentProgress(100, -10)).toBe(0);
  });
});

describe('monthlyLoanPayment', () => {
  it('원리금균등상환: returns level amortized payment', () => {
    // 100,000,000 KRW @ 5% / 360 months ≈ 536,822 KRW/mo
    // (1+0.05/12)^360 = 4.4677… → P*r*(1+r)^n / ((1+r)^n - 1)
    const v = monthlyLoanPayment('원리금균등상환', 100_000_000, 5, 360);
    expect(v).toBeCloseTo(536_822, 0);
  });

  it('원금균등상환: returns first-month payment (principal share + first-month interest)', () => {
    // P/n + P*r  = 100,000,000/360 + 100,000,000*0.05/12
    // = 277,777.78 + 416,666.67 = 694,444.44
    const v = monthlyLoanPayment('원금균등상환', 100_000_000, 5, 360);
    expect(v).toBeCloseTo(694_444, 0);
  });

  it('만기일시상환: returns interest-only (P × r)', () => {
    // 100,000,000 × 0.05 / 12 = 416,666.67
    const v = monthlyLoanPayment('만기일시상환', 100_000_000, 5, 360);
    expect(v).toBeCloseTo(416_667, 0);
  });

  it('returns 0 when principal is 0', () => {
    expect(monthlyLoanPayment('원리금균등상환', 0, 5, 360)).toBe(0);
  });

  it('returns 0 when months is 0', () => {
    expect(monthlyLoanPayment('원리금균등상환', 100_000_000, 5, 0)).toBe(0);
  });

  it('handles 0% rate (원리금균등 collapses to principal / months)', () => {
    // No-interest case must not divide by zero.
    expect(monthlyLoanPayment('원리금균등상환', 12_000_000, 0, 12)).toBeCloseTo(1_000_000, 0);
    expect(monthlyLoanPayment('원금균등상환', 12_000_000, 0, 12)).toBeCloseTo(1_000_000, 0);
    expect(monthlyLoanPayment('만기일시상환', 12_000_000, 0, 12)).toBe(0);
  });
});

describe('remainingLoanBalance', () => {
  it('returns full principal before the first payment', () => {
    expect(remainingLoanBalance('원리금균등상환', 100_000_000, 5, 360, 0)).toBeCloseTo(100_000_000, 0);
  });

  it('returns 0 once monthsPaid reaches total', () => {
    expect(remainingLoanBalance('원리금균등상환', 100_000_000, 5, 360, 360)).toBe(0);
    expect(remainingLoanBalance('원금균등상환', 100_000_000, 5, 360, 360)).toBe(0);
  });

  it('clamps overpaid months to 0', () => {
    expect(remainingLoanBalance('원리금균등상환', 100_000_000, 5, 360, 500)).toBe(0);
  });

  it('원리금균등상환: amortised balance after k payments', () => {
    // M = 536,822.30; after 60 payments, balance ≈ 91,828,694
    // Computed via P*(1+r)^k - M*((1+r)^k - 1)/r
    const v = remainingLoanBalance('원리금균등상환', 100_000_000, 5, 360, 60);
    expect(v).toBeCloseTo(91_828_694, -2);
  });

  it('원금균등상환: P × (n−k)/n', () => {
    // 100M, 360mo, 60 paid → 100M × 300/360 = 83,333,333
    const v = remainingLoanBalance('원금균등상환', 100_000_000, 5, 360, 60);
    expect(v).toBeCloseTo(83_333_333, 0);
  });

  it('만기일시상환: full principal until maturity', () => {
    expect(remainingLoanBalance('만기일시상환', 100_000_000, 5, 360, 60)).toBe(100_000_000);
    expect(remainingLoanBalance('만기일시상환', 100_000_000, 5, 360, 360)).toBe(0);
  });

  it('handles 0% rate without divide-by-zero', () => {
    // 원리금균등 with r=0 → linear principal-only: P×(n-k)/n
    expect(remainingLoanBalance('원리금균등상환', 12_000_000, 0, 12, 4)).toBeCloseTo(8_000_000, 0);
  });
});

describe('currentLoanBalance', () => {
  const baseLoan = (overrides: Partial<Loan>): Loan => ({
    id: 'l',
    userId: 'u',
    memberId: 'm',
    name: '',
    bank: '',
    totalAmount: 100_000_000,
    remainingAmount: 0, // ignored when contract terms present
    method: '원리금균등상환',
    rate: 5,
    startDate: '2025-04-25',
    maturityDate: '2055-04-25', // 30 years
    paymentDay: 25,
    monthlyEst: 0,
    status: '상환 중',
    createdAt: '',
    ...overrides,
  });

  it('returns full principal on the start date', () => {
    const v = currentLoanBalance(baseLoan({}), new Date('2025-04-25T12:00:00Z'));
    expect(v).toBeCloseTo(100_000_000, 0);
  });

  it('원리금균등: shrinks year by year', () => {
    const oneYearLater = currentLoanBalance(
      baseLoan({}),
      new Date('2026-04-25T12:00:00Z'),
    );
    // After 12 months: balance should drop by ~$1.4M-ish on a 100M / 30y / 5% loan
    expect(oneYearLater).toBeLessThan(100_000_000);
    expect(oneYearLater).toBeGreaterThan(98_000_000);
  });

  it('만기일시상환: stays at principal until maturity', () => {
    const mid = currentLoanBalance(
      baseLoan({ method: '만기일시상환', maturityDate: '2027-04-25' }),
      new Date('2026-05-18T12:00:00Z'),
    );
    expect(mid).toBe(100_000_000);
  });

  it('returns 0 past maturity', () => {
    const v = currentLoanBalance(baseLoan({}), new Date('2060-01-01T12:00:00Z'));
    expect(v).toBe(0);
  });

  it('subtracts the manual repaid amount from the schedule balance', () => {
    const bullet = baseLoan({ method: '만기일시상환', maturityDate: '2027-04-25', repaid: 30_000_000 });
    expect(currentLoanBalance(bullet, new Date('2026-05-18T12:00:00Z'))).toBe(70_000_000);
  });
});

describe('applyRepayment', () => {
  const bullet = (overrides: Partial<Loan> = {}): Loan => ({
    id: 'l',
    userId: 'u',
    memberId: 'm',
    name: '',
    bank: '',
    totalAmount: 100_000_000,
    remainingAmount: 100_000_000,
    method: '만기일시상환',
    rate: 4,
    startDate: '2025-04-25',
    maturityDate: '2027-04-25',
    paymentDay: 25,
    monthlyEst: 0,
    status: '상환 중',
    createdAt: '',
    ...overrides,
  });
  const now = new Date('2026-05-18T12:00:00Z');

  it('records a partial repayment and lowers the remaining balance', () => {
    const patch = applyRepayment(bullet(), 30_000_000, now);
    expect(patch.repaid).toBe(30_000_000);
    expect(patch.remainingAmount).toBe(70_000_000);
    expect(patch.status).toBe('상환 중');
  });


  it('accumulates onto a prior repaid amount', () => {
    const patch = applyRepayment(bullet({ repaid: 30_000_000 }), 20_000_000, now);
    expect(patch.repaid).toBe(50_000_000);
    expect(patch.remainingAmount).toBe(50_000_000);
  });

  it('clamps an overpayment to what is owed and marks the loan 완료', () => {
    const patch = applyRepayment(bullet(), 200_000_000, now);
    expect(patch.repaid).toBe(100_000_000);
    expect(patch.remainingAmount).toBe(0);
    expect(patch.status).toBe('완료');
  });

  it('ignores a non-positive amount', () => {
    expect(applyRepayment(bullet({ repaid: 10_000_000 }), 0, now).repaid).toBe(10_000_000);
    expect(applyRepayment(bullet({ repaid: 10_000_000 }), -5, now).repaid).toBe(10_000_000);
  });
});

describe('currentMonthlyPayment', () => {
  const loan = (overrides: Partial<Loan> = {}): Loan => ({
    id: 'l',
    userId: 'u',
    memberId: 'm',
    name: '',
    bank: '',
    totalAmount: 40_000_000,
    remainingAmount: 40_000_000,
    method: '원리금균등상환',
    rate: 3.5,
    startDate: '2025-12-01',
    maturityDate: '2055-12-01', // 360 months
    paymentDay: 20,
    monthlyEst: 0,
    status: '상환 중',
    createdAt: '',
    ...overrides,
  });
  const now = new Date('2026-06-01T12:00:00Z');

  it('원리금균등: untouched loan keeps its level payment', () => {
    // 40M / 3.5% / 360mo level payment ≈ 179,618; recasting the current
    // balance over the remaining term reproduces it (no prepayment).
    expect(Math.round(currentMonthlyPayment(loan(), now))).toBe(179_618);
  });

  it('원리금균등: drops after a prepayment (recast on the lower balance)', () => {
    const before = currentMonthlyPayment(loan(), now);
    const after = currentMonthlyPayment(loan({ repaid: 20_000_000 }), now);
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0);
  });

  it('만기일시: interest only on the current balance', () => {
    const bullet = loan({ method: '만기일시상환', repaid: 30_000_000 });
    // balance 10M, 3.5% → 10M × 0.035/12
    expect(Math.round(currentMonthlyPayment(bullet, now))).toBe(Math.round(10_000_000 * (0.035 / 12)));
  });

  it('returns 0 once fully repaid', () => {
    expect(currentMonthlyPayment(loan({ repaid: 40_000_000 }), now)).toBe(0);
  });
});

describe('loanProgressRatio', () => {
  it('returns percent based on (total - remaining) / total', () => {
    expect(loanProgressRatio(420_000_000, 315_000_000)).toBeCloseTo(25, 1);
  });

  it('returns 0 when total is 0', () => {
    expect(loanProgressRatio(0, 0)).toBe(0);
  });

  it('returns 100 when fully paid', () => {
    expect(loanProgressRatio(100, 0)).toBe(100);
  });
});

describe('formatPrice', () => {
  it('USD: prefixes with $ and keeps two decimals', () => {
    expect(formatPrice(138.55, 'USD')).toBe('$138.55');
    expect(formatPrice(1234.5, 'USD')).toBe('$1,234.50');
    expect(formatPrice(0, 'USD')).toBe('$0.00');
  });

  it('USD: negative values get a leading minus before the $', () => {
    expect(formatPrice(-12.5, 'USD')).toBe('-$12.50');
  });

  it('KRW: no symbol — matches the existing formatKRW output', () => {
    expect(formatPrice(1234567, 'KRW')).toBe('1,234,567');
    expect(formatPrice(70_000.4, 'KRW')).toBe('70,000');
    expect(formatPrice(0, 'KRW')).toBe('0');
  });
});
