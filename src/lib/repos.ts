import { readJSON, userKey, writeJSON } from '@/lib/storage';
import type {
  Account,
  FamilyMember,
  Holding,
  Loan,
  Pension,
  RetirementTarget,
  Transaction,
} from '@/lib/schema';

interface CollectionRepo<T extends { id: string }> {
  list(userId: string): T[];
  get(userId: string, id: string): T | undefined;
  add(userId: string, item: T): void;
  update(userId: string, id: string, patch: Partial<T>): void;
  remove(userId: string, id: string): void;
  replaceAll(userId: string, items: T[]): void;
}

/**
 * Build a CRUD repo backed by user-scoped JSON in the storage layer.
 * One file → one `assetflow:user:{userId}:{collection}` key.
 */
function createCollectionRepo<T extends { id: string }>(collection: string): CollectionRepo<T> {
  const key = (userId: string) => userKey(userId, collection);
  return {
    list(userId) {
      return readJSON<T[]>(key(userId), []);
    },
    get(userId, id) {
      return this.list(userId).find((x) => x.id === id);
    },
    add(userId, item) {
      writeJSON<T[]>(key(userId), [...this.list(userId), item]);
    },
    update(userId, id, patch) {
      writeJSON<T[]>(
        key(userId),
        this.list(userId).map((x) => (x.id === id ? { ...x, ...patch } : x)),
      );
    },
    remove(userId, id) {
      writeJSON<T[]>(
        key(userId),
        this.list(userId).filter((x) => x.id !== id),
      );
    },
    replaceAll(userId, items) {
      writeJSON<T[]>(key(userId), items);
    },
  };
}

export const familyRepo = createCollectionRepo<FamilyMember>('members');
export const accountsRepo = createCollectionRepo<Account>('accounts');
export const holdingsRepo = createCollectionRepo<Holding>('holdings');
export const transactionsRepo = createCollectionRepo<Transaction>('transactions');
export const loansRepo = createCollectionRepo<Loan>('loans');
export const pensionsRepo = createCollectionRepo<Pension>('pensions');
export const retirementTargetsRepo = createCollectionRepo<RetirementTarget>('retirementTargets');
