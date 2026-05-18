/**
 * Retirement planning math.
 *
 * Used by the 노후 page to project monthly post-tax income from three
 * pension types based on current holdings + user-entered settings (start
 * age, payout years, annual yield assumption, inflation toggle).
 *
 *   국민연금 (public): user-entered monthly amount, lifetime annuity,
 *     fixed 5% effective tax.
 *   퇴직연금 (corporate, DC/DB only): principal = holdings sum in DC/DB
 *     accounts, compounded at user yield, paid out as an annuity for the
 *     chosen payout period. Fixed 3.5% effective tax.
 *   개인연금 (personal: 연금저축 + IRP): principal = holdings sum in
 *     personal-pension accounts, same compounding model. Tax by age band
 *     (5.5% < 70, 4.4% 70–79, 3.3% 80+).
 *
 * Account classification mirrors the Korean tax-law treatment: IRP is
 * legally 개인형 퇴직연금, but for the user it behaves like 개인연금 (self-
 * directed, voluntary contributions) — so we bucket it with personal here,
 * matching how the user thinks about their accounts.
 */

import type {
  Account,
  Holding,
  MarketAsset,
  PensionCategory,
  RetirementTarget,
  Transaction,
} from '@/lib/schema';

const PUBLIC_TAX = 0.05;
const CORPORATE_TAX = 0.035;

/** Future value of a one-shot principal compounded annually. */
export function futureValue(principal: number, annualRate: number, years: number): number {
  if (principal <= 0) return 0;
  if (years <= 0) return principal;
  return principal * Math.pow(1 + annualRate, years);
}

/**
 * Level monthly payment from a present value using the PMT formula:
 *   PMT = P × (r/12) / (1 − (1 + r/12)^(−12n))
 * with the 0% rate degenerating to P / (12n) so we never divide by zero.
 */
