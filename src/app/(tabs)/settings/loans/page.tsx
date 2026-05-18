'use client';

import { useEffect, useMemo, useState } from 'react';
import { createId } from '@paralleldrive/cuid2';
import { Plus, Trash2, HandCoins, CreditCard } from 'lucide-react';
import type { FamilyMember, Loan } from '@/lib/schema';
import { familyRepo, loansRepo } from '@/lib/repos';
import { useCurrentUserId } from '@/components/AuthProvider';
import { ManageHeader } from '@/components/ManageHeader';
import { EmptyState } from '@/components/EmptyState';
import { AddLoanModal, type AddLoanInput } from '@/features/loans/AddLoanModal';
import { formatKRW, currentLoanBalance } from '@/lib/loans';

export default function LoansManagePage() {
  const userId = useCurrentUserId();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoans(loansRepo.list(userId));
    setMembers(familyRepo.list(userId));
  }, [userId]);

  const membersById = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m] as const)),
    [members],
  );

  function handleAdd(input: AddLoanInput) {
    if (!userId) return;
    const loan: Loan = {
      id: createId(),
      userId,
      memberId: input.memberId,
      name: input.name,
      bank: input.bank,
      totalAmount: input.totalAmount,
      remainingAmount: input.remainingAmount,
      method: input.method,
      rate: input.rate,
      startDate: input.startDate,
      maturityDate: input.maturityDate,
      paymentDay: input.paymentDay,
      monthlyEst: input.monthlyEst,
      status: '상환 중',
      createdAt: new Date().toISOString(),
    };
    loansRepo.add(userId, loan);
    setLoans(loansRepo.list(userId));
  }

  function handleRemove(id: string) {
    if (!userId) return;
    loansRepo.remove(userId, id);
    setLoans(loansRepo.list(userId));
  }

  return (
    <div className="pb-10">
      <ManageHeader label="Loans" title="대출 관리" />

      {loans.length === 0 ? (
        <div className="mb-4">
          <EmptyState
            icon={HandCoins}
            title="등록된 대출이 없어요"
            description="아래 + 대출 추가로 첫 대출을 등록하세요."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {loans.map((loan) => (
            <div
              key={loan.id}
              className="bg-white rounded-[24px] border border-gray-100 p-5 flex items-center gap-3 shadow-sm"
            >
              <div className="w-10 h-10 bg-brand-surface rounded-2xl flex items-center justify-center text-brand shrink-0">
                <CreditCard size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-brand-sage uppercase tracking-tighter truncate">
                  {loan.bank} · {membersById[loan.memberId]?.name ?? '?'}
                </p>
                <p className="text-sm font-black text-brand-ink truncate">{loan.name}</p>
              </div>
              <p className="text-sm font-black text-brand-ink tabular-nums shrink-0">
                {formatKRW(Math.round(currentLoanBalance(loan)))}
              </p>
              <button
                onClick={() => handleRemove(loan.id)}
                className="w-9 h-9 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center shrink-0"
                aria-label="삭제"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="w-full bg-brand text-white rounded-[24px] py-4 flex items-center justify-center gap-2 font-black text-sm shadow-md shadow-brand/20 mt-4"
      >
        <Plus size={18} /> 대출 추가
      </button>

      <AddLoanModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        members={members}
        onSubmit={handleAdd}
      />
    </div>
  );
}
