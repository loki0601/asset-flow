import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore, setStorage } from '@/lib/storage';
import {
  accountsRepo,
  familyRepo,
  holdingsRepo,
  loansRepo,
  retirementTargetsRepo,
  transactionsRepo,
} from '@/lib/repos';
import { deleteAccount, deleteMember, deleteTransaction } from '@/lib/ledgerOps';
import type { Account, FamilyMember, Holding, Loan, RetirementTarget, Transaction } from '@/lib/schema';

const U = 'u1';
const T0 = '2026-10-01T00:00:00.000Z';

const member = (id: string): FamilyMember => ({ id, userId: U, name: id, createdAt: T0 } as FamilyMember);
const account = (id: string, memberId = 'm1'): Account => ({
  id, userId: U, memberId, institution: '키움증권', name: id, createdAt: T0,
});
const holding = (quantity: number, avgPrice: number, accountId = 'a1'): Holding => ({
  id: 'h1', userId: U, accountId, symbol: 'NASDAQ:AAPL', quantity, avgPrice, createdAt: T0, updatedAt: T0,
});
const tx = (id: string, type: 'buy' | 'sell', quantity: number, price: number, extra: Partial<Transaction> = {}): Transaction => ({
  id, userId: U, accountId: 'a1', symbol: 'NASDAQ:AAPL', type, quantity, price,
  amount: quantity * price, occurredAt: T0, ...extra,
});

beforeEach(() => setStorage(new MemoryStore()));

describe('deleteTransaction', () => {
  it('removes a buy and rolls the holding back', () => {
    holdingsRepo.add(U, holding(15, (10 * 300 + 5 * 400) / 15));
    transactionsRepo.add(U, tx('b1', 'buy', 10, 300));
    transactionsRepo.add(U, tx('b2', 'buy', 5, 400));

    expect(deleteTransaction(U, 'b2')).toEqual({ ok: true });

    expect(transactionsRepo.list(U).map((t) => t.id)).toEqual(['b1']);
    expect(holdingsRepo.list(U)[0]).toMatchObject({ quantity: 10, avgPrice: expect.closeTo(300, 6) });
  });

  it('removes the holding when the only buy is deleted', () => {
    holdingsRepo.add(U, holding(10, 300));
    transactionsRepo.add(U, tx('b1', 'buy', 10, 300));

    expect(deleteTransaction(U, 'b1')).toEqual({ ok: true });
    expect(holdingsRepo.list(U)).toEqual([]);
  });

  it('restores the position when a full sell is deleted', () => {
    transactionsRepo.add(U, tx('b1', 'buy', 10, 300));
    transactionsRepo.add(U, tx('s1', 'sell', 10, 350, { avgCostAtSale: 300 }));

    expect(deleteTransaction(U, 's1')).toEqual({ ok: true });
    expect(holdingsRepo.list(U)).toEqual([
      expect.objectContaining({ accountId: 'a1', symbol: 'NASDAQ:AAPL', quantity: 10, avgPrice: 300 }),
    ]);
  });

  it('refuses to delete a buy whose shares were already sold', () => {
    holdingsRepo.add(U, holding(2, 300));
    transactionsRepo.add(U, tx('b1', 'buy', 10, 300));

    expect(deleteTransaction(U, 'b1')).toEqual({ ok: false, reason: 'insufficient-quantity' });
    expect(transactionsRepo.list(U)).toHaveLength(1);
    expect(holdingsRepo.list(U)[0].quantity).toBe(2);
  });

  it('reports a missing transaction', () => {
    expect(deleteTransaction(U, 'nope')).toEqual({ ok: false, reason: 'not-found' });
  });
});

describe('deleteAccount', () => {
  it('refuses while the account still holds positions', () => {
    accountsRepo.add(U, account('a1'));
    holdingsRepo.add(U, holding(1, 300));

    expect(deleteAccount(U, 'a1')).toEqual({ ok: false, reason: 'has-holdings' });
    expect(accountsRepo.list(U)).toHaveLength(1);
  });

  it('removes an empty account together with its trade history', () => {
    accountsRepo.add(U, account('a1'));
    accountsRepo.add(U, account('a2'));
    transactionsRepo.add(U, tx('b1', 'buy', 1, 300));
    transactionsRepo.add(U, tx('x1', 'buy', 1, 300, { accountId: 'a2' }));

    expect(deleteAccount(U, 'a1')).toEqual({ ok: true });
    expect(accountsRepo.list(U).map((a) => a.id)).toEqual(['a2']);
    expect(transactionsRepo.list(U).map((t) => t.id)).toEqual(['x1']);
  });
});

describe('deleteMember', () => {
  beforeEach(() => {
    familyRepo.add(U, member('m1'));
    familyRepo.add(U, member('m2'));
  });

  it('refuses while the member owns accounts', () => {
    accountsRepo.add(U, account('a1', 'm2'));
    expect(deleteMember(U, 'm2')).toEqual({ ok: false, reason: 'has-accounts' });
  });

  it('refuses while the member has loans', () => {
    loansRepo.add(U, { id: 'l1', userId: U, memberId: 'm2' } as Loan);
    expect(deleteMember(U, 'm2')).toEqual({ ok: false, reason: 'has-loans' });
  });

  it('refuses to delete the last member', () => {
    expect(deleteMember(U, 'm2')).toEqual({ ok: true });
    expect(deleteMember(U, 'm1')).toEqual({ ok: false, reason: 'last-member' });
  });

  it('removes the member and their retirement targets', () => {
    retirementTargetsRepo.add(U, { id: 'r1', userId: U, memberId: 'm2' } as RetirementTarget);
    retirementTargetsRepo.add(U, { id: 'r2', userId: U, memberId: 'm1' } as RetirementTarget);

    expect(deleteMember(U, 'm2')).toEqual({ ok: true });
    expect(familyRepo.list(U).map((m) => m.id)).toEqual(['m1']);
    expect(retirementTargetsRepo.list(U).map((r) => r.id)).toEqual(['r2']);
  });
});