export function annuityMonthly(
  principal: number,
  annualRate: number,
  years: number,
): number {
  if (principal <= 0 || years <= 0) return 0;
  if (annualRate === 0) return principal / (12 * years);
  const r = annualRate / 12;
  const n = 12 * years;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/** Korean 연금소득세 분리과세 — age-banded average rate (지방세 포함). */
export function personalPensionTaxRate(age: number): number {
  if (age < 70) return 0.055;
  if (age < 80) return 0.044;
  return 0.033;
}

export function applyAnnuityTax(
  grossMonthly: number,
  category: PensionCategory,
  ageAtPayment: number,
): number {
  let rate: number;
  switch (category) {
    case 'public':
      rate = PUBLIC_TAX;
      break;
    case 'corporate':
      rate = CORPORATE_TAX;
      break;
    case 'personal':
      rate = personalPensionTaxRate(ageAtPayment);
      break;
  }
  return grossMonthly * (1 - rate);
}

/** Compound a today's-purchasing-power target by inflation to a future
 *  nominal KRW value. With 2.5%/yr the typical 20-year horizon roughly
 *  doubles the target — matches the user's "오늘 450만원 = 미래 천만원"
 *  intuition. */
export function inflatedTarget(
  todayMonthly: number,
  inflationRate: number,
  yearsAhead: number,
): number {
  if (yearsAhead <= 0) return todayMonthly;
  return todayMonthly * Math.pow(1 + inflationRate, yearsAhead);
}

/**
 * Map a pension-bearing account to the pension category it counts toward,
 * or null if it isn't a pension account at all.
 *
 * Heuristics (current account naming):
 *   - account.name contains "DC" / "DB" / "퇴직" → corporate
 *   - account.name === "IRP" or account.name contains "연금저축" → personal
 *   - institution kind === '연금기관' (default) → personal as fallback
 *
 * Designed to work on the snapshot data without requiring a schema
 * migration. A future `Account.pensionType` field would replace this.
 */
export function classifyPensionAccount(account: Account): PensionCategory | null {
  const name = (account.name ?? '').toLowerCase();
  const inst = (account.institution ?? '').toLowerCase();
  if (/dc|db|퇴직/.test(name)) return 'corporate';
  if (name.includes('연금저축')) return 'personal';
  if (name.includes('irp') || inst.includes('irp')) return 'personal';
  return null;
}

/**
 * Sum the current KRW value of holdings sitting in accounts that classify
 * as the given pension category for the given member. Uses each asset's
 * `currentPrice` (KRW for KRX, USD for NASDAQ — caller passes a fx multiplier
 * for USD assets). Auto-reactive to user trades because holdings is read
 * fresh from the repo.
 */
export function pensionPrincipalForMember(args: {
  memberId: string;
  category: PensionCategory;
  accounts: Account[];
  holdings: Holding[];
  marketAsset: (symbol: string) => MarketAsset | undefined;
  fxUsdKrw: number;
}): number {
  const { memberId, category, accounts, holdings, marketAsset, fxUsdKrw } = args;
  const matchedAccountIds = new Set(
    accounts
      .filter((a) => a.memberId === memberId && classifyPensionAccount(a) === category)
      .map((a) => a.id),
  );
  if (matchedAccountIds.size === 0) return 0;
  let total = 0;
  for (const h of holdings) {
    if (!matchedAccountIds.has(h.accountId)) continue;
    const asset = marketAsset(h.symbol);
    if (!asset) continue;
    const px = asset.currentPrice || h.avgPrice;
    const fx = asset.currency === 'USD' ? fxUsdKrw : 1;
    total += h.quantity * px * fx;
  }
  return total;
}

/** Compiled pension projection for a single member, ready for the page. */
export interface PensionStream {
  category: PensionCategory;
  /** False when the user hasn't opted into this pension type — the page
   *  should hide its card entirely and exclude it from charts. */
  enabled: boolean;
  principalNow: number;
  /** Future-valued principal at receipt start. */
  principalAtStart: number;
  /** Gross monthly payment at start (PMT). Lifetime for public. */
  monthlyGross: number;
  /** Net-of-tax monthly at start age. For personal we apply the age band
   *  at startAge; tax may grow slightly cheaper as the member ages further. */
  monthlyNet: number;
  startAge: number;
  /** Last age that receives a payment. For public this is ∞ → we cap at 120
   *  internally; UI typically draws up to ~90. */
  endAge: number;
}

export interface ProjectionInputs {
  target: RetirementTarget;
  principalCorporate: number;
  principalPersonal: number;
}

export interface Projection {
  public: PensionStream;
  corporate: PensionStream;
  personal: PensionStream;
  /** Target month derived from RetirementTarget.targetMonthly, inflated
   *  (if enabled) to the inflation-adjusted figure at the earliest receipt
   *  start so the UI has one number to compare against pension streams. */
  inflatedMonthlyTargetAtStart: number;
  earliestStartAge: number;
}

export function buildProjection(inputs: ProjectionInputs): Projection {
  const t = inputs.target;
  const corpStartAge = t.corporateStartAge ?? 55;
  const corpYears = t.corporateYears ?? 10;
  const corpRate = t.corporateAnnualRate ?? 0.04;
  const persStartAge = t.personalStartAge ?? 55;
  const persYears = t.personalYears ?? 20;
  const persRate = t.personalAnnualRate ?? 0.04;
  const publicStartAge = t.publicStartAge ?? 65;
  const publicMonthly = t.publicMonthly ?? 0;
  const inflationOn = t.inflationAdjustEnabled ?? true;
  const inflationRate = inflationOn ? t.inflationRate ?? 0.025 : 0;

  // Years to compound principal between today and the receipt-start age.
  const yearsToCorp = Math.max(0, corpStartAge - t.currentAge);
  const yearsToPers = Math.max(0, persStartAge - t.currentAge);

  const corpFv = futureValue(inputs.principalCorporate, corpRate, yearsToCorp);
  const persFv = futureValue(inputs.principalPersonal, persRate, yearsToPers);

  const corpMonthlyGross = annuityMonthly(corpFv, corpRate, corpYears);
  const persMonthlyGross = annuityMonthly(persFv, persRate, persYears);

  const corporate: PensionStream = {
    category: 'corporate',
    enabled: t.corporateEnabled === true,
    principalNow: inputs.principalCorporate,
    principalAtStart: corpFv,
    monthlyGross: corpMonthlyGross,
    monthlyNet: applyAnnuityTax(corpMonthlyGross, 'corporate', corpStartAge),
    startAge: corpStartAge,
    endAge: corpStartAge + corpYears - 1,
  };
  const personal: PensionStream = {
    category: 'personal',
    enabled: t.personalEnabled === true,
    principalNow: inputs.principalPersonal,
    principalAtStart: persFv,
    monthlyGross: persMonthlyGross,
    monthlyNet: applyAnnuityTax(persMonthlyGross, 'personal', persStartAge),
    startAge: persStartAge,
    endAge: persStartAge + persYears - 1,
  };
  const publicStream: PensionStream = {
    category: 'public',
    enabled: t.publicEnabled === true,
    principalNow: 0,
    principalAtStart: 0,
    monthlyGross: publicMonthly,
    monthlyNet: applyAnnuityTax(publicMonthly, 'public', publicStartAge),
    startAge: publicStartAge,
    endAge: 120, // lifetime
  };

  // For the inflation reference age use the earliest *enabled* start; if
  // nothing is enabled fall back to the user's targetAge so the goal line
  // still gets a meaningful inflated value.
  const enabledStarts = [
    publicStream.enabled ? publicStartAge : null,
    corporate.enabled ? corpStartAge : null,
    personal.enabled ? persStartAge : null,
  ].filter((v): v is number => v !== null);
  const earliestStart = enabledStarts.length > 0 ? Math.min(...enabledStarts) : t.targetAge;
  const yearsToEarliest = Math.max(0, earliestStart - t.currentAge);
  const inflatedMonthlyTargetAtStart = inflatedTarget(
    t.targetMonthly,
    inflationRate,
    yearsToEarliest,
  );

  return {
    public: publicStream,
    corporate,
    personal,
    inflatedMonthlyTargetAtStart,
    earliestStartAge: earliestStart,
  };
}

/** Returns the net monthly amount the user receives from each pension at a
 *  given age. Personal uses age-banded tax so its net grows ever so slightly
 *  past 70 and 80. */
export function monthlyAtAge(
  proj: Projection,
  age: number,
): { public: number; corporate: number; personal: number; total: number } {
  const publicNet =
    proj.public.enabled && age >= proj.public.startAge && age <= proj.public.endAge
      ? proj.public.monthlyNet
      : 0;
  const corpNet =
    proj.corporate.enabled && age >= proj.corporate.startAge && age <= proj.corporate.endAge
      ? proj.corporate.monthlyNet
      : 0;
  // Personal: re-apply age band so a 70-something sees the lower bracket.
  const persNet =
    proj.personal.enabled && age >= proj.personal.startAge && age <= proj.personal.endAge
      ? applyAnnuityTax(proj.personal.monthlyGross, 'personal', age)
      : 0;
  return {
    public: publicNet,
    corporate: corpNet,
    personal: persNet,
    total: publicNet + corpNet + persNet,
  };
}

// ─── Progress timeline (A-layout + B-metric chart) ─────────────────────

/** One contribution event's permanent contribution to the member's monthly
 *  net income at retirement. */
export interface ProgressEvent {
  /** YYYY-MM-DD of the contribution. */
  date: string;
  category: 'corporate' | 'personal';
  /** Gross KRW deposited (qty × price × FX at the time). */
  contribKrw: number;
  /** Eventual monthly net payment at the member's receipt start age from
   *  this single deposit, fixed regardless of when you check (compounding
   *  + tax already baked in). */
  monthlyAtRetirement: number;
}

export interface ProgressTimeline {
  events: ProgressEvent[];
  /** Per-category settings used by the chart's sample function. */
  corpRate: number;
  corpPayoutYears: number;
  corpStartAge: number;
  persRate: number;
  persPayoutYears: number;
  persStartAge: number;
  /** Public pension net monthly (constant, manual). 0 when disabled. */
  publicMonthlyNet: number;
  publicStartAge: number;
  publicEnabled: boolean;
  /** Today's date as a fractional calendar year (e.g. 2026.37). */
  todayFraction: number;
  /** Inflation-adjusted goal at the earliest enabled receipt age. */
  targetMonthlyAtRetirement: number;
  /** Calendar year corresponding to the earliest enabled receipt age. */
  retirementYear: number;
  /** Calendar year of today. */
  todayYear: number;
  /** Calendar year of the earliest contribution event (for X-axis start). */
  earliestYear: number;
  /** Calendar year birth year derived from currentAge — used for receipt-age
   *  → calendar-year markers on the X axis. */
  birthYear: number;
}

export function yearFraction(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y) return 0;
  const start = Date.UTC(y, 0, 0);
  const ts = Date.UTC(y, (m || 1) - 1, d || 1);
  const dayOfYear = (ts - start) / 86_400_000;
  return y + dayOfYear / 365.25;
}

