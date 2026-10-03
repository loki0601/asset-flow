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

/** Settings profile card: first family member's name, with the server
 *  account id underneath (the name falls back to the id while members load). */
export function profileLabel(
  memberName: string | undefined,
  username: string,
): { name: string; subtitle: string } {
  const name = memberName?.trim() ? memberName.trim() : username;
  return { name, subtitle: username };
}
