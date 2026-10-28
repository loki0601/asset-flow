import { createId } from '@paralleldrive/cuid2';
import {
  accountsRepo,
  familyRepo,
  holdingsRepo,
  loansRepo,
  retirementTargetsRepo,
  transactionsRepo,
} from '@/lib/repos';
import { reverseTrade } from '@/lib/trade';

export type DeleteTransactionResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'insufficient-quantity' };

/** Delete a trade and roll its account's holding back to the pre-trade position. */
export function deleteTransaction(userId: string, txId: string): DeleteTransactionResult {
  const tx = transactionsRepo.list(userId).find((t) => t.id === txId);
  if (!tx) return { ok: false, reason: 'not-found' };

  if ((tx.type === 'buy' || tx.type === 'sell') && tx.symbol && tx.quantity) {
    const holding =
      holdingsRepo.list(userId).find((h) => h.accountId === tx.accountId && h.symbol === tx.symbol) ?? null;
    const result = reverseTrade(holding, {
      type: tx.type,
      quantity: tx.quantity,
      price: tx.price ?? 0,
      avgCostAtSale: tx.avgCostAtSale,
    });
    if (!result.ok) return result;

    const now = new Date().toISOString();
    if (result.quantity === 0) {
      if (holding) holdingsRepo.remove(userId, holding.id);
    } else if (holding) {
      holdingsRepo.update(userId, holding.id, { quantity: result.quantity, avgPrice: result.avgPrice, updatedAt: now });
    } else {
      holdingsRepo.add(userId, {
        id: createId(),
        userId,
        accountId: tx.accountId,
        symbol: tx.symbol,
        quantity: result.quantity,
        avgPrice: result.avgPrice,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  transactionsRepo.remove(userId, txId);
  return { ok: true };
}

export type DeleteAccountResult = { ok: true } | { ok: false; reason: 'has-holdings' };

export function deleteAccount(userId: string, accountId: string): DeleteAccountResult {
  if (holdingsRepo.list(userId).some((h) => h.accountId === accountId)) {
    return { ok: false, reason: 'has-holdings' };
  }
  for (const t of transactionsRepo.list(userId)) {
    if (t.accountId === accountId) transactionsRepo.remove(userId, t.id);
  }
  accountsRepo.remove(userId, accountId);
  return { ok: true };
}

export type DeleteMemberResult =
  | { ok: true }
  | { ok: false; reason: 'has-accounts' | 'has-loans' | 'last-member' };

export function deleteMember(userId: string, memberId: string): DeleteMemberResult {
  if (accountsRepo.list(userId).some((a) => a.memberId === memberId)) return { ok: false, reason: 'has-accounts' };
  if (loansRepo.list(userId).some((l) => l.memberId === memberId)) return { ok: false, reason: 'has-loans' };
  if (familyRepo.list(userId).length <= 1) return { ok: false, reason: 'last-member' };
  for (const r of retirementTargetsRepo.list(userId)) {
    if (r.memberId === memberId) retirementTargetsRepo.remove(userId, r.id);
  }
  familyRepo.remove(userId, memberId);
  return { ok: true };
}