/** Continuous-time principal under compound growth — sums every event up to
 *  T with its own (1+rate)^(T-eventTime) factor. */
export function principalAtTime(
  events: { date: string; contribKrw: number }[],
  rate: number,
  T: number,
): number {
  let total = 0;
  for (const e of events) {
    const t = yearFraction(e.date);
    if (t > T) continue;
    total += e.contribKrw * Math.pow(1 + rate, T - t);
  }
  return total;
}

/** Monthly net the user could receive at retirement given the principal
 *  accumulated by time T. Tax band is applied at the receipt start age. */
export function monthlyFromPrincipal(
  principal: number,
  rate: number,
  payoutYears: number,
  startAge: number,
  category: PensionCategory,
): number {
  if (principal <= 0) return 0;
  const gross = annuityMonthly(principal, rate, payoutYears);
  return applyAnnuityTax(gross, category, startAge);
}

function txDate(t: Transaction): string {
  return (t.occurredAt ?? '').slice(0, 10);
}

/**
 * Build the per-event monthly-at-retirement series for a member.
 *
 * Math: for each `buy` transaction in a pension account, compute its
 * eventual contribution to the member's monthly net payment at retirement:
 *
 *   fv  = contribKrw × (1 + r)^yearsToReceipt
 *   pmt = fv × (r/12) / (1 − (1+r/12)^(−12·payoutYears))
 *   net = pmt × (1 − categoryTaxRate)
 *
 * yearsToReceipt is measured from the transaction date to the receipt-start
 * year (currentYear + (startAge − currentAge)). Since the chart's user
 * doesn't add/remove from already-deposited money, each event's monthly
 * contribution is FIXED for all time — they only stack as new events fire.
 *
 * Only `buy` transactions count. Sells are deliberately ignored here
 * because pension accounts almost never have them in practice, and a
 * negative monthly contribution would be visually confusing.
 */
