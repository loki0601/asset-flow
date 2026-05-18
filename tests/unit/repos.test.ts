import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore, setStorage } from '@/lib/storage';
import { accountsRepo, holdingsRepo, loansRepo } from '@/lib/repos';
import type { Account } from '@/lib/schema';

beforeEach(() => {
  setStorage(new MemoryStore());
});

const acc = (id: string, userId: string, overrides: Partial<Account> = {}): Account => ({
  id,
  userId,
  memberId: 'm1',
  type: '한국증권',
  institution: '키움증권',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('accountsRepo.list', () => {
  it('returns empty array for new user', () => {
    expect(accountsRepo.list('u1')).toEqual([]);
  });
});

describe('accountsRepo.add', () => {
  it('persists the item and returns it via list', () => {
    accountsRepo.add('u1', acc('a1', 'u1'));
    expect(accountsRepo.list('u1')).toHaveLength(1);
    expect(accountsRepo.list('u1')[0].id).toBe('a1');
  });

  it('keeps users isolated', () => {
    accountsRepo.add('u1', acc('a1', 'u1'));
    accountsRepo.add('u2', acc('a2', 'u2'));
    expect(accountsRepo.list('u1').map((x) => x.id)).toEqual(['a1']);
    expect(accountsRepo.list('u2').map((x) => x.id)).toEqual(['a2']);
  });
});

describe('accountsRepo.get', () => {
  it('returns the matching item', () => {
    accountsRepo.add('u1', acc('a1', 'u1', { institution: 'X' }));
    expect(accountsRepo.get('u1', 'a1')?.institution).toBe('X');
  });

  it('returns undefined when not found', () => {
    expect(accountsRepo.get('u1', 'missing')).toBeUndefined();
  });
});

describe('accountsRepo.update', () => {
  it('patches matching item only', () => {
    accountsRepo.add('u1', acc('a1', 'u1'));
    accountsRepo.add('u1', acc('a2', 'u1'));
    accountsRepo.update('u1', 'a1', { institution: 'NH' });
    expect(accountsRepo.get('u1', 'a1')?.institution).toBe('NH');
    expect(accountsRepo.get('u1', 'a2')?.institution).toBe('키움증권');
  });
});

describe('accountsRepo.remove', () => {
  it('filters the item out', () => {
    accountsRepo.add('u1', acc('a1', 'u1'));
    accountsRepo.add('u1', acc('a2', 'u1'));
    accountsRepo.remove('u1', 'a1');
    expect(accountsRepo.list('u1').map((x) => x.id)).toEqual(['a2']);
  });
});

describe('repo factory provides all entity repos', () => {
  it('exposes holdingsRepo and loansRepo as well', () => {
    expect(typeof holdingsRepo.list).toBe('function');
    expect(typeof loansRepo.list).toBe('function');
  });
});
