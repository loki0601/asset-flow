/**
 * Predefined institutions (브로커리지, IRP 운용사, 보험사, 코인거래소).
 * Source of truth for the AddAccount picker — choosing one of these decides
 * which asset categories the account can hold.
 *
 * Add new entries here. The catalog migration system handles symbol-level
 * changes, but the institution list is part of the client bundle and
 * doesn't require versioned migration (additive only).
 */

import type { AssetCategory } from '@/lib/schema';

export type InstitutionKind = '증권사' | '연금기관' | '코인거래소';

export interface Institution {
  /** Canonical display name. Stored verbatim on Account.institution. */
  name: string;
  kind: InstitutionKind;
  /** Asset categories this institution can hold. */
  supports: AssetCategory[];
}

const STOCKS: AssetCategory[] = ['국내증권', '미국증권', '금'];
// 연금기관 계좌(IRP/연금보험)는 ETF·펀드 형태로 국내 상장 상품에 투자한다.
// 자산 카테고리 측면에선 일반 국내증권과 동일.
const PENSION: AssetCategory[] = ['국내증권'];
const CRYPTO: AssetCategory[] = ['가상자산'];

export const INSTITUTIONS: Institution[] = [
  // ─── 증권사 (general brokerage — handles 국내/미국 주식·ETF, 금 ETF) ───
  { name: '키움증권', kind: '증권사', supports: STOCKS },
  { name: '한국투자증권', kind: '증권사', supports: STOCKS },
  { name: '미래에셋증권', kind: '증권사', supports: STOCKS },
  { name: 'NH투자증권', kind: '증권사', supports: STOCKS },
  { name: '삼성증권', kind: '증권사', supports: STOCKS },
  { name: 'KB증권', kind: '증권사', supports: STOCKS },
  { name: '신한투자증권', kind: '증권사', supports: STOCKS },
  { name: '하나증권', kind: '증권사', supports: STOCKS },
  { name: '대신증권', kind: '증권사', supports: STOCKS },
  { name: '유안타증권', kind: '증권사', supports: STOCKS },
  { name: '메리츠증권', kind: '증권사', supports: STOCKS },
  { name: 'IBK투자증권', kind: '증권사', supports: STOCKS },
  { name: '한화투자증권', kind: '증권사', supports: STOCKS },
  { name: 'DB금융투자', kind: '증권사', supports: STOCKS },
  { name: 'SK증권', kind: '증권사', supports: STOCKS },
  { name: '토스증권', kind: '증권사', supports: STOCKS },
  { name: '카카오페이증권', kind: '증권사', supports: STOCKS },
  { name: '다올투자증권', kind: '증권사', supports: STOCKS },
  { name: '신영증권', kind: '증권사', supports: STOCKS },
  { name: '현대차증권', kind: '증권사', supports: STOCKS },
  { name: '부국증권', kind: '증권사', supports: STOCKS },
  { name: '유진투자증권', kind: '증권사', supports: STOCKS },
  { name: '하이투자증권', kind: '증권사', supports: STOCKS },
  { name: '이베스트투자증권', kind: '증권사', supports: STOCKS },
  { name: '흥국증권', kind: '증권사', supports: STOCKS },

  // ─── 연금기관 (IRP service at brokerages + 보험사 연금) ────────────────
  { name: '미래에셋증권 IRP', kind: '연금기관', supports: PENSION },
  { name: '한국투자증권 IRP', kind: '연금기관', supports: PENSION },
  { name: '삼성증권 IRP', kind: '연금기관', supports: PENSION },
  { name: 'NH투자증권 IRP', kind: '연금기관', supports: PENSION },
  { name: 'KB증권 IRP', kind: '연금기관', supports: PENSION },
  { name: '신한투자증권 IRP', kind: '연금기관', supports: PENSION },
  { name: '하나증권 IRP', kind: '연금기관', supports: PENSION },
  { name: '삼성생명', kind: '연금기관', supports: PENSION },
  { name: '교보생명', kind: '연금기관', supports: PENSION },
  { name: '한화생명', kind: '연금기관', supports: PENSION },
  { name: '신한라이프', kind: '연금기관', supports: PENSION },
  { name: 'KB라이프', kind: '연금기관', supports: PENSION },

  // ─── 코인거래소 ───────────────────────────────────────────────────
  { name: '업비트', kind: '코인거래소', supports: CRYPTO },
  { name: '빗썸', kind: '코인거래소', supports: CRYPTO },
];

export function getInstitution(name: string): Institution | undefined {
  return INSTITUTIONS.find((i) => i.name === name);
}

export function institutionKind(name: string): InstitutionKind | undefined {
  return getInstitution(name)?.kind;
}

export function institutionSupports(name: string, category: AssetCategory): boolean {
  return getInstitution(name)?.supports.includes(category) ?? false;
}

export function listInstitutionsByKind(kind: InstitutionKind): Institution[] {
  return INSTITUTIONS.filter((i) => i.kind === kind);
}
