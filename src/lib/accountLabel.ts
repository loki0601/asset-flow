import type { Account, FamilyMember } from '@/lib/schema';

/**
 * Human label for an account including its owner: "김영록 · 삼성증권 메인".
 * Owner and account used to be shown only fused inside dropdown lines —
 * this is the shared formatter for cards / detail modal / trade form so the
 * pairing renders consistently everywhere.
 */
export function accountOwnerLabel(
  account: Account | undefined,
  member: FamilyMember | undefined,
): string {
  if (!account) return '계좌 미지정';
  const owner = member ? `${member.name} · ` : '';
  return `${owner}${account.institution} ${account.name}`;
}
