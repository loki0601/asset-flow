'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createId } from '@paralleldrive/cuid2';
import { ChevronLeft, CreditCard, Bitcoin, Landmark, Plus } from 'lucide-react';
import type { Account, FamilyMember } from '@/lib/schema';
import { accountsRepo, familyRepo } from '@/lib/repos';
import { formatKRW } from '@/lib/loans';
import { useCurrentUserId } from '@/components/AuthProvider';
import { AddAccountModal, type AddAccountInput } from '@/features/accounts/AddAccountModal';
import { EmptyState } from '@/components/EmptyState';
import { institutionKind } from '@/lib/institutions';

function iconFor(institutionName: string) {
  const kind = institutionKind(institutionName);
  if (kind === '코인거래소') return <Bitcoin size={20} />;
  if (kind === '연금기관') return <Landmark size={20} />;
  return <CreditCard size={20} />;
}

export default function AccountsPage() {
  const userId = useCurrentUserId();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setAccounts(accountsRepo.list(userId));
    setMembers(familyRepo.list(userId));
  }, [userId]);

  const membersById = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m] as const)),
    [members],
  );

  // Two-level grouping: 사람 → 증권사 → 계좌. Keeps each brokerage as its
  // own visual cluster so accounts with the same name (e.g. "국내주식" at
  // KB증권 and 삼성증권) are obviously distinct.
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, Account[]>>();
    for (const a of accounts) {
      const owner = membersById[a.memberId]?.name ?? '미지정';
      if (!map.has(owner)) map.set(owner, new Map());
      const byInst = map.get(owner)!;
      if (!byInst.has(a.institution)) byInst.set(a.institution, []);
      byInst.get(a.institution)!.push(a);
    }
    return map;
  }, [accounts, membersById]);

  function handleAdd(input: AddAccountInput) {
    if (!userId) return;
    const account: Account = {
      id: createId(),
      userId,
      memberId: input.memberId,
      institution: input.institution,
      name: input.name,
      createdAt: new Date().toISOString(),
    };
    accountsRepo.add(userId, account);
    setAccounts(accountsRepo.list(userId));
  }

  return (
    <div className="pb-10">
      <div className="flex items-center gap-2 mb-4 px-2">
        <Link
          href="/settings"
          className="w-9 h-9 rounded-full bg-white border border-gray-100 flex items-center justify-center text-brand-sage"
          aria-label="뒤로"
        >
          <ChevronLeft size={20} />
        </Link>
        <div>
          <p className="text-brand-sage text-[10px] font-bold uppercase tracking-[0.2em]">Accounts</p>
          <h1 className="text-2xl font-black text-brand-ink tracking-tight">계좌 관리</h1>
        </div>
      </div>

      {accounts.length === 0 && (
        <div className="mb-4">
          <EmptyState
            icon={CreditCard}
            title="등록된 계좌가 없어요"
            description="아래 + 계좌 추가로 첫 계좌를 등록하세요."
          />
        </div>
      )}

      {Array.from(grouped.entries()).map(([owner, byInst]) => {
        const total = Array.from(byInst.values()).reduce((s, l) => s + l.length, 0);
        return (
          <section key={owner} className="mb-8">
            <div className="flex justify-between items-baseline px-2 mb-3">
              <h3 className="text-lg font-black italic text-brand-ink">{owner}</h3>
              <span className="text-[11px] font-bold text-brand-sage tabular-nums">
                {total}개 계좌
              </span>
            </div>
            {Array.from(byInst.entries()).map(([institution, list]) => (
              <div key={institution} className="mb-4">
                <p className="text-[11px] font-bold text-brand-sage uppercase tracking-tighter px-3 mb-2">
                  {institution}
                </p>
                <div className="space-y-2">
                  {list.map((acc) => (
                    <div
                      key={acc.id}
                      className="bg-white rounded-[24px] border border-gray-100 p-5 flex items-center gap-3 shadow-sm"
                    >
                      <div className="w-10 h-10 bg-brand-surface rounded-2xl flex items-center justify-center text-brand shrink-0">
                        {iconFor(acc.institution)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-brand-ink truncate">{acc.name}</p>
                      </div>
                      <p className="text-sm font-black text-brand-ink tabular-nums shrink-0">
                        {formatKRW(0)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        );
      })}

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="w-full bg-brand text-white rounded-[24px] py-4 flex items-center justify-center gap-2 font-black text-sm shadow-md shadow-brand/20 mt-4"
      >
        <Plus size={18} /> 계좌 추가
      </button>

      <AddAccountModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        members={members}
        onSubmit={handleAdd}
      />
    </div>
  );
}
