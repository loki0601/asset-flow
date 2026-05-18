'use client';

import { useEffect, useMemo, useState } from 'react';
import { FamilyFilter } from '@/features/dashboard/FamilyFilter';
import { HeroBalance } from '@/features/dashboard/HeroBalance';
import { FlowChart } from '@/features/dashboard/FlowChart';
import { HoldingsList } from '@/features/dashboard/HoldingsList';
import type { Account, FamilyMember } from '@/lib/schema';
import { accountsRepo, familyRepo } from '@/lib/repos';
import { useCurrentUserId } from '@/components/AuthProvider';

export default function DashboardPage() {
  const userId = useCurrentUserId();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [family, setFamily] = useState<string | 'all'>('all');
  const [account, setAccount] = useState<string | 'all'>('all');

  useEffect(() => {
    if (!userId) return;
    setMembers(familyRepo.list(userId));
    setAccounts(accountsRepo.list(userId));
  }, [userId]);

  // Member 전환 시 계좌 필터는 초기화 — 이전 멤버의 계좌가 살아남으면
  // 새 멤버 화면이 빈 상태로 보여 혼란스럽다.
  function handleFamilyChange(next: string | 'all') {
    setFamily(next);
    setAccount('all');
  }

  const memberAccounts = useMemo(
    () => (family === 'all' ? [] : accounts.filter((a) => a.memberId === family)),
    [family, accounts],
  );

  return (
    <div className="flex flex-col gap-6 pb-10">
      <HeroBalance memberId={family} accountId={account} />
      <FlowChart memberId={family} accountId={account} />
      <FamilyFilter members={members} selected={family} onSelect={handleFamilyChange} />
      <HoldingsList
        memberId={family}
        accountId={account}
        memberAccounts={memberAccounts}
        onAccountChange={setAccount}
      />
    </div>
  );
}
