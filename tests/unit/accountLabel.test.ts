import { describe, it, expect } from 'vitest';
import { accountOwnerLabel } from '@/lib/accountLabel';
import type { Account, FamilyMember } from '@/lib/schema';

const acc: Account = {
  id: 'a1',
  userId: 'u1',
  memberId: 'm1',
  institution: '삼성증권',
  name: '메인',
  createdAt: '',
};

const member: FamilyMember = {
  id: 'm1',
  userId: 'u1',
  name: '김영록',
  createdAt: '',
};

describe('accountOwnerLabel', () => {
  it('renders owner · institution name', () => {
    expect(accountOwnerLabel(acc, member)).toBe('김영록 · 삼성증권 메인');
  });

  it('omits the owner when the member is unknown', () => {
    expect(accountOwnerLabel(acc, undefined)).toBe('삼성증권 메인');
  });

  it('falls back when the account is unknown', () => {
    expect(accountOwnerLabel(undefined, undefined)).toBe('계좌 미지정');
  });
});
