/**
 * Per-user data schema (stored in client-only key-value store).
 * See docs/schema.md for the full design.
 */

export const SCHEMA_VERSION = 1;

// ─── Auth ───────────────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: string;
}

export interface Session {
  currentUserId: string | null;
}

export interface UserProfile {
  userId: string;
  displayName: string;
  tier?: string;
}

export interface UserSettings {
  userId: string;
  notifications: boolean;
  aggregateHoldings: boolean;
  theme: 'light' | 'dark';
}

// ─── Family ─────────────────────────────────────────────────────────────

export interface FamilyMember {
  id: string;
  userId: string;
  name: string;
  /** YYYY (4-digit). Optional — used by the retirement page to compute
   *  current age + 국민연금 수령 개시일. Members without a birth year skip
   *  age-dependent annuity tax bands and default to the user-entered
   *  currentAge instead. */
  birthYear?: number;
  createdAt: string;
}

// ─── Account & Holding ──────────────────────────────────────────────────

/**
 * Asset category — the single classification axis for catalog entries and
 * portfolio filtering. Each account's allowed categories are derived from
 * the institution it belongs to (see lib/institutions.ts).
 */
export type AccountType =
  | '국내증권'
  | '미국증권'
  | '가상자산'
  | '금';

export const ACCOUNT_TYPES: AccountType[] = [
  '국내증권',
  '미국증권',
  '가상자산',
  '금',
];

export interface Account {
  id: string;
  userId: string;
  memberId: string;
  /** Canonical institution name from INSTITUTIONS in lib/institutions.ts. */
  institution: string;
  /** User-given account nickname (e.g. "메인", "ISA", "장기투자"). */
  name: string;
  createdAt: string;
}

export interface Holding {
  id: string;
  userId: string;
  accountId: string;
  symbol: string;
  quantity: number;
  avgPrice: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Transaction ───────────────────────────────────────────────────────

export type TransactionType = 'buy' | 'sell' | 'deposit' | 'withdraw' | 'dividend';

export interface Transaction {
  id: string;
  userId: string;
  accountId: string;
  symbol?: string;
  type: TransactionType;
  quantity?: number;
  price?: number;
  amount: number;
  fee?: number;
  /** Average purchase price at the moment of a sell (native currency),
   *  snapshotted so the 거래 이력 can show realized P&L. Only set on 'sell'
   *  transactions recorded after the feature shipped — older sells lack it. */
  avgCostAtSale?: number;
  occurredAt: string;
  memo?: string;
}

// ─── Loan ──────────────────────────────────────────────────────────────

export type LoanMethod = '원리금균등상환' | '원금균등상환' | '만기일시상환';
export type LoanStatus = '상환 중' | '완료' | '연체';

export interface Loan {
  id: string;
  userId: string;
  memberId: string;
  name: string;
  bank: string;
  totalAmount: number;
  remainingAmount: number;
  /** Cumulative manual repayments (extra principal paid via the 상환 button),
   *  subtracted from the contract-derived balance. Absent on older loans → 0. */
  repaid?: number;
  method: LoanMethod;
  rate: number;
  startDate: string;
  maturityDate: string;
  paymentDay: number;
  monthlyEst: number;
  status: LoanStatus;
  createdAt: string;
}

// ─── Pension ───────────────────────────────────────────────────────────

export type PensionCategory = 'public' | 'corporate' | 'personal';

interface PensionBase {
  id: string;
  userId: string;
  memberId: string;
  category: PensionCategory;
  type: string;
  title: string;
  institution?: string;
  createdAt: string;
}

export interface PublicPension extends PensionBase {
  category: 'public';
  monthlyAmount: number;
  payPeriod: string;
  startYear: string;
}

export interface CorporatePension extends PensionBase {
  category: 'corporate';
  totalValue: number;
  yield: number;
}

export interface PersonalPension extends PensionBase {
  category: 'personal';
  totalValue: number;
  annualContribution: number;
  taxBenefit: number;
}

export type Pension = PublicPension | CorporatePension | PersonalPension;

// ─── Retirement target ────────────────────────────────────────────────

export interface RetirementTarget {
  id: string;
  userId: string;
  memberId: string;
  targetAge: number;
  currentAge: number;
  /** Today's-purchasing-power monthly income goal (₩). When
   *  `inflationAdjustEnabled` is true the retirement page bumps this by
   *  `inflationRate` per year between now and the receipt age so the goal
   *  line is comparable to the *future* nominal pension stream. */
  targetMonthly: number;

