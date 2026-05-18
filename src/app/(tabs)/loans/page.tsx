'use client';

import { useEffect, useState } from 'react';
import { HandCoins } from 'lucide-react';
import type { Loan } from '@/lib/schema';
import { loansRepo } from '@/lib/repos';
import { LoanSummaryCard } from '@/features/loans/LoanSummaryCard';
import { LoanAccountCard } from '@/features/loans/LoanAccountCard';
import { EmptyState } from '@/components/EmptyState';
import { useCurrentUserId } from '@/components/AuthProvider';

export default function LoansPage() {
  const userId = useCurrentUserId();
  const [loans, setLoans] = useState<Loan[]>([]);

  useEffect(() => {
    if (!userId) return;
    setLoans(loansRepo.list(userId));
  }, [userId]);

  return (
    <div className="pb-10">
      <p className="px-2 text-brand-sage text-[10px] font-bold uppercase tracking-[0.2em] mb-2">
        Total Debts
      </p>
      <LoanSummaryCard />

      <div className="flex justify-between items-end mb-4 mt-6 px-2">
        <h3 className="text-lg font-black italic text-brand-ink tracking-tight">Loan Accounts</h3>
      </div>

      {loans.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="등록된 대출이 없어요"
          description="설정 → 대출 관리에서 추가하세요."
        />
      ) : (
        <div className="space-y-5">
          {loans.map((loan) => (
            <LoanAccountCard key={loan.id} loan={loan} />
          ))}
        </div>
      )}
    </div>
  );
}
