import { describe, it, expect } from 'vitest';
import {
  futureValue,
  annuityMonthly,
  personalPensionTaxRate,
  applyAnnuityTax,
  inflatedTarget,
  classifyPensionAccount,
} from '@/lib/retirementPlanning';
import type { Account } from '@/lib/schema';

describe('futureValue', () => {
  it('compounds principal at annual rate over years', () => {
    // 100M @ 4% for 10y = 100M × 1.04^10 ≈ 148,024,428
    expect(futureValue(100_000_000, 0.04, 10)).toBeCloseTo(148_024_428, -1);
  });
  it('returns principal when years is 0', () => {
    expect(futureValue(100_000_000, 0.04, 0)).toBe(100_000_000);
  });
  it('returns 0 for non-positive principal', () => {
    expect(futureValue(0, 0.04, 10)).toBe(0);
  });
});

describe('annuityMonthly', () => {
  it('returns level monthly payment from PMT formula', () => {
    // PMT for 148M present value, monthly rate, 10y term
    // r/12 = 0.04/12, n = 120, PMT = P × (r/12) / (1 − (1+r/12)^(-120))
    const v = annuityMonthly(148_024_428, 0.04, 10);
    // P × (0.04/12) / (1 − (1+0.04/12)^(−120)) ≈ 1,498,675
    expect(v).toBeCloseTo(1_498_675, -2);
  });
  it('handles 0% rate (simple division)', () => {
    expect(annuityMonthly(120_000_000, 0, 10)).toBeCloseTo(1_000_000, 0);
  });
  it('returns 0 for non-positive principal', () => {
    expect(annuityMonthly(0, 0.04, 10)).toBe(0);
  });
  it('returns 0 for non-positive years', () => {
    expect(annuityMonthly(100_000_000, 0.04, 0)).toBe(0);
  });
});

describe('personalPensionTaxRate', () => {
  it('5.5% under 70', () => {
    expect(personalPensionTaxRate(55)).toBeCloseTo(0.055, 4);
    expect(personalPensionTaxRate(69)).toBeCloseTo(0.055, 4);
  });
  it('4.4% from 70 to 79', () => {
    expect(personalPensionTaxRate(70)).toBeCloseTo(0.044, 4);
    expect(personalPensionTaxRate(79)).toBeCloseTo(0.044, 4);
  });
  it('3.3% from 80+', () => {
    expect(personalPensionTaxRate(80)).toBeCloseTo(0.033, 4);
    expect(personalPensionTaxRate(95)).toBeCloseTo(0.033, 4);
  });
});

describe('applyAnnuityTax', () => {
  it('subtracts the type-specific average rate', () => {
    // public: 5%
    expect(applyAnnuityTax(1_000_000, 'public', 70)).toBeCloseTo(950_000, 0);
    // corporate: 3.5%
    expect(applyAnnuityTax(1_000_000, 'corporate', 60)).toBeCloseTo(965_000, 0);
    // personal: age-banded
    expect(applyAnnuityTax(1_000_000, 'personal', 60)).toBeCloseTo(945_000, 0);
    expect(applyAnnuityTax(1_000_000, 'personal', 75)).toBeCloseTo(956_000, 0);
    expect(applyAnnuityTax(1_000_000, 'personal', 85)).toBeCloseTo(967_000, 0);
  });
});

describe('inflatedTarget', () => {
  it('compounds today\'s target at the inflation rate', () => {
    // 4.5M × 1.025^20 ≈ 7,373,774
    expect(inflatedTarget(4_500_000, 0.025, 20)).toBeCloseTo(7_373_774, -2);
  });
  it('returns original when years is 0', () => {
    expect(inflatedTarget(4_500_000, 0.025, 0)).toBe(4_500_000);
  });
});

describe('classifyPensionAccount', () => {
  const baseAcc = (institution: string, name: string): Account => ({
    id: 'a',
    userId: 'u',
    memberId: 'm',
    institution,
    name,
    createdAt: '',
  });
  it('corporate when account name signals DC/DB/퇴직', () => {
    expect(classifyPensionAccount(baseAcc('삼성증권 IRP', '퇴직연금(DC)'))).toBe('corporate');
    expect(classifyPensionAccount(baseAcc('KB증권 IRP', 'DC'))).toBe('corporate');
    expect(classifyPensionAccount(baseAcc('미래에셋증권 IRP', 'DB'))).toBe('corporate');
  });
  it('personal for IRP-named accounts (institution kind 연금기관)', () => {
    expect(classifyPensionAccount(baseAcc('삼성증권 IRP', 'IRP'))).toBe('personal');
    expect(classifyPensionAccount(baseAcc('한화투자증권', 'IRP'))).toBe('personal');
  });
  it('personal for 연금저축 accounts', () => {
    expect(classifyPensionAccount(baseAcc('삼성증권', '연금저축'))).toBe('personal');
    expect(classifyPensionAccount(baseAcc('한화투자증권', '연금저축'))).toBe('personal');
  });
  it('null for non-pension accounts', () => {
    expect(classifyPensionAccount(baseAcc('KB증권', '국내주식'))).toBeNull();
    expect(classifyPensionAccount(baseAcc('업비트', '메인'))).toBeNull();
  });
});