  // Each pension type is independently opt-in. Setting `*Enabled` to true is
  // the only way it shows up on the retirement page; default values for the
  // other fields are previewed in the form but ignored if the toggle is off.

  // ─── Public pension (국민연금) — manual ────────────────────────────────
  publicEnabled?: boolean;
  /** User-entered monthly amount from the NPS "예상연금 조회" page. */
  publicMonthly?: number;
  publicStartAge?: number; // default 65

  // ─── Corporate pension (DC/DB only — IRP is treated as personal) ──────
  corporateEnabled?: boolean;
  corporateStartAge?: number; // default 55
  corporateYears?: number; // default 10
  corporateAnnualRate?: number; // default 0.04 (4%)

  // ─── Personal pension (연금저축 + IRP) ─────────────────────────────────
  personalEnabled?: boolean;
  personalStartAge?: number; // default 55
  personalYears?: number; // default 20
  personalAnnualRate?: number; // default 0.04

  // ─── Inflation adjustment toggle ──────────────────────────────────────
  /** When true, the retirement page compares pension projections against
   *  `targetMonthly × (1 + inflationRate)^yearsAhead` — i.e. the goal is
   *  expressed in today's purchasing power and grown to future nominal
   *  KRW at receipt date. */
  inflationAdjustEnabled?: boolean; // default true
  inflationRate?: number; // default 0.025 (2.5%/yr)
}

/**
 * UI projection of a member's (or aggregate) retirement plan.
 * Derived from RetirementTarget + Pension; not stored as a single row.
 */
export interface RetirementProfile {
  name: string;
  targetAge: number;
  currentAge: number;
  targetMonthly: number;
  expectedMonthly: number;
  pensions: Pension[];
}

// ─── Asset (server-provided market data) ──────────────────────────────

/** Asset category mirrors AccountType — every asset lives in exactly one
 *  matching account-type bucket. */
export type AssetCategory = AccountType;

export interface MarketAsset {
  symbol: string;
  name: string;
  /** Optional Korean alias for foreign assets — e.g. "애플" for Apple Inc.
   *  Server-managed; clients prefer this over `name` when present so US
   *  stocks/ETFs display naturally in Korean UI without hardcoding on the
   *  client. Empty / missing → fall back to `name`. */
  nameKo?: string;
  category: AssetCategory;
  currency: 'KRW' | 'USD';
  currentPrice: number;
  dailyChange: number;
  dailyChangePct: number;
  /**
   * When true, the asset is removed from new-purchase pickers but existing
   * holdings keep displaying it (as "단종" / deprecated). Server sets this
   * via UPDATE migrations.
   */
  deprecated?: boolean;
  updatedAt: string;
}

/**
 * Server-issued change instruction for the catalog. Clients apply these in
 * order to keep their local mirror + user data consistent with the server.
 * See docs/schema.md §6.
 */
export type CatalogMigrationOp =
  | { kind: 'noop' }
  | { kind: 'rename_symbol'; from: string; to: string }
  | { kind: 'deprecate'; symbol: string }
  | { kind: 'split'; symbol: string; ratio: number }
  | { kind: 'merge'; from: string; to: string; ratio: number };

export interface CatalogMigration {
  version: string;
  appliedAt: string;
  op: CatalogMigrationOp;
}

export interface CatalogResponse {
  version: string;
  assets: MarketAsset[];
  migrations: CatalogMigration[];
}

export type TimeRange = '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';

export interface PriceHistory {
  symbol: string;
  range: TimeRange;
  points: number[];
}