export function buildProgressTimeline(args: {
  target: RetirementTarget;
  accounts: Account[];
  transactions: Transaction[];
  marketAsset: (symbol: string) => MarketAsset | undefined;
  fxUsdKrw: number;
}): ProgressTimeline {
  const { target, accounts, transactions, marketAsset, fxUsdKrw } = args;
  const todayDate = new Date();
  const todayYear = todayDate.getFullYear();

  const corpStartAge = target.corporateStartAge ?? 55;
  const persStartAge = target.personalStartAge ?? 55;
  const corpYears = target.corporateYears ?? 10;
  const persYears = target.personalYears ?? 20;
  const corpRate = target.corporateAnnualRate ?? 0.04;
  const persRate = target.personalAnnualRate ?? 0.04;

  // Year the user is "now" at corpStartAge / persStartAge.
  const corpRetireYear = todayYear + Math.max(0, corpStartAge - target.currentAge);
  const persRetireYear = todayYear + Math.max(0, persStartAge - target.currentAge);

  // Map each account to its pension category (only pension-bearing ones).
  const acctCategory = new Map<string, PensionCategory>();
  for (const a of accounts) {
    if (a.memberId !== target.memberId) continue;
    const cat = classifyPensionAccount(a);
    if (cat) acctCategory.set(a.id, cat);
  }

  const events: ProgressEvent[] = [];
  for (const t of transactions) {
    if (t.type !== 'buy') continue;
    const cat = acctCategory.get(t.accountId);
    if (cat !== 'corporate' && cat !== 'personal') continue;

    // Prefer the recorded `amount`; fall back to qty × price × FX when the
    // recorded amount is missing or 0 (older inject paths). FX uses the
    // asset's currency; if we can't resolve, assume KRW.
    let contribKrw = t.amount;
    if (!contribKrw || contribKrw === 0) {
      const asset = t.symbol ? marketAsset(t.symbol) : undefined;
      const fx = asset?.currency === 'USD' ? fxUsdKrw : 1;
      contribKrw = (t.quantity ?? 0) * (t.price ?? 0) * fx;
    }
    if (contribKrw <= 0) continue;

    const date = txDate(t);
    if (!date) continue;
    const txYear = Number(date.slice(0, 4));
    const retireYear = cat === 'corporate' ? corpRetireYear : persRetireYear;
    const yearsToReceipt = Math.max(0, retireYear - txYear);
    const rate = cat === 'corporate' ? corpRate : persRate;
    const payoutYears = cat === 'corporate' ? corpYears : persYears;
    const fv = futureValue(contribKrw, rate, yearsToReceipt);
    const grossMonthly = annuityMonthly(fv, rate, payoutYears);
    const startAgeForTax = cat === 'corporate' ? corpStartAge : persStartAge;
    const net = applyAnnuityTax(grossMonthly, cat, startAgeForTax);

    events.push({
      date,
      category: cat,
      contribKrw,
      monthlyAtRetirement: net,
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date));

  const inflationOn = target.inflationAdjustEnabled ?? true;
  const inflationRate = inflationOn ? target.inflationRate ?? 0.025 : 0;
  // For the goal line, use whichever receipt year comes first among enabled
  // streams — that's the earliest meaningful comparison point.
  const enabledStarts: number[] = [];
  if (target.publicEnabled) enabledStarts.push((target.publicStartAge ?? 65));
  if (target.corporateEnabled) enabledStarts.push(corpStartAge);
  if (target.personalEnabled) enabledStarts.push(persStartAge);
  const earliestStartAge =
    enabledStarts.length > 0 ? Math.min(...enabledStarts) : target.targetAge;
  const yearsToTarget = Math.max(0, earliestStartAge - target.currentAge);
  const targetMonthlyAtRetirement = inflatedTarget(
    target.targetMonthly,
    inflationRate,
    yearsToTarget,
  );

  const earliestYear =
    events.length > 0 ? Number(events[0].date.slice(0, 4)) : todayYear;
  const retirementYear = todayYear + yearsToTarget;
  const birthYear = todayYear - target.currentAge;
  const todayFraction = yearFraction(todayDate.toISOString().slice(0, 10));

  const publicEnabled = target.publicEnabled === true;
  const publicStartAge = target.publicStartAge ?? 65;
  const publicMonthlyGross = target.publicMonthly ?? 0;
  const publicMonthlyNet = publicEnabled
    ? applyAnnuityTax(publicMonthlyGross, 'public', publicStartAge)
    : 0;

  return {
    events,
    corpRate,
    corpPayoutYears: corpYears,
    corpStartAge,
    persRate,
    persPayoutYears: persYears,
    persStartAge,
    publicMonthlyNet,
    publicStartAge,
    publicEnabled,
    todayFraction,
    targetMonthlyAtRetirement,
    retirementYear,
    todayYear,
    earliestYear,
    birthYear,
  };
}
