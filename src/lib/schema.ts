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
  targetMonthly: number;
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
