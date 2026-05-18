import { describe, it, expect } from 'vitest';
import {
  formatKRW,
  totalOutstanding,
  repaymentProgress,
  loanProgressRatio,
  monthlyLoanPayment,
  remainingLoanBalance,
} from '@/lib/loans';

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
